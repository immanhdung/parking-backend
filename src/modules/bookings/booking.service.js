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
      .populate('assignedSlot', 'slotCode position features')
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

    // Calculate original entry and exit times
    const entryTime = new Date(scheduledDate);
    entryTime.setHours(startH, startM, 0, 0);
    const exitTime = new Date(entryTime.getTime() + durationHours * 60 * 60 * 1000);

    let finalEntryTime = new Date(entryTime);
    let finalExitTime = new Date(exitTime);

    if (resolvedVehicleInfo && resolvedVehicleInfo.licensePlate) {
      // Check if the vehicle has an active monthly pass for this parking lot during the selected time
      const MonthlyPass = require('../monthlyPasses/monthlyPass.model');
      const activePass = await MonthlyPass.findOne({
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
        const [ebStartH, ebStartM] = eb.startTime.split(':').map(Number);
        let [ebEndH, ebEndM] = eb.endTime.split(':').map(Number);
        if (ebEndH < ebStartH || (ebEndH === ebStartH && ebEndM < ebStartM)) {
          ebEndH += 24;
        }
        const ebDuration = (ebEndH * 60 + ebEndM - (ebStartH * 60 + ebStartM)) / 60;

        const ebEntryTime = new Date(eb.scheduledDate);
        ebEntryTime.setHours(ebStartH, ebStartM, 0, 0);
        const ebExitTime = new Date(ebEntryTime.getTime() + ebDuration * 60 * 60 * 1000);

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
      recommendedSlot = await ParkingSlot.findById(assignedSlot).populate('floor', 'floorNumber').populate('zone', 'name');
      if (!recommendedSlot || recommendedSlot.status !== 'available') {
        throw ApiError.badRequest('The selected slot is no longer available. Please select another slot.');
      }
      // Check if locked by someone else
      if (recommendedSlot.lockedBy && recommendedSlot.lockedBy.toString() !== userId.toString() && recommendedSlot.lockedUntil && new Date(recommendedSlot.lockedUntil) > new Date()) {
         throw ApiError.badRequest('The selected slot is currently being locked by another user.');
      }
    } else {
      // Find optimal available slot (AI suggestion)
      const filter = {
        parkingLot,
        vehicleType: resolvedVehicleType,
        status: 'available',
      };
      if (floorId) filter.floor = floorId;
      if (zoneId) filter.zone = zoneId;

      const availableSlots = await ParkingSlot.find(filter)
        .populate('floor', 'floorNumber')
        .populate('zone', 'name')
        .limit(20);

      recommendedSlot = suggestOptimalSlot(availableSlots, vType);
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

    // Reserve the slot if one was found
    if (recommendedSlot) {
      await ParkingSlot.findByIdAndUpdate(recommendedSlot._id, {
        status: 'reserved',
        currentBooking: booking._id,
      });
      // Emit real-time update
      try {
        emitSlotUpdate(parkingLot.toString(), {
          slotId: recommendedSlot._id,
          slotCode: recommendedSlot.slotCode,
          status: 'reserved',
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

    // Release the reserved slot
    if (booking.assignedSlot) {
      const releasedSlot = await ParkingSlot.findByIdAndUpdate(
        booking.assignedSlot,
        { status: 'available', currentBooking: null },
        { new: true }
      );
      // Emit real-time update
      try {
        emitSlotUpdate(booking.parkingLot.toString(), {
          slotId: booking.assignedSlot,
          slotCode: releasedSlot?.slotCode,
          status: 'available',
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
