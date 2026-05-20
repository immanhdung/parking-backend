const Booking = require('./booking.model');
const ParkingSlot = require('../parkingSlots/parkingSlot.model');
const VehicleType = require('../vehicleTypes/vehicleType.model');
const ParkingLot = require('../parkingLots/parkingLot.model');
const notificationService = require('../notifications/notification.service');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');
const { generateQRCode, suggestOptimalSlot } = require('../../utils/helpers');

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
    const { parkingLot, vehicleType, scheduledDate, startTime, endTime, vehicleInfo, floorId, zoneId, notes } = data;

    // Validate parking lot
    const lot = await ParkingLot.findById(parkingLot);
    if (!lot || lot.status !== 'active') {
      throw ApiError.badRequest('Parking lot is not available for booking.');
    }
    if (!lot.settings.allowBooking) {
      throw ApiError.badRequest('This parking lot does not accept online bookings.');
    }

    // Validate vehicle type
    const vType = await VehicleType.findById(vehicleType);
    if (!vType || !vType.isActive) {
      throw ApiError.badRequest('Vehicle type is not available.');
    }

    // Calculate estimated duration
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const durationHours = (endH * 60 + endM - (startH * 60 + startM)) / 60;

    if (durationHours <= 0) {
      throw ApiError.badRequest('End time must be after start time.');
    }

    // Find optimal available slot (AI suggestion)
    const filter = {
      parkingLot,
      vehicleType,
      status: 'available',
    };
    if (floorId) filter.floor = floorId;
    if (zoneId) filter.zone = zoneId;

    const availableSlots = await ParkingSlot.find(filter)
      .populate('floor', 'floorNumber')
      .populate('zone', 'name')
      .limit(20);

    const recommendedSlot = suggestOptimalSlot(availableSlots, vType);

    // Estimate fee
    const estimatedFee = Math.ceil(durationHours) * vType.pricing.hourlyRate;

    // Create booking
    const booking = await Booking.create({
      user: userId,
      parkingLot,
      floor: floorId || (recommendedSlot?.floor?._id),
      zone: zoneId || (recommendedSlot?.zone?._id),
      assignedSlot: recommendedSlot?._id,
      vehicleType,
      vehicleInfo,
      scheduledDate: new Date(scheduledDate),
      startTime,
      endTime,
      estimatedDuration: durationHours,
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
      await ParkingSlot.findByIdAndUpdate(booking.assignedSlot, {
        status: 'available',
        currentBooking: null,
      });
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
