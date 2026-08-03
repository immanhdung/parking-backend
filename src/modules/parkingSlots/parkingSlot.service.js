const ParkingSlot = require('./parkingSlot.model');
const Booking = require('../bookings/booking.model');
const Floor = require('../floors/floor.model');
const Zone = require('../zones/zone.model');
const ParkingLot = require('../parkingLots/parkingLot.model');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');
const { suggestOptimalSlot } = require('../../utils/helpers');
const { emitSlotUpdate } = require('../../sockets/socket.server');

const LOCK_DURATION_MS = 3 * 60 * 1000; // 3 minutes

class ParkingSlotService {
  async getSlots(query) {
    const {
      page = 1,
      limit = 20,
      sort = 'slotCode',
      parkingLot,
      floor,
      zone,
      vehicleType,
      status,
      search,
    } = query;

    const filter = {};
    if (parkingLot) filter.parkingLot = parkingLot;
    if (floor) filter.floor = floor;
    if (zone) filter.zone = zone;
    if (vehicleType) filter.vehicleType = vehicleType;
    if (status) filter.status = status;
    if (search) {
      filter.slotCode = { $regex: search, $options: 'i' };
    }

    return Pagination.paginate(ParkingSlot, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: Pagination.buildSort(sort),
      populate: [
        { path: 'floor', select: 'name floorNumber' },
        { path: 'zone', select: 'name code' },
        { path: 'vehicleType', select: 'name code icon' },
        { path: 'currentSession', select: 'vehicleInfo entryTime sessionCode' },
        { path: 'currentBooking', select: 'bookingCode vehicleInfo scheduledDate startTime endTime user', populate: { path: 'user', select: 'fullName email' } },
      ],
    });
  }

  async getById(id) {
    const slot = await ParkingSlot.findById(id)
      .populate('floor', 'name floorNumber')
      .populate('zone', 'name code')
      .populate('vehicleType', 'name code pricing')
      .populate('currentSession')
      .populate('currentBooking', 'bookingCode user vehicleInfo');

    if (!slot) throw ApiError.notFound('Parking slot not found.');
    return slot;
  }

  async create(data) {
    // Validate floor and zone belong to same parking lot
    const floor = await Floor.findById(data.floor);
    if (!floor) throw ApiError.notFound('Floor not found.');

    if (data.zone) {
      const zone = await Zone.findById(data.zone);
      if (!zone || zone.floor.toString() !== data.floor) {
        throw ApiError.badRequest('Zone does not belong to this floor.');
      }
    }

    const existing = await ParkingSlot.findOne({
      parkingLot: data.parkingLot,
      floor: data.floor,
      slotCode: data.slotCode.toUpperCase(),
      isDeleted: { $ne: true },
    });
    if (existing) throw ApiError.conflict(`Slot code '${data.slotCode}' already exists on this floor.`);

    const slot = await ParkingSlot.create({
      ...data,
      slotCode: data.slotCode.toUpperCase(),
    });

    // Update floor, zone and lot slot counts
    await this._updateFloorSlotCounts(data.floor);
    if (data.zone) await this._updateZoneSlotCounts(data.zone);
    await this._updateLotSlotCounts(data.parkingLot);

    return slot.populate(['floor', 'zone', 'vehicleType']);
  }

  async bulkCreate(slots, parkingLotId) {
    const created = [];
    for (const slotData of slots) {
      try {
        const slot = await this.create({ ...slotData, parkingLot: parkingLotId });
        created.push(slot);
      } catch (err) {
        // Continue on duplicate
      }
    }
    return created;
  }

  async update(id, data) {
    if (data.slotCode) data.slotCode = data.slotCode.toUpperCase();

    const slot = await ParkingSlot.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    })
      .populate('floor', 'name floorNumber')
      .populate('zone', 'name code')
      .populate('vehicleType', 'name code');

    if (!slot) throw ApiError.notFound('Parking slot not found.');
    return slot;
  }

  async updateStatus(id, status, data = {}) {
    const slot = await ParkingSlot.findById(id);
    if (!slot) throw ApiError.notFound('Parking slot not found.');

    const oldStatus = slot.status;
    slot.status = status;

    if (data.currentSession !== undefined) slot.currentSession = data.currentSession;
    if (data.currentBooking !== undefined) slot.currentBooking = data.currentBooking;
    if (data.notes !== undefined) slot.notes = data.notes;

    await slot.save();

    // Sync floor, zone and lot counts if status changed
    if (oldStatus !== status) {
      await this._updateFloorSlotCounts(slot.floor);
      if (slot.zone) await this._updateZoneSlotCounts(slot.zone);
      await this._updateLotSlotCounts(slot.parkingLot);
    }

    return slot;
  }

  async delete(id) {
    const slot = await ParkingSlot.findById(id);
    if (!slot) throw ApiError.notFound('Parking slot not found.');

    if (slot.status === 'occupied') {
      throw ApiError.badRequest('Cannot delete an occupied slot.');
    }

    const floorId = slot.floor;
    const zoneId = slot.zone;
    const lotId = slot.parkingLot;
    slot.isDeleted = true;
    slot.deletedAt = new Date();
    await slot.save();

    await this._updateFloorSlotCounts(floorId);
    if (zoneId) await this._updateZoneSlotCounts(zoneId);
    await this._updateLotSlotCounts(lotId);
    return { message: 'Slot deleted.' };
  }

  /**
   * Find available slots for a vehicle type (with AI-based optimal suggestion)
   */
  async findAvailableSlots(parkingLotId, vehicleTypeId, options = {}) {
    const { floorId, zoneId, preferEV = false, preferHandicapped = false } = options;

    const filter = {
      parkingLot: parkingLotId,
      vehicleType: vehicleTypeId,
      status: 'available',
    };

    if (floorId) filter.floor = floorId;
    if (zoneId) filter.zone = zoneId;

    const slots = await ParkingSlot.find(filter)
      .populate('floor', 'name floorNumber')
      .populate('zone', 'name code')
      .limit(50);

    // AI optimal suggestion
    const optimal = suggestOptimalSlot(slots, null);

    return {
      slots,
      total: slots.length,
      recommended: optimal,
    };
  }

  /**
   * Get realtime slot map for a floor.
   *
   * @param {string} floorId
   * @param {Object} options
   * @param {Date|null} options.wantedStart  - The start of the time window the customer wants to book.
   *                                           When provided, any slot whose booking overlaps this window
   *                                           is returned with computedStatus = 'reserved'.
   * @param {Date|null} options.wantedEnd    - The end of the time window the customer wants to book.
   *
   * If wantedStart/wantedEnd are NOT given (e.g. Staff Live Map), we fall back to
   * a 30-minute forward window so the map shows upcoming bookings as "Reserved" soon.
   */
  async getFloorSlotMap(floorId, { wantedStart = null, wantedEnd = null } = {}) {
    const now = new Date();

    // Staff Live Map fallback: show 'reserved' for bookings starting within 30 min
    const STAFF_WINDOW_MS = 30 * 60 * 1000;
    const staffWindowEnd = new Date(now.getTime() + STAFF_WINDOW_MS);

    const slots = await ParkingSlot.find({ floor: floorId })
      .populate('vehicleType', 'name code icon color')
      .populate({
        path: 'currentSession',
        select: 'vehicleInfo entryTime user monthlyPass status booking',
        populate: [
          { path: 'user', select: 'fullName phone' },
          { path: 'booking', select: 'scheduledDate startTime endTime bookingCode' },
        ]
      })
      .populate({
        path: 'currentBooking',
        select: 'user vehicleInfo scheduledDate startTime endTime status bookingCode',
        populate: { path: 'user', select: 'fullName phone' }
      })
      .sort('slotCode');

    const EARLY_CHECKIN_BUFFER_MS = 15 * 60 * 1000;
    const CHECKOUT_BUFFER_MS      = 15 * 60 * 1000;

    /**
     * Check a list of upcoming bookings for conflict with [wantedStart, wantedEnd].
     * Returns the first conflicting booking or null.
     */
    const findConflictingBooking = (upcomingBookings) => {
      for (const upcoming of upcomingBookings) {
        const [sH, sM] = upcoming.startTime.split(':').map(Number);
        let [eH, eM] = upcoming.endTime.split(':').map(Number);
        if (eH < sH || (eH === sH && eM <= sM)) eH += 24; // cross-midnight

        const bookingStart = new Date(upcoming.scheduledDate);
        bookingStart.setHours(sH, sM, 0, 0);
        const durationMs = ((eH * 60 + eM) - (sH * 60 + sM)) * 60 * 1000;
        const bookingEnd = new Date(bookingStart.getTime() + durationMs);

        const effectiveStart = new Date(bookingStart.getTime() - EARLY_CHECKIN_BUFFER_MS);
        const effectiveEnd   = new Date(bookingEnd.getTime()   + CHECKOUT_BUFFER_MS);

        if (wantedStart < effectiveEnd && wantedEnd > effectiveStart) {
          return upcoming;
        }
      }
      return null;
    };

    const result = await Promise.all(slots.map(async (slot) => {
      const slotObj = slot.toObject();
      slotObj.computedStatus = slotObj.status; // default: same as real DB status

      // ── Case 1: physically available → check upcoming booking conflicts ──
      if (slotObj.status === 'available') {
        const upcomingBookings = await Booking.find({
          assignedSlot: slot._id,
          status: { $in: ['pending', 'approved'] },
        }).sort({ scheduledDate: 1, startTime: 1 }).lean();

        if (wantedStart && wantedEnd) {
          // Customer booking flow: check effective window overlap
          const conflict = findConflictingBooking(upcomingBookings);
          if (conflict) {
            slotObj.computedStatus = 'reserved';
            slotObj.upcomingBooking = {
              bookingCode: conflict.bookingCode,
              startTime:   conflict.startTime,
              endTime:     conflict.endTime,
            };
          }
        } else {
          // Staff Live Map: flag as reserved if effective start is within 30 min
          for (const upcoming of upcomingBookings) {
            const [sH, sM] = upcoming.startTime.split(':').map(Number);
            const bookingStart = new Date(upcoming.scheduledDate);
            bookingStart.setHours(sH, sM, 0, 0);
            const effectiveStart = new Date(bookingStart.getTime() - EARLY_CHECKIN_BUFFER_MS);
            if (effectiveStart >= now && effectiveStart <= staffWindowEnd) {
              slotObj.computedStatus = 'reserved';
              slotObj.upcomingBooking = {
                bookingCode: upcoming.bookingCode,
                startTime:   upcoming.startTime,
                endTime:     upcoming.endTime,
              };
              break;
            }
          }
        }
      }

      // ── Case 2: physically OCCUPIED but customer wants a FUTURE window ──
      // Check if the current session's booking ends before wantedStart (+ checkout buffer).
      // Source priority: slot.currentSession.booking > slot.currentBooking (for older records).
      if (slotObj.status === 'occupied' && wantedStart && wantedEnd) {
        // Resolve the booking attached to the current occupancy
        const occupantBooking =
          slotObj.currentSession?.booking ||   // populated from session (preferred)
          slotObj.currentBooking;              // fallback: direct slot field

        if (occupantBooking?.endTime && occupantBooking?.scheduledDate) {
          // Build absolute end time, handling cross-midnight
          const [sh, sm] = (occupantBooking.startTime || '00:00').split(':').map(Number);
          const [eh, em] = occupantBooking.endTime.split(':').map(Number);
          const plainEnd = new Date(occupantBooking.scheduledDate);
          plainEnd.setHours(eh, em, 0, 0);
          if (eh < sh || (eh === sh && em <= sm)) {
            plainEnd.setDate(plainEnd.getDate() + 1); // cross-midnight
          }
          const effectiveSessionEnd = new Date(plainEnd.getTime() + CHECKOUT_BUFFER_MS);

          if (effectiveSessionEnd <= wantedStart) {
            // Car will have left by wantedStart — check for OTHER future booking conflicts
            const upcomingBookings = await Booking.find({
              assignedSlot: slot._id,
              status: { $in: ['pending', 'approved'] },
            }).sort({ scheduledDate: 1, startTime: 1 }).lean();

            const conflict = findConflictingBooking(upcomingBookings);
            if (conflict) {
              slotObj.computedStatus = 'reserved';
              slotObj.upcomingBooking = {
                bookingCode: conflict.bookingCode,
                startTime:   conflict.startTime,
                endTime:     conflict.endTime,
              };
            } else {
              slotObj.computedStatus = 'available';
            }
          }
          // else: car still there during wanted window → keep 'occupied'
        }
        // If no booking info (anonymous walk-in), can't determine end time → keep 'occupied'
      }

      return slotObj;
    }));

    return result;
  }

  /**
   * Sync slot counts on floor model
   */
  async _updateFloorSlotCounts(floorId) {
    const result = await ParkingSlot.aggregate([
      {
        $match: {
          floor: require('mongoose').Types.ObjectId.isValid(floorId)
            ? new (require('mongoose').Types.ObjectId)(floorId)
            : floorId,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = { total: 0, available: 0, occupied: 0 };
    result.forEach(r => {
      counts[r._id] = r.count;
      counts.total += r.count;
    });

    await Floor.findByIdAndUpdate(floorId, {
      totalSlots: counts.total,
      availableSlots: counts.available || 0,
      occupiedSlots: counts.occupied || 0,
    });
  }

  /**
   * Sync slot counts on zone model
   */
  async _updateZoneSlotCounts(zoneId) {
    const mongoose = require('mongoose');
    const result = await ParkingSlot.aggregate([
      {
        $match: {
          zone: mongoose.Types.ObjectId.isValid(zoneId)
            ? new mongoose.Types.ObjectId(zoneId)
            : zoneId,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = { total: 0, available: 0 };
    result.forEach(r => {
      if (r._id === 'available') counts.available = r.count;
      counts.total += r.count;
    });

    await Zone.findByIdAndUpdate(zoneId, {
      totalSlots: counts.total,
      availableSlots: counts.available,
    });
  }

  /**
   * Sync slot counts on ParkingLot model (totalSlots, availableSlots, occupiedSlots)
   */
  async _updateLotSlotCounts(lotId) {
    if (!lotId) return;
    const mongoose = require('mongoose');
    const result = await ParkingSlot.aggregate([
      {
        $match: {
          parkingLot: mongoose.Types.ObjectId.isValid(lotId)
            ? new mongoose.Types.ObjectId(lotId)
            : lotId,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = { total: 0, available: 0, occupied: 0 };
    result.forEach(r => {
      counts[r._id] = r.count;
      counts.total += r.count;
    });

    await ParkingLot.findByIdAndUpdate(lotId, {
      totalSlots: counts.total,
      availableSlots: counts.available || 0,
      occupiedSlots: counts.occupied || 0,
    });
  }

  /**
   * Temporarily lock a slot so other users can't select it (3 min TTL)
   */
  async lockSlot(slotId, userId, wantedStart = null) {
    const slot = await ParkingSlot.findById(slotId);
    if (!slot) throw ApiError.notFound('Parking slot not found.');

    const now = new Date();

    // If already locked by someone else and lock hasn't expired
    if (
      slot.lockedBy &&
      slot.lockedBy.toString() !== userId.toString() &&
      slot.lockedUntil && slot.lockedUntil > now
    ) {
      const secsLeft = Math.ceil((slot.lockedUntil - now) / 1000);
      throw ApiError.conflict(`Slot is being selected by another user. Please try again in ${secsLeft}s.`);
    }

    // If slot is already occupied or reserved, check if it can be booked for a future window.
    // For occupied slots: allow if the current occupant's booking ends before wantedStart.
    if (slot.status === 'occupied' || slot.status === 'reserved') {
      // If the caller provides wantedStart, check if the current occupant leaves in time.
      if (wantedStart) {
        const CHECKOUT_BUFFER_MS = 15 * 60 * 1000;
        // Try to resolve end time from currentBooking (set since the fix) or currentSession's booking
        let canProceed = false;
        const currentBooking = slot.currentBooking
          ? await require('../bookings/booking.model').findById(slot.currentBooking).select('scheduledDate startTime endTime').lean()
          : null;
        if (currentBooking?.endTime && currentBooking?.scheduledDate) {
          const [sh, sm] = (currentBooking.startTime || '00:00').split(':').map(Number);
          const [eh, em] = currentBooking.endTime.split(':').map(Number);
          const plainEnd = new Date(currentBooking.scheduledDate);
          plainEnd.setHours(eh, em, 0, 0);
          if (eh < sh || (eh === sh && em <= sm)) plainEnd.setDate(plainEnd.getDate() + 1);
          const effectiveEnd = new Date(plainEnd.getTime() + CHECKOUT_BUFFER_MS);
          canProceed = effectiveEnd <= new Date(wantedStart);
        } else {
          // Try via currentSession's booking
          const ParkingSession = require('../parkingSessions/parkingSession.model');
          const sess = slot.currentSession
            ? await ParkingSession.findById(slot.currentSession)
                .populate('booking', 'scheduledDate startTime endTime')
                .lean()
            : null;
          const sessBooking = sess?.booking;
          if (sessBooking?.endTime && sessBooking?.scheduledDate) {
            const [sh, sm] = (sessBooking.startTime || '00:00').split(':').map(Number);
            const [eh, em] = sessBooking.endTime.split(':').map(Number);
            const plainEnd = new Date(sessBooking.scheduledDate);
            plainEnd.setHours(eh, em, 0, 0);
            if (eh < sh || (eh === sh && em <= sm)) plainEnd.setDate(plainEnd.getDate() + 1);
            const effectiveEnd = new Date(plainEnd.getTime() + CHECKOUT_BUFFER_MS);
            canProceed = effectiveEnd <= new Date(wantedStart);
          }
        }
        if (!canProceed) {
          throw ApiError.badRequest(`Slot is ${slot.status} and cannot be selected for this time window.`);
        }
        // Slot will be free — proceed with lock
      } else {
        throw ApiError.badRequest(`Slot is ${slot.status} and cannot be selected.`);
      }
    }

    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
    slot.lockedBy = userId;
    slot.lockedUntil = lockedUntil;
    await slot.save();

    // Emit real-time lock event
    try {
      emitSlotUpdate(slot.parkingLot.toString(), {
        slotId: slot._id,
        slotCode: slot.slotCode,
        status: slot.status, // still 'available' but now locked
        locked: true,
        lockedBy: userId,
        lockedUntil: lockedUntil.toISOString(),
        floorId: slot.floor,
        zoneId: slot.zone,
      });
    } catch (_) { /* socket may not be ready */ }

    return { slotId: slot._id, slotCode: slot.slotCode, lockedUntil };
  }

  /**
   * Release a slot lock (user deselects or leaves the page)
   */
  async unlockSlot(slotId, userId) {
    const slot = await ParkingSlot.findById(slotId);
    if (!slot) throw ApiError.notFound('Parking slot not found.');

    // Only the lock owner can release it
    if (slot.lockedBy && slot.lockedBy.toString() !== userId.toString()) {
      throw ApiError.forbidden('You did not lock this slot.');
    }

    slot.lockedBy = null;
    slot.lockedUntil = null;
    await slot.save();

    // Emit real-time unlock event
    try {
      emitSlotUpdate(slot.parkingLot.toString(), {
        slotId: slot._id,
        slotCode: slot.slotCode,
        status: slot.status,
        locked: false,
        floorId: slot.floor,
        zoneId: slot.zone,
      });
    } catch (_) { /* socket may not be ready */ }

    return { slotId: slot._id, slotCode: slot.slotCode };
  }

  /**
   * Auto-clean expired locks (can be called periodically)
   */
  async cleanExpiredLocks() {
    const now = new Date();
    const expired = await ParkingSlot.find({
      lockedBy: { $ne: null },
      lockedUntil: { $lt: now },
    });
    for (const slot of expired) {
      try {
        emitSlotUpdate(slot.parkingLot.toString(), {
          slotId: slot._id,
          slotCode: slot.slotCode,
          status: slot.status,
          locked: false,
          floorId: slot.floor,
          zoneId: slot.zone,
        });
      } catch (_) {}
      slot.lockedBy = null;
      slot.lockedUntil = null;
      await slot.save();
    }
    return expired.length;
  }

  async getOccupancyByVehicleType(parkingLotId) {
    const mongoose = require('mongoose');
    const result = await ParkingSlot.aggregate([
      {
        $match: {
          parkingLot: new mongoose.Types.ObjectId(parkingLotId),
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: { vehicleType: '$vehicleType', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'vehicletypes',
          localField: '_id.vehicleType',
          foreignField: '_id',
          as: 'vehicleType',
        },
      },
      { $unwind: '$vehicleType' },
      {
        $group: {
          _id: '$vehicleType.name',
          statuses: {
            $push: { status: '$_id.status', count: '$count' },
          },
        },
      },
    ]);

    return result;
  }
}

module.exports = new ParkingSlotService();
