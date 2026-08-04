const Booking = require('./booking.model');
const ParkingSlot = require('../parkingSlots/parkingSlot.model');
const VehicleType = require('../vehicleTypes/vehicleType.model');
const Vehicle = require('../vehicles/vehicle.model');
const ParkingLot = require('../parkingLots/parkingLot.model');
const notificationService = require('../notifications/notification.service');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');
const { generateQRCode, suggestOptimalSlot, calculateParkingFee } = require('../../utils/helpers');
const { emitSlotUpdate } = require('../../sockets/socket.server');
const { toAbsoluteDateRange } = require('../../utils/dateUtils');

/**
 * Convert a booking's scheduledDate + startTime/endTime into absolute Date objects.
 * Handles cross-midnight bookings (endTime < startTime).
 * Uses UTC-safe conversion so results are identical on local (UTC+7) and deploy (UTC) servers.
 */
function bookingToAbsoluteTimes(booking) {
  return toAbsoluteDateRange(booking.scheduledDate, booking.startTime, booking.endTime);
}

/**
 * Check if two time intervals [s1, e1) and [s2, e2) overlap.
 * Touching at a boundary (e.g. 19:00 == 19:00) is NOT considered an overlap
 * so back-to-back bookings (15-19 then 19-23) are allowed.
 */
function intervalsOverlap(s1, e1, s2, e2) {
  return s1 < e2 && e1 > s2;
}

/**
 * How many milliseconds before the booking start time a customer is allowed
 * to check in early. Currently 15 minutes.
 */
const EARLY_CHECKIN_BUFFER_MS = 15 * 60 * 1000; // 15 minutes

/**
 * How many milliseconds after the booking end time are reserved for the car
 * to exit the parking lot. Currently 15 minutes.
 * This means User 2 can only book a slot starting 15 min after User 1's booking ends.
 */
const CHECKOUT_BUFFER_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Returns all conflicting approved/pending bookings for a given slot in a time range.
 *
 * The EFFECTIVE window of each existing booking is:
 *   [scheduledStart - EARLY_CHECKIN_BUFFER_MS,  scheduledEnd + CHECKOUT_BUFFER_MS]
 *
 * Example: User 1 books 19:00 → 23:00
 *   → effective window = 18:45 → 23:15
 *   → User 2 cannot start earlier than 23:15
 */
async function getConflictingBookings(slotId, wantedStart, wantedEnd, excludeBookingId = null) {
  const filter = {
    assignedSlot: slotId,
    status: { $in: ['pending', 'approved'] },
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };

  const existing = await Booking.find(filter);
  return existing.filter(b => {
    const { start, end } = bookingToAbsoluteTimes(b);
    const effectiveStart = new Date(start.getTime() - EARLY_CHECKIN_BUFFER_MS);
    const effectiveEnd = new Date(end.getTime() + CHECKOUT_BUFFER_MS);
    return intervalsOverlap(wantedStart, wantedEnd, effectiveStart, effectiveEnd);
  });
}

class BookingService {
  async getBookings(query, user) {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      status,
      parkingLot,
      userId,
      startDate,
      endDate,
    } = query;

    const filter = {};

    // Parking user can only see own bookings
    if (user.role === 'parking_user') {
      filter.user = user._id;
    } else if (userId) {
      filter.user = userId;
    }

    if (status) filter.status = status;
    if (parkingLot) filter.parkingLot = parkingLot;

    if (startDate || endDate) {
      filter.scheduledDate = {};
      if (startDate) filter.scheduledDate.$gte = new Date(startDate);
      if (endDate) filter.scheduledDate.$lte = new Date(endDate);
    }

    // Manager/Staff: filter by their assigned lot
    if (user.role === 'parking_manager' || user.role === 'parking_staff') {
      filter.parkingLot = user.assignedParkingLot;
    }

    return Pagination.paginate(Booking, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: Pagination.buildSort(sort),
      populate: [
        { path: 'user', select: 'fullName email phone avatar' },
        { path: 'parkingLot', select: 'name code address' },
        { path: 'floor', select: 'name floorNumber' },
        { path: 'zone', select: 'name code' },
        { path: 'assignedSlot', select: 'slotCode' },
        { path: 'vehicleType', select: 'name code icon pricing' },
      ],
    });
  }

  async getById(id, user) {
    const booking = await Booking.findById(id)
      .populate('user', 'fullName email phone')
      .populate('parkingLot', 'name code address operatingHours')
      .populate('floor', 'name floorNumber')
      .populate('zone', 'name code')
      .populate('assignedSlot', 'slotCode position features status')
      .populate('vehicleType', 'name code pricing')
      .populate('parkingSession');

    if (!booking) throw ApiError.notFound('Booking not found.');

    // Check access
    if (
      user.role === 'parking_user' &&
      booking.user._id.toString() !== user._id.toString()
    ) {
      throw ApiError.forbidden('Access denied.');
    }

    return booking;
  }

  async create(data, userId) {
    const { parkingLot, vehicleType, scheduledDate, startTime, endTime, vehicleInfo, vehicleId, floorId, zoneId, notes, assignedSlot } = data;

    // Validate parking lot
    const lot = await ParkingLot.findById(parkingLot);
    if (!lot || lot.status !== 'active') {
      throw ApiError.badRequest('Parking lot is not available for booking.');
    }
    if (!lot.settings.allowBooking) {
      throw ApiError.badRequest('This parking lot does not accept online bookings.');
    }

    // If user selected a saved vehicle, auto-fill vehicleType and vehicleInfo
    let resolvedVehicleType = vehicleType;
    let resolvedVehicleInfo = vehicleInfo;
    if (vehicleId) {
      const savedVehicle = await Vehicle.findById(vehicleId).populate('vehicleType');
      if (!savedVehicle || savedVehicle.user.toString() !== userId.toString()) {
        throw ApiError.badRequest('Selected vehicle not found or does not belong to you.');
      }
      resolvedVehicleType = savedVehicle.vehicleType._id;
      resolvedVehicleInfo = {
        licensePlate: savedVehicle.licensePlate,
        vehicleModel: savedVehicle.vehicleModel,
        vehicleColor: savedVehicle.vehicleColor,
      };
    }

    // Validate vehicle type
    const vType = await VehicleType.findById(resolvedVehicleType);
    if (!vType || !vType.isActive) {
      throw ApiError.badRequest('Vehicle type is not available.');
    }

    // Calculate estimated duration
    const [startH, startM] = startTime.split(':').map(Number);
    let [endH, endM] = endTime.split(':').map(Number);

    // Handle cross-midnight bookings
    if (endH < startH || (endH === startH && endM < startM)) {
      endH += 24;
    }

    const durationHours = (endH * 60 + endM - (startH * 60 + startM)) / 60;

    if (durationHours <= 0) {
      throw ApiError.badRequest('End time must be after start time.');
    }

    // Calculate original entry and exit times (UTC-safe)
    const { start: entryTime, end: exitTime } = toAbsoluteDateRange(scheduledDate, startTime, endTime);

    let finalEntryTime = new Date(entryTime);
    let finalExitTime = new Date(exitTime);

    if (resolvedVehicleInfo && resolvedVehicleInfo.licensePlate) {
      // Check if THIS USER has an active monthly pass for this vehicle at this parking lot
      const MonthlyPass = require('../monthlyPasses/monthlyPass.model');
      const activePass = await MonthlyPass.findOne({
        user: userId,
        licensePlate: resolvedVehicleInfo.licensePlate.toUpperCase(),
        parkingLot: parkingLot,
        status: 'active',
        startDate: { $lte: finalExitTime },
        endDate: { $gte: finalEntryTime }
      });

      if (activePass) {
        throw ApiError.badRequest('This vehicle already has an active monthly pass for this parking lot. Booking is not required.');
      }

      // Check for overlapping bookings for the same license plate
      const existingBookings = await Booking.find({
        'vehicleInfo.licensePlate': resolvedVehicleInfo.licensePlate,
        status: { $in: ['pending', 'approved'] },
      });

      for (const eb of existingBookings) {
        const { start: ebEntryTime, end: ebExitTime } = toAbsoluteDateRange(eb.scheduledDate, eb.startTime, eb.endTime);

        if (finalEntryTime < ebExitTime && finalExitTime > ebEntryTime) {
          if (finalEntryTime >= ebEntryTime && finalExitTime <= ebExitTime) {
            throw ApiError.badRequest(`Vehicle with license plate ${resolvedVehicleInfo.licensePlate} already has a booking that completely covers this time period.`);
          }
          // Partial overlap handling
          if (finalEntryTime >= ebEntryTime && finalEntryTime < ebExitTime && finalExitTime > ebExitTime) {
            finalEntryTime = new Date(ebExitTime);
          } else if (finalExitTime > ebEntryTime && finalExitTime <= ebExitTime && finalEntryTime < ebEntryTime) {
            finalExitTime = new Date(ebEntryTime);
          } else if (finalEntryTime < ebEntryTime && finalExitTime > ebExitTime) {
            finalEntryTime = new Date(ebExitTime);
          }
        }
      }
    }

    let finalDurationHours = (finalExitTime - finalEntryTime) / (60 * 60 * 1000);
    if (finalDurationHours <= 0) {
      throw ApiError.badRequest(`The selected time period is completely overlapped by an existing booking.`);
    }

    let finalStartTime = `${String(finalEntryTime.getHours()).padStart(2, '0')}:${String(finalEntryTime.getMinutes()).padStart(2, '0')}`;
    let finalEndTime = `${String(finalExitTime.getHours()).padStart(2, '0')}:${String(finalExitTime.getMinutes()).padStart(2, '0')}`;

    let recommendedSlot = null;

    if (assignedSlot) {
      recommendedSlot = await ParkingSlot.findById(assignedSlot)
        .populate('floor', 'floorNumber')
        .populate('zone', 'name');

      if (!recommendedSlot || recommendedSlot.status === 'maintenance') {
        throw ApiError.badRequest('The selected slot is not available. Please select another slot.');
      }

      // If the slot is occupied, check if the current occupant will have left before
      // this new booking starts (accounting for the 15-min checkout buffer).
      if (recommendedSlot.status === 'occupied') {
        const CHECKOUT_BUFFER_MS = 15 * 60 * 1000;
        let occupantEndOk = false;

        // Resolve occupant's booking end from slot.currentBooking or slot.currentSession.booking
        const occupantBookingId = recommendedSlot.currentBooking;
        let occupantBooking = occupantBookingId
          ? await Booking.findById(occupantBookingId).select('scheduledDate startTime endTime').lean()
          : null;

        if (!occupantBooking) {
          // Fallback: get from currentSession's booking
          const ParkingSession = require('../parkingSessions/parkingSession.model');
          const sess = recommendedSlot.currentSession
            ? await ParkingSession.findById(recommendedSlot.currentSession)
              .populate('booking', 'scheduledDate startTime endTime')
              .lean()
            : null;
          occupantBooking = sess?.booking || null;
        }

        if (occupantBooking?.endTime && occupantBooking?.scheduledDate) {
          const { end: plainEnd } = toAbsoluteDateRange(
            occupantBooking.scheduledDate,
            occupantBooking.startTime || '00:00',
            occupantBooking.endTime
          );
          const effectiveOccupantEnd = new Date(plainEnd.getTime() + CHECKOUT_BUFFER_MS);
          occupantEndOk = effectiveOccupantEnd <= finalEntryTime;
        }

        if (!occupantEndOk) {
          throw ApiError.badRequest('The selected slot is currently occupied. Please select another slot.');
        }
        // Occupant will be gone before new booking starts — allow it
      }

      // Check if locked by someone else
      if (
        recommendedSlot.lockedBy &&
        recommendedSlot.lockedBy.toString() !== userId.toString() &&
        recommendedSlot.lockedUntil &&
        new Date(recommendedSlot.lockedUntil) > new Date()
      ) {
        throw ApiError.badRequest('The selected slot is currently being selected by another user.');
      }

      // --- TIME-BASED OVERLAP CHECK ---
      // Check if any existing approved/pending booking for this slot overlaps with the requested time
      const conflicts = await getConflictingBookings(recommendedSlot._id, finalEntryTime, finalExitTime);
      if (conflicts.length > 0) {
        const c = conflicts[0];
        throw ApiError.badRequest(
          `Slot is already booked from ${c.startTime} to ${c.endTime} on that day. Please choose a different time or slot.`
        );
      }
    } else {
      // --- AUTO-FIND SLOT with time-overlap filtering ---
      const filter = {
        parkingLot,
        vehicleType: resolvedVehicleType,
        status: { $in: ['available', 'reserved'] }, // 'reserved' status is now just a computed label; physically the slot can still accept future bookings
      };
      if (floorId) filter.floor = floorId;
      if (zoneId) filter.zone = zoneId;

      const candidateSlots = await ParkingSlot.find(filter)
        .populate('floor', 'floorNumber')
        .populate('zone', 'name')
        .limit(50);

      // Filter out slots that have a time-overlapping booking
      const freeSlots = [];
      for (const slot of candidateSlots) {
        // Skip physically occupied slots
        if (slot.status === 'occupied' || slot.status === 'maintenance') continue;
        const conflicts = await getConflictingBookings(slot._id, finalEntryTime, finalExitTime);
        if (conflicts.length === 0) freeSlots.push(slot);
      }

      recommendedSlot = suggestOptimalSlot(freeSlots, vType);
    }

    // Estimate fee using standardized block logic
    const { fee: estimatedFee } = calculateParkingFee(finalEntryTime, finalExitTime, vType.pricing);

    // Create booking
    const booking = await Booking.create({
      user: userId,
      parkingLot,
      floor: floorId || (recommendedSlot?.floor?._id),
      zone: zoneId || (recommendedSlot?.zone?._id),
      assignedSlot: recommendedSlot?._id,
      vehicleType: resolvedVehicleType,
      vehicleInfo: resolvedVehicleInfo,
      scheduledDate: new Date(finalEntryTime),
      startTime: finalStartTime,
      endTime: finalEndTime,
      estimatedDuration: finalDurationHours,
      estimatedFee,
      notes,
      status: 'pending',
    });

    // Track the booking on the slot WITHOUT changing its physical status.
    // The slot remains 'available' for future bookings in different time windows.
    // The slot will only become 'occupied' when the vehicle actually checks in.
    if (recommendedSlot) {
      await ParkingSlot.findByIdAndUpdate(recommendedSlot._id, {
        currentBooking: booking._id, // track latest booking reference
      });
      // Emit real-time event — the frontend should treat a slot as 'reserved'
      // only when a booking starts within the next 30 minutes (computed on getFloorSlotMap).
      // Here we just notify that a new booking was created for this slot.
      try {
        emitSlotUpdate(parkingLot.toString(), {
          slotId: recommendedSlot._id,
          slotCode: recommendedSlot.slotCode,
          status: recommendedSlot.status, // keep real DB status
          bookingId: booking._id,
          floorId: recommendedSlot.floor?._id || recommendedSlot.floor,
          zoneId: recommendedSlot.zone?._id || recommendedSlot.zone,
        });
      } catch (_) { /* socket may not be ready */ }
    }

    // Generate QR code
    const qrData = {
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      parkingLot: lot.name,
      userId,
      vehicleType: vType.name,
    };
    const qrCode = await generateQRCode(qrData);
    booking.qrCode = qrCode;
    booking.qrCodeData = JSON.stringify(qrData);
    await booking.save();

    // Auto-approve for now (can be manual approval workflow)
    await this.approve(booking._id, null, true);

    return booking.populate([
      { path: 'parkingLot', select: 'name code address' },
      { path: 'vehicleType', select: 'name pricing' },
      { path: 'assignedSlot', select: 'slotCode floor zone' },
    ]);
  }

  async approve(bookingId, staffId, auto = false) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw ApiError.notFound('Booking not found.');

    if (booking.status !== 'pending') {
      throw ApiError.badRequest(`Booking is already ${booking.status}.`);
    }

    booking.status = 'approved';
    booking.approvedBy = staffId;
    booking.approvedAt = new Date();
    await booking.save();

    // Send notification
    if (!auto) {
      await notificationService.create({
        recipient: booking.user,
        type: 'booking_approved',
        title: 'Booking Approved!',
        message: `Your booking ${booking.bookingCode} has been approved.`,
        data: { bookingId: booking._id, bookingCode: booking.bookingCode },
      });
    }

    return booking;
  }

  async cancel(bookingId, userId, role, reason) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw ApiError.notFound('Booking not found.');

    // Check ownership for regular users
    if (role === 'parking_user' && booking.user.toString() !== userId.toString()) {
      throw ApiError.forbidden('You can only cancel your own bookings.');
    }

    if (['completed', 'cancelled'].includes(booking.status)) {
      throw ApiError.badRequest(`Cannot cancel a ${booking.status} booking.`);
    }

    // Clear the booking reference from the slot.
    // The slot's physical status remains unchanged (it's 'available' since we no longer
    // set it to 'reserved' on booking creation — only 'occupied' on check-in).
    if (booking.assignedSlot) {
      const releasedSlot = await ParkingSlot.findByIdAndUpdate(
        booking.assignedSlot,
        { currentBooking: null },
        { new: true }
      );
      // Emit real-time update so clients know the booking was cancelled for this slot
      try {
        emitSlotUpdate(booking.parkingLot.toString(), {
          slotId: booking.assignedSlot,
          slotCode: releasedSlot?.slotCode,
          status: releasedSlot?.status || 'available', // real DB status
          bookingCancelled: true,
          floorId: booking.floor,
          zoneId: booking.zone,
        });
      } catch (_) { /* socket may not be ready */ }
    }

    booking.status = 'cancelled';
    booking.cancelReason = reason;
    booking.cancelledBy = userId;
    booking.cancelledAt = new Date();
    await booking.save();

    // Notify user if cancelled by staff/admin
    if (role !== 'parking_user') {
      await notificationService.create({
        recipient: booking.user,
        type: 'booking_cancelled',
        title: 'Booking Cancelled',
        message: `Your booking ${booking.bookingCode} has been cancelled. Reason: ${reason}`,
        data: { bookingId: booking._id },
      });
    }

    return booking;
  }

  async getUserBookings(userId, query) {
    const filter = { user: userId };
    if (query.status) filter.status = query.status;

    return Pagination.paginate(Booking, filter, {
      page: parseInt(query.page) || 1,
      limit: parseInt(query.limit) || 10,
      sort: { createdAt: -1 },
      populate: [
        { path: 'parkingLot', select: 'name code address' },
        { path: 'vehicleType', select: 'name code icon' },
        { path: 'assignedSlot', select: 'slotCode' },
        { path: 'floor', select: 'name floorNumber' },
      ],
    });
  }
}

module.exports = new BookingService();
