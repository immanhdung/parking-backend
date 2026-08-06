const ParkingSession = require('./parkingSession.model');
const ParkingSlot = require('../parkingSlots/parkingSlot.model');
const Booking = require('../bookings/booking.model');
const VehicleType = require('../vehicleTypes/vehicleType.model');
const Payment = require('../payments/payment.model');
const MonthlyPass = require('../monthlyPasses/monthlyPass.model');
const notificationService = require('../notifications/notification.service');
const parkingLotService = require('../parkingLots/parkingLot.service');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');
const { calculateParkingFee, calculateOvertimeFee } = require('../../utils/helpers');
const { v4: uuidv4 } = require('uuid');
const { toAbsoluteDateRange } = require('../../utils/dateUtils');

/** How far ahead (in ms) to protect upcoming bookings from walk-in check-ins */
const WALK_IN_BUFFER_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Find the best available slot for a walk-in customer.
 * Skips any slot that has an upcoming approved/pending booking starting within
 * WALK_IN_BUFFER_MS from now, to protect pre-booked customers.
 */
async function findWalkInSlot(parkingLotId, vehicleTypeId, specificSlotId = null) {
  const now = new Date();
  const bufferEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4-hour walk-in buffer

  // Match by vehicle type code to allow cross-matching if there are duplicate vehicle types
  const VehicleType = require('../vehicleTypes/vehicleType.model');
  const targetVT = await VehicleType.findById(vehicleTypeId);
  let vtIds = [vehicleTypeId];
  if (targetVT && targetVT.code) {
    const similarVTs = await VehicleType.find({ code: targetVT.code });
    vtIds = similarVTs.map(v => v._id);
  }

  if (specificSlotId) {
    const slot = await ParkingSlot.findById(specificSlotId).populate('floor zone');
    if (!slot) throw ApiError.notFound('Parking slot not found.');

    if (slot.parkingLot.toString() !== parkingLotId.toString()) {
      throw ApiError.badRequest('This slot does not belong to the selected parking lot.');
    }

    if (!vtIds.some(id => id.toString() === slot.vehicleType.toString())) {
      throw ApiError.badRequest('This slot is for a different vehicle type.');
    }

    // Check if slot is available
    if (slot.status !== 'available') {
      throw ApiError.badRequest(`This slot is currently ${slot.status}.`);
    }

    // Check upcoming bookings
    const upcomingBooking = await Booking.findOne({
      assignedSlot: slot._id,
      status: { $in: ['pending', 'approved'] },
    }).sort({ scheduledDate: 1, startTime: 1 });

    if (upcomingBooking) {
      const bookingStart = toAbsoluteDateRange(upcomingBooking.scheduledDate, upcomingBooking.startTime, upcomingBooking.endTime).start;
      if (bookingStart >= now && bookingStart <= bufferEnd) {
        throw ApiError.badRequest('This slot has an upcoming booking soon. Please choose another slot.');
      }
    }
    return slot;
  }

  // Auto-find: get candidate available slots
  console.log('[DEBUG] findWalkInSlot Query:', { parkingLot: parkingLotId, vehicleType: { $in: vtIds }, status: 'available' });
  const candidates = await ParkingSlot.find({
    parkingLot: parkingLotId,
    vehicleType: { $in: vtIds },
    status: 'available',
  }).populate('floor zone').sort({ 'floor.floorNumber': 1 }).limit(50);
  console.log('[DEBUG] findWalkInSlot Found Candidates:', candidates.length);

  for (const slot of candidates) {
    const upcomingBooking = await Booking.findOne({
      assignedSlot: slot._id,
      status: { $in: ['pending', 'approved'] },
    }).sort({ scheduledDate: 1, startTime: 1 });

    if (upcomingBooking) {
      const bookingStart = toAbsoluteDateRange(upcomingBooking.scheduledDate, upcomingBooking.startTime, upcomingBooking.endTime).start;
      // Skip if the next booking starts within the buffer window
      if (bookingStart >= now && bookingStart <= bufferEnd) continue;
    }
    return slot; // This slot is safe for a walk-in
  }

  throw ApiError.badRequest('The parking lot is full. There are no available slots for this vehicle type right now.');
}

class ParkingSessionService {
  async getSessions(query, user) {
    const { page = 1, limit = 10, sort = '-entryTime', status, parkingLot, licensePlate, slot, startDate, endDate } = query;

    const filter = {};
    if (status) filter.status = status;
    if (slot) filter.slot = slot;
    if (licensePlate) {
      const cleanPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, '');
      const regexStr = cleanPlate.split('').join('[^a-zA-Z0-9]*');
      filter['vehicleInfo.licensePlate'] = { $regex: new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i') };
    }

    // Manager/Staff: only their lot
    if (user.role === 'parking_manager' || user.role === 'parking_staff') {
      const assigned = user.assignedParkingLot;
      if (parkingLot) {
        filter.parkingLot = parkingLot;
      } else if (Array.isArray(assigned) && assigned.length > 0) {
        filter.parkingLot = assigned.length === 1 ? assigned[0] : { $in: assigned };
      } else if (assigned && !Array.isArray(assigned)) {
        filter.parkingLot = assigned;
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
      .populate('booking', 'bookingCode startTime endTime scheduledDate estimatedFee')
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
      monthlyPassCode,
      licensePlate,
      vehicleTypeId,
      parkingLotId,
      slotId,
      vehicleModel,
      vehicleColor,
      ticketNumber,
    } = data;

    let booking = null;
    let monthlyPass = null;
    let slot = null;
    let vehicleType = null;
    let userId = null;
    let floorId, zoneId;

    if (monthlyPassCode) {
      // Check-in via Monthly Pass QR Code
      monthlyPass = await MonthlyPass.findOne({
        passCode: monthlyPassCode,
        status: 'active',
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
      }).populate('vehicleType');

      if (!monthlyPass) throw ApiError.badRequest('Active monthly pass not found or expired.');

      vehicleType = monthlyPass.vehicleType;
      userId = monthlyPass.user;
      
      if (parkingLotId && monthlyPass.parkingLot.toString() !== parkingLotId.toString()) {
        throw ApiError.badRequest('This monthly pass is not valid for this parking lot.');
      }
      
      const actualParkingLotId = parkingLotId || monthlyPass.parkingLot;

      if (slotId) {
        slot = await findWalkInSlot(actualParkingLotId, vehicleType._id || vehicleType, slotId);
        floorId = slot.floor._id || slot.floor;
        zoneId = slot.zone?._id || slot.zone;
      } else {
        slot = await findWalkInSlot(actualParkingLotId, vehicleType._id || vehicleType);
        floorId = slot.floor._id || slot.floor;
        zoneId = slot.zone?._id || slot.zone;
      }
    } else if (bookingId) {
      // If checking in via booking
      booking = await Booking.findById(bookingId).populate('vehicleType').populate('assignedSlot');
      if (!booking) throw ApiError.notFound('Booking not found.');
      if (booking.status === 'completed') throw ApiError.badRequest('This booking has already been used.');
      if (booking.status === 'cancelled') throw ApiError.badRequest('This booking has been cancelled.');
      if (booking.status !== 'approved') throw ApiError.badRequest(`Booking is currently ${booking.status} and cannot be used.`);

      if (parkingLotId && booking.parkingLot.toString() !== parkingLotId.toString()) {
        throw ApiError.badRequest('This booking is not valid for this parking lot.');
      }


      // If staff overrides the slot (e.g., original slot is occupied)
      if (slotId && (!booking.assignedSlot || slotId !== booking.assignedSlot._id.toString())) {
        const actualParkingLotId = parkingLotId || booking.parkingLot;
        const newSlot = await findWalkInSlot(actualParkingLotId, booking.vehicleType._id || booking.vehicleType, slotId);
        
        // Free the old slot's booking reference
        if (booking.assignedSlot) {
          await ParkingSlot.findByIdAndUpdate(booking.assignedSlot._id, { currentBooking: null });
        }
        
        booking.assignedSlot = newSlot; // Store temporarily for session creation
        slot = newSlot;
      } else {
        slot = booking.assignedSlot;
      }

      vehicleType = booking.vehicleType;
      userId = booking.user;
      floorId = slot.floor._id || slot.floor;
      zoneId = slot.zone?._id || slot.zone;

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
        slot = await findWalkInSlot(parkingLotId, vehicleTypeId, slotId);
        floorId = slot.floor._id || slot.floor;
        zoneId = slot.zone?._id || slot.zone;
      } else {
        // Auto-find available slot, respecting the 4-hour walk-in buffer
        slot = await findWalkInSlot(parkingLotId, vehicleTypeId);
        floorId = slot.floor._id || slot.floor;
        zoneId = slot.zone?._id || slot.zone;
      }
    }

    // Generate session code
    const sessionCode = `PS-${Date.now().toString(36).toUpperCase()}-${uuidv4().substring(0, 6).toUpperCase()}`;

    const actualLicensePlate = (monthlyPass?.licensePlate || licensePlate || booking?.vehicleInfo?.licensePlate || '').toUpperCase();

    // Prepare regex for license plate matching (ignore spaces, dashes, dots)
    let plateRegex = null;
    if (actualLicensePlate) {
      const cleanScanned = actualLicensePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (cleanScanned) {
        const regexStr = cleanScanned.split('').join('[-.\\s]*');
        plateRegex = new RegExp(`^${regexStr}$`, 'i');
      }
    }

    // Check for active monthly pass by plate if not provided via QR code
    if (!monthlyPass && plateRegex) {
      monthlyPass = await MonthlyPass.findOne({
        licensePlate: { $regex: plateRegex },
        status: 'active',
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
      });
    }

    // If no monthly pass, check if it's a registered vehicle to link the user
    if (!monthlyPass && plateRegex && !userId) {
      const Vehicle = require('../vehicles/vehicle.model');
      const registeredVehicle = await Vehicle.findOne({ licensePlate: { $regex: plateRegex } });
      if (registeredVehicle) {
        userId = registeredVehicle.user;
      }
    }

    // Prevent duplicate check-in
    if (actualLicensePlate) {
      const cleanPlate = actualLicensePlate.replace(/[^a-zA-Z0-9]/g, '');
      if (cleanPlate) {
        const regexStr = cleanPlate.split('').join('[^a-zA-Z0-9]*');
        const existingSession = await ParkingSession.findOne({
          'vehicleInfo.licensePlate': { $regex: new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i') },
          status: 'active'
        });
        if (existingSession) {
          throw ApiError.badRequest(`Vehicle ${actualLicensePlate} is already checked in (Session: ${existingSession.sessionCode}).`);
        }
      }
    }

    if (monthlyPass) {
      const existingPassSession = await ParkingSession.findOne({
        monthlyPass: monthlyPass._id,
        status: 'active'
      });
      if (existingPassSession) {
        throw ApiError.badRequest('This monthly pass is already in use by another active session.');
      }
    }

    // Create parking session
    const session = await ParkingSession.create({
      sessionCode,
      user: userId || monthlyPass?.user,
      booking: booking?._id,
      monthlyPass: monthlyPass?._id,
      parkingLot: parkingLotId || slot.parkingLot,
      floor: floorId,
      zone: zoneId,
      slot: slot._id,
      vehicleType: vehicleType._id || vehicleType,
      vehicleInfo: {
        licensePlate: actualLicensePlate,
        vehicleModel: vehicleModel || booking?.vehicleInfo?.vehicleModel,
        vehicleColor: vehicleColor || booking?.vehicleInfo?.vehicleColor,
      },
      entryTime: new Date(),
      checkInStaff: staffId,
      status: 'active',
      ticketNumber,
      advancePayment: booking && booking.paymentStatus === 'paid' ? booking.estimatedFee : 0,
    });

    // Update slot status to occupied; keep currentBooking so the slot-map can
    // determine when the current occupant is scheduled to leave.
    await ParkingSlot.findByIdAndUpdate(slot._id, {
      status: 'occupied',
      currentSession: session._id,
      currentBooking: booking?._id ?? null,
    });

    // Update booking status
    if (booking) {
      await Booking.findByIdAndUpdate(booking._id, {
        status: 'completed',
        parkingSession: session._id,
        assignedSlot: slot._id,
        floor: floorId,
        zone: zoneId
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
      }, io);
    }

    return session.populate([
      { path: 'slot', select: 'slotCode' },
      { path: 'floor', select: 'name floorNumber' },
      { path: 'vehicleType', select: 'name pricing' },
    ]);
  }

  async updateLicensePlate(sessionId, newLicensePlate, staffId) {
    const session = await ParkingSession.findById(sessionId);
    if (!session) throw ApiError.notFound('Parking session not found');

    if (session.status !== 'active') {
      throw ApiError.badRequest('Only active sessions can be updated');
    }

    const oldPlate = session.vehicleInfo.licensePlate;
    session.vehicleInfo.licensePlate = newLicensePlate;
    
    session.notes = (session.notes ? session.notes + '\n' : '') + 
      `[${new Date().toISOString()}] Plate updated from ${oldPlate} to ${newLicensePlate} by staff exception handling`;

    await session.save();
    return session;
  }

  /**
   * CHECK-OUT: End a parking session and calculate fee
   */
  async checkOut(sessionId, staffId, io) {
    const session = await ParkingSession.findById(sessionId)
      .populate('vehicleType')
      .populate('slot')
      .populate('booking', 'startTime endTime scheduledDate estimatedFee')
      .populate('monthlyPass');

    if (!session) throw ApiError.notFound('Session not found.');
    if (session.status !== 'active') throw ApiError.badRequest('Session is not active.');

    const exitTime = new Date();
    const durationMs = exitTime - session.entryTime;
    const durationHours = durationMs / (1000 * 60 * 60);
    
    let fee = 0;
    
    // Calculate overtime fee if there was a booking
    let overtimeFee = 0;
    let isOvertime = false;
    let overtimeHours = 0;
    let overtimeBlocks = 0;
    
    // Block tracking
    let dayBlocksCount = 0;
    let nightBlocksCount = 0;
    let totalBlocks = 0;
    let surchargeLogs = [];

    if (session.monthlyPass) {
      if (exitTime > session.monthlyPass.endDate) {
        // Pass expired during the session
        const expiredMs = exitTime - session.monthlyPass.endDate;
        const expiredHours = expiredMs / (1000 * 60 * 60);
        
        // Charge normal parking fee for the time after expiration
        const calculated = calculateParkingFee(
          session.monthlyPass.endDate,
          exitTime,
          session.vehicleType.pricing
        );
        fee = 0; // Base fee (before expiration) is covered by the pass
        overtimeFee = calculated.fee;
        isOvertime = true;
        overtimeHours = expiredHours;
        overtimeBlocks = calculated.totalBlocks;
        
        // Use logs as surcharge logs since this is effectively overtime
        surchargeLogs = calculated.logs.map(log => ({
          type: 'late',
          timestamp: log.start,
          amount: log.amount,
          label: 'Pass Expired Surcharge'
        }));
      } else {
        // Monthly pass covers the entire fee
        fee = 0;
        overtimeFee = 0;
      }
    } else if (session.booking) {
      fee = session.booking.estimatedFee || 0; // Base fee is the booking fee

      if (session.booking.endTime && session.booking.startTime && session.booking.scheduledDate) {
        const { start: scheduledStart, end: scheduledEnd } = toAbsoluteDateRange(
          session.booking.scheduledDate,
          session.booking.startTime,
          session.booking.endTime
        );

        // Early Arrival Fee (if they enter before the scheduled start time)
        if (session.entryTime < scheduledStart) {
          const earlyArrivalMs = scheduledStart.getTime() - session.entryTime.getTime();
          if (earlyArrivalMs > 15 * 60 * 1000) {
            const earlyCalc = calculateOvertimeFee(session.entryTime, scheduledStart, session.vehicleType.pricing, 'early');
            overtimeFee += earlyCalc.fee;
            surchargeLogs = surchargeLogs.concat(earlyCalc.surchargeLogs);
            overtimeBlocks += earlyCalc.overtimeBlocks;
            isOvertime = true;
          }
        }

        // Late Departure / Overtime Fee (if they exit after the scheduled end time)
        if (exitTime > scheduledEnd) {
          const overtimeMs = exitTime - scheduledEnd;
          const lateHours = overtimeMs / (1000 * 60 * 60);
          overtimeHours = lateHours;
          
          if (lateHours > 15 / 60) {
            const overtimeCalc = calculateOvertimeFee(scheduledEnd, exitTime, session.vehicleType.pricing, 'late', scheduledStart);
            overtimeFee += overtimeCalc.fee;
            surchargeLogs = surchargeLogs.concat(overtimeCalc.surchargeLogs);
            overtimeBlocks += overtimeCalc.overtimeBlocks;
            isOvertime = true;
          }
        }
      }
    } else {
      // Walk-in check-in, calculate normal fee
      const calculated = calculateParkingFee(
        session.entryTime,
        exitTime,
        session.vehicleType.pricing
      );
      fee = calculated.fee;
      totalBlocks = calculated.totalBlocks;
      dayBlocksCount = calculated.dayBlocksCount;
      nightBlocksCount = calculated.nightBlocksCount;
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
    
    // Set block tracking info
    session.totalBlocks = totalBlocks + overtimeBlocks;
    session.dayBlocksCount = dayBlocksCount;
    session.nightBlocksCount = nightBlocksCount;
    session.surchargeLogs = surchargeLogs;

    // Handle payment recording
    if (feeToPay === 0 && session.advancePayment > 0) {
      session.paymentStatus = 'paid';
    } else if (feeToPay > 0) {
      // Auto-record cash payment when staff manually checks out the vehicle
      const payment = await Payment.create({
        parkingSession: session._id,
        user: session.user,
        parkingLot: session.parkingLot,
        amount: feeToPay,
        baseFee: fee,
        overtimeFee: overtimeFee,
        paymentType: 'session_checkout',
        method: 'cash',
        status: 'completed',
        paidAt: new Date(),
      });
      session.paymentStatus = 'paid';
      session.payment = payment._id;
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
      }, io);
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
      .sort({ entryTime: -1 })
      .populate('user', 'fullName email phone')
      .populate('slot', 'slotCode')
      .populate('floor', 'name floorNumber')
      .populate('zone', 'name code')
      .populate('vehicleType', 'name pricing')
      .populate('booking', 'bookingCode startTime endTime scheduledDate estimatedFee');

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

    if (!files || !Array.isArray(files) || files.length === 0) {
      return session;
    }

    const images = files.map(f => ({
      url: `/uploads/evidence/${f.filename}`,
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
