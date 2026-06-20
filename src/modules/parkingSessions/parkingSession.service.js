const ParkingSession = require('./parkingSession.model');
const ParkingSlot = require('../parkingSlots/parkingSlot.model');
const Booking = require('../bookings/booking.model');
const VehicleType = require('../vehicleTypes/vehicleType.model');
const Payment = require('../payments/payment.model');
const notificationService = require('../notifications/notification.service');
const parkingLotService = require('../parkingLots/parkingLot.service');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');
const { calculateParkingFee, calculateOvertimeFee } = require('../../utils/helpers');
const { v4: uuidv4 } = require('uuid');

class ParkingSessionService {
  async getSessions(query, user) {
    const { page = 1, limit = 10, sort = '-entryTime', status, parkingLot, licensePlate, startDate, endDate } = query;

    const filter = {};
    if (status) filter.status = status;
    if (licensePlate) {
      const cleanPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, '');
      const regexStr = cleanPlate.split('').join('[^a-zA-Z0-9]*');
      filter['vehicleInfo.licensePlate'] = { $regex: new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i') };
    }

    // Manager/Staff: only their lot
    if (user.role === 'parking_manager' || user.role === 'parking_staff') {
      if (user.assignedParkingLot) {
        filter.parkingLot = user.assignedParkingLot;
      } else if (parkingLot) {
        filter.parkingLot = parkingLot;
      }
    } else if (parkingLot) {
      filter.parkingLot = parkingLot;
    }

    if (user.role === 'parking_user') {
      filter.user = user._id;
    }

    if (startDate || endDate) {
      filter.entryTime = {};
      if (startDate) filter.entryTime.$gte = new Date(startDate);
      if (endDate) filter.entryTime.$lte = new Date(endDate);
    }

    return Pagination.paginate(ParkingSession, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: Pagination.buildSort(sort),
      populate: [
        { path: 'user', select: 'fullName email phone' },
        { path: 'parkingLot', select: 'name code' },
        { path: 'floor', select: 'name floorNumber' },
        { path: 'zone', select: 'name code' },
        { path: 'slot', select: 'slotCode' },
        { path: 'vehicleType', select: 'name code icon' },
        { path: 'payment', select: 'invoiceCode amount method status' },
      ],
    });
  }

  async getById(id) {
    const session = await ParkingSession.findById(id)
      .populate('user', 'fullName email phone')
      .populate('parkingLot', 'name code address')
      .populate('floor', 'name floorNumber')
      .populate('zone', 'name code')
      .populate('slot', 'slotCode position features')
      .populate('vehicleType', 'name code pricing')
      .populate('booking', 'bookingCode')
      .populate('payment')
      .populate('checkInStaff', 'fullName')
      .populate('checkOutStaff', 'fullName');

    if (!session) throw ApiError.notFound('Parking session not found.');
    return session;
  }

  /**
   * CHECK-IN: Create a parking session
   */
  async checkIn(data, staffId, io) {
    const {
      bookingId,
      licensePlate,
      vehicleTypeId,
      parkingLotId,
      slotId,
      vehicleModel,
      vehicleColor,
      ticketNumber,
    } = data;

    let booking = null;
    let slot = null;
    let vehicleType = null;
    let userId = null;
    let floorId, zoneId;

    // If checking in via booking
    if (bookingId) {
      booking = await Booking.findById(bookingId).populate('vehicleType').populate('assignedSlot');
      if (!booking) throw ApiError.notFound('Booking not found.');
      if (booking.status !== 'approved') throw ApiError.badRequest('Booking is not approved.');

      slot = booking.assignedSlot;
      vehicleType = booking.vehicleType;
      userId = booking.user;
      floorId = booking.floor;
      zoneId = booking.zone;

      // Verify license plate matches
      if (licensePlate && booking.vehicleInfo?.licensePlate &&
          booking.vehicleInfo.licensePlate !== licensePlate.toUpperCase()) {
        throw ApiError.badRequest('License plate does not match booking.');
      }
    } else {
      // Walk-in check-in
      vehicleType = await VehicleType.findById(vehicleTypeId);
      if (!vehicleType) throw ApiError.notFound('Vehicle type not found.');

      if (slotId) {
        slot = await ParkingSlot.findById(slotId).populate('floor zone');
        if (!slot) throw ApiError.notFound('Slot not found.');
        if (slot.status !== 'available') throw ApiError.badRequest(`Slot ${slot.slotCode} is not available.`);
        floorId = slot.floor._id || slot.floor;
        zoneId = slot.zone?._id || slot.zone;
      } else {
        // Auto-find available slot
        const available = await ParkingSlot.findOne({
          parkingLot: parkingLotId,
          vehicleType: vehicleTypeId,
          status: 'available',
        }).populate('floor zone').sort({ 'floor.floorNumber': 1 });

        if (!available) throw ApiError.badRequest('No available slots for this vehicle type.');
        slot = available;
        floorId = available.floor._id || available.floor;
        zoneId = available.zone?._id || available.zone;
      }
    }

    // Generate session code
    const sessionCode = `PS-${Date.now().toString(36).toUpperCase()}-${uuidv4().substring(0, 6).toUpperCase()}`;

    // Create parking session
    const session = await ParkingSession.create({
      sessionCode,
      user: userId,
      booking: booking?._id,
      parkingLot: parkingLotId || slot.parkingLot,
      floor: floorId,
      zone: zoneId,
      slot: slot._id,
      vehicleType: vehicleType._id || vehicleType,
      vehicleInfo: {
        licensePlate: (licensePlate || booking?.vehicleInfo?.licensePlate || '').toUpperCase(),
        vehicleModel: vehicleModel || booking?.vehicleInfo?.vehicleModel,
        vehicleColor: vehicleColor || booking?.vehicleInfo?.vehicleColor,
      },
      entryTime: new Date(),
      checkInStaff: staffId,
      status: 'active',
      ticketNumber,
      advancePayment: booking && booking.paymentStatus === 'paid' ? booking.estimatedFee : 0,
    });

    // Update slot status to occupied
    await ParkingSlot.findByIdAndUpdate(slot._id, {
      status: 'occupied',
      currentSession: session._id,
      currentBooking: null,
    });

    // Update booking status
    if (booking) {
      await Booking.findByIdAndUpdate(booking._id, {
        status: 'completed',
        parkingSession: session._id,
      });
    }

    // Sync lot slot counts
    await parkingLotService.syncSlotCounts(session.parkingLot);

    // Realtime: emit slot update
    const lotId = (session.parkingLot || '').toString();
    if (io) {
      io.to(`parkingLot:${lotId}`).emit('slotStatusUpdated', {
        slotId: slot._id,
        slotCode: slot.slotCode,
        status: 'occupied',
        sessionId: session._id,
      });
      io.to(`parkingLot:${lotId}`).emit('sessionStarted', {
        sessionId: session._id,
        sessionCode,
        licensePlate: session.vehicleInfo.licensePlate,
        slotCode: slot.slotCode,
      });
    }

    // Notify user
    if (userId) {
      await notificationService.create({
        recipient: userId,
        type: 'checkin_success',
        title: 'Check-in Successful',
        message: `Your vehicle ${session.vehicleInfo.licensePlate} has been checked in at slot ${slot.slotCode}.`,
        data: { sessionId: session._id },
      });
    }

    return session.populate([
      { path: 'slot', select: 'slotCode' },
      { path: 'floor', select: 'name floorNumber' },
      { path: 'vehicleType', select: 'name pricing' },
    ]);
  }

  /**
   * CHECK-OUT: End a parking session and calculate fee
   */
  async checkOut(sessionId, staffId, io) {
    const session = await ParkingSession.findById(sessionId)
      .populate('vehicleType')
      .populate('slot')
      .populate('booking', 'endTime scheduledDate');

    if (!session) throw ApiError.notFound('Session not found.');
    if (session.status !== 'active') throw ApiError.badRequest('Session is not active.');

    const exitTime = new Date();
    const { fee, durationMs, durationHours } = calculateParkingFee(
      session.entryTime,
      exitTime,
      session.vehicleType.pricing
    );

    // Calculate overtime fee if there was a booking
    let overtimeFee = 0;
    let isOvertime = false;
    let overtimeHours = 0;

    if (session.booking?.endTime && session.booking?.scheduledDate) {
      const scheduledEndStr = `${session.booking.scheduledDate.toISOString().split('T')[0]}T${session.booking.endTime}:00`;
      const scheduledEnd = new Date(scheduledEndStr);
      if (exitTime > scheduledEnd) {
        const overtimeMs = exitTime - scheduledEnd;
        overtimeHours = overtimeMs / (1000 * 60 * 60);
        if (overtimeHours > (session.parkingLot?.settings?.overtimeGracePeriodMinutes || 15) / 60) {
          overtimeFee = calculateOvertimeFee(scheduledEnd, exitTime, session.vehicleType.pricing.hourlyRate);
          isOvertime = true;
        }
      }
    }

    const totalFee = fee + overtimeFee;
    
    // Deduct advance payment
    const feeToPay = Math.max(0, totalFee - session.advancePayment);

    session.exitTime = exitTime;
    session.durationMs = durationMs;
    session.durationHours = durationHours;
    session.baseFee = fee;
    session.overtimeFee = overtimeFee;
    session.totalFee = feeToPay; // This is the REMAINING amount to be paid now
    session.isOvertime = isOvertime;
    session.overtimeHours = overtimeHours;
    session.checkOutStaff = staffId;
    session.status = 'completed';

    // If fully pre-paid, auto mark as paid
    if (feeToPay === 0 && session.advancePayment > 0) {
      session.paymentStatus = 'paid';
    }

    await session.save();

    // Free the slot
    await ParkingSlot.findByIdAndUpdate(session.slot._id, {
      status: 'available',
      currentSession: null,
      currentBooking: null,
    });

    // Sync lot counts
    await parkingLotService.syncSlotCounts(session.parkingLot);

    // Realtime: emit slot freed
    const lotId = (session.parkingLot || '').toString();
    if (io) {
      io.to(`parkingLot:${lotId}`).emit('slotStatusUpdated', {
        slotId: session.slot._id,
        slotCode: session.slot.slotCode,
        status: 'available',
      });
      io.to(`parkingLot:${lotId}`).emit('sessionEnded', {
        sessionId: session._id,
        licensePlate: session.vehicleInfo.licensePlate,
        totalFee,
        durationHours: session.durationHours,
      });
    }

    // Notify user
    if (session.user) {
      await notificationService.create({
        recipient: session.user,
        type: 'checkout_success',
        title: 'Check-out Successful',
        message: `Vehicle ${session.vehicleInfo.licensePlate} checked out. Total fee: ${totalFee.toLocaleString('vi-VN')} VND`,
        data: { sessionId: session._id, totalFee },
      });
    }

    return session;
  }

  /**
   * Find active session by license plate or session code
   */
  async findActiveSession(query) {
    const { licensePlate, sessionCode, parkingLotId } = query;

    const filter = { status: 'active' };
    if (licensePlate) {
      // Clean input: remove spaces, dashes, dots
      const cleanPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, '');
      // Create a regex that allows optional special characters between each alphanumeric char
      const regexStr = cleanPlate.split('').join('[^a-zA-Z0-9]*');
      filter['vehicleInfo.licensePlate'] = { $regex: new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i') };
    }
    if (sessionCode) filter.sessionCode = sessionCode.toUpperCase();
    if (parkingLotId) filter.parkingLot = parkingLotId;

    const session = await ParkingSession.findOne(filter)
      .populate('user', 'fullName email phone')
      .populate('slot', 'slotCode')
      .populate('floor', 'name floorNumber')
      .populate('zone', 'name code')
      .populate('vehicleType', 'name pricing')
      .populate('booking', 'bookingCode');

    if (!session) throw ApiError.notFound('No active session found.');
    return session;
  }

  /**
   * Get overdue sessions (active sessions past booking time)
   */
  async getOverdueSessions(parkingLotId) {
    const sessions = await ParkingSession.find({
      parkingLot: parkingLotId,
      status: 'active',
      isOvertime: false,
    }).populate('booking', 'endTime scheduledDate').populate('user', 'fullName email');

    const now = new Date();
    const overdue = sessions.filter(s => {
      if (!s.booking?.endTime) return false;
      const end = new Date(`${s.booking.scheduledDate.toISOString().split('T')[0]}T${s.booking.endTime}:00`);
      return now > end;
    });

    return overdue;
  }

  /**
   * Upload evidence images to a session
   */
  async addEvidenceImages(sessionId, files, type = 'entry') {
    const session = await ParkingSession.findById(sessionId);
    if (!session) throw ApiError.notFound('Session not found.');

    const images = files.map(f => ({
      url: f.path,
      publicId: f.filename,
      type,
      capturedAt: new Date(),
    }));

    session.evidenceImages.push(...images);
    await session.save();
    return session;
  }
}

module.exports = new ParkingSessionService();
