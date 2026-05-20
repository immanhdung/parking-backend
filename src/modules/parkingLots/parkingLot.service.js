const ParkingLot = require('./parkingLot.model');
const Floor = require('../floors/floor.model');
const ParkingSlot = require('../parkingSlots/parkingSlot.model');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');

class ParkingLotService {
  async getAll(query) {
    const { page = 1, limit = 10, sort = '-createdAt', search, status, city } = query;

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { 'address.district': { $regex: search, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;
    if (city) filter['address.city'] = { $regex: city, $options: 'i' };

    return Pagination.paginate(ParkingLot, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: Pagination.buildSort(sort),
      populate: { path: 'manager', select: 'fullName email phone' },
    });
  }

  async getById(id) {
    const lot = await ParkingLot.findById(id)
      .populate('manager', 'fullName email phone avatar')
      .populate('staff', 'fullName email phone');
    if (!lot) throw ApiError.notFound('Parking lot not found.');
    return lot;
  }

  async create(data, managerId) {
    const existing = await ParkingLot.findOne({ code: data.code.toUpperCase() });
    if (existing) throw ApiError.conflict(`Parking lot code '${data.code}' already exists.`);

    const lot = await ParkingLot.create({
      ...data,
      code: data.code.toUpperCase(),
      manager: managerId,
    });
    return lot;
  }

  async update(id, data) {
    if (data.code) {
      const existing = await ParkingLot.findOne({ code: data.code.toUpperCase(), _id: { $ne: id } });
      if (existing) throw ApiError.conflict(`Parking lot code '${data.code}' already exists.`);
      data.code = data.code.toUpperCase();
    }

    const lot = await ParkingLot.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate('manager', 'fullName email');

    if (!lot) throw ApiError.notFound('Parking lot not found.');
    return lot;
  }

  async delete(id) {
    const lot = await ParkingLot.findById(id);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    lot.isDeleted = true;
    lot.deletedAt = new Date();
    await lot.save();
    return { message: 'Parking lot deleted.' };
  }

  async getSlotsSummary(parkingLotId) {
    const slots = await ParkingSlot.aggregate([
      { $match: { parkingLot: require('mongoose').Types.ObjectId(parkingLotId), isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = {
      total: 0,
      available: 0,
      occupied: 0,
      reserved: 0,
      maintenance: 0,
      locked: 0,
    };

    slots.forEach(s => {
      summary[s._id] = s.count;
      summary.total += s.count;
    });

    return summary;
  }

  /**
   * Update slot counts on the parking lot (called when slot status changes)
   */
  async syncSlotCounts(parkingLotId) {
    const mongoose = require('mongoose');
    const objectId = mongoose.Types.ObjectId.isValid(parkingLotId)
      ? new mongoose.Types.ObjectId(parkingLotId)
      : parkingLotId;

    const result = await ParkingSlot.aggregate([
      { $match: { parkingLot: objectId, isDeleted: { $ne: true } } },
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

    await ParkingLot.findByIdAndUpdate(parkingLotId, {
      totalSlots: counts.total,
      availableSlots: counts.available || 0,
      occupiedSlots: counts.occupied || 0,
    });
  }
}

module.exports = new ParkingLotService();
