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
   * Get staff list assigned to a parking lot
   */
  async getStaff(parkingLotId, managerId) {
    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    // Verify manager owns this lot
    if (managerId && lot.manager?.toString() !== managerId.toString()) {
      throw ApiError.forbidden('You are not the manager of this parking lot.');
    }

    const User = require('../users/user.model');
    const staff = await User.find({
      _id: { $in: lot.staff },
      role: 'parking_staff',
    })
      .select('fullName email phone avatar status createdAt')
      .sort({ fullName: 1 });

    return staff;
  }

  /**
   * Assign a staff member to a parking lot
   */
  async assignStaff(parkingLotId, staffId, managerId) {
    const User = require('../users/user.model');

    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    // Verify manager owns this lot
    if (managerId && lot.manager?.toString() !== managerId.toString()) {
      throw ApiError.forbidden('You are not the manager of this parking lot.');
    }

    // Validate staff user
    const staffUser = await User.findById(staffId);
    if (!staffUser) throw ApiError.notFound('Staff user not found.');
    if (staffUser.role !== 'parking_staff') {
      throw ApiError.badRequest('User is not a parking staff member.');
    }

    // Check if already assigned to another lot
    if (
      staffUser.assignedParkingLot &&
      staffUser.assignedParkingLot.toString() !== parkingLotId
    ) {
      const otherLot = await ParkingLot.findById(staffUser.assignedParkingLot).select('name');
      throw ApiError.conflict(
        `Staff is already assigned to parking lot "${otherLot?.name || 'another lot'}". Remove them first.`
      );
    }

    // Check if already in this lot's staff list
    if (lot.staff.some(id => id.toString() === staffId)) {
      throw ApiError.conflict('Staff is already assigned to this parking lot.');
    }

    // Add staff to parking lot
    lot.staff.push(staffId);
    await lot.save();

    // Update user's assignedParkingLot
    staffUser.assignedParkingLot = parkingLotId;
    await staffUser.save({ validateBeforeSave: false });

    return {
      message: 'Staff assigned successfully.',
      staff: {
        _id: staffUser._id,
        fullName: staffUser.fullName,
        email: staffUser.email,
        phone: staffUser.phone,
      },
    };
  }

  /**
   * Remove a staff member from a parking lot
   */
  async removeStaff(parkingLotId, staffId, managerId) {
    const User = require('../users/user.model');

    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    // Verify manager owns this lot
    if (managerId && lot.manager?.toString() !== managerId.toString()) {
      throw ApiError.forbidden('You are not the manager of this parking lot.');
    }

    // Check if staff is in the lot's staff list
    const staffIndex = lot.staff.findIndex(id => id.toString() === staffId);
    if (staffIndex === -1) {
      throw ApiError.notFound('Staff is not assigned to this parking lot.');
    }

    // Remove from lot
    lot.staff.splice(staffIndex, 1);
    await lot.save();

    // Clear user's assignedParkingLot
    await User.findByIdAndUpdate(staffId, { assignedParkingLot: null });

    return { message: 'Staff removed from parking lot.' };
  }

  /**
   * Get available staff (not assigned to any parking lot)
   */
  async getAvailableStaff(query) {
    const User = require('../users/user.model');
    const { search } = query || {};

    const filter = {
      role: 'parking_staff',
      $or: [
        { assignedParkingLot: null },
        { assignedParkingLot: { $exists: false } },
      ],
      status: 'active',
    };

    if (search) {
      filter.$and = [
        {
          $or: [
            { fullName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ],
        },
      ];
    }

    const staff = await User.find(filter)
      .select('fullName email phone avatar status createdAt')
      .sort({ fullName: 1 });

    return staff;
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
