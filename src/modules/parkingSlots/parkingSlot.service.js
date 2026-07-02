const ParkingSlot = require('./parkingSlot.model');
const Floor = require('../floors/floor.model');
const Zone = require('../zones/zone.model');
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
      slotCode: data.slotCode.toUpperCase(),
    });
    if (existing) throw ApiError.conflict(`Slot code '${data.slotCode}' already exists in this parking lot.`);

    const slot = await ParkingSlot.create({
      ...data,
      slotCode: data.slotCode.toUpperCase(),
    });

    // Update floor and zone slot counts
    await this._updateFloorSlotCounts(data.floor);

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

    // Sync floor counts if status changed
    if (oldStatus !== status) {
      await this._updateFloorSlotCounts(slot.floor);
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
    slot.isDeleted = true;
    slot.deletedAt = new Date();
    await slot.save();

    await this._updateFloorSlotCounts(floorId);
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
   * Get realtime slot map for a floor
   */
  async getFloorSlotMap(floorId) {
    const slots = await ParkingSlot.find({ floor: floorId })
      .populate('vehicleType', 'name code icon color')
      .populate({
        path: 'currentSession',
        select: 'vehicleInfo entryTime user monthlyPass status',
        populate: { path: 'user', select: 'fullName phone' }
      })
      .populate({
        path: 'currentBooking',
        select: 'user vehicleInfo scheduledDate startTime endTime status bookingCode',
        populate: { path: 'user', select: 'fullName phone' }
      })
      .sort('slotCode');

    return slots;
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
   * Temporarily lock a slot so other users can't select it (3 min TTL)
   */
  async lockSlot(slotId, userId) {
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

    // If slot is already reserved or occupied
    if (slot.status === 'occupied' || slot.status === 'reserved') {
      throw ApiError.badRequest(`Slot is ${slot.status} and cannot be selected.`);
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
