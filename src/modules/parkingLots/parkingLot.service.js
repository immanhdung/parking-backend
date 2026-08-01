const ParkingLot = require('./parkingLot.model');
const Floor = require('../floors/floor.model');
const ParkingSlot = require('../parkingSlots/parkingSlot.model');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');

class ParkingLotService {
  async getAll(query) {
    const { page = 1, limit = 10, sort = '-createdAt', search, status, city, manager } = query;

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
    if (manager) filter.manager = manager;

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

  async create(data) {
    const existing = await ParkingLot.findOne({ code: data.code.toUpperCase() });
    if (existing) throw ApiError.conflict(`Parking lot code '${data.code}' already exists.`);

    if (data.manager) {
      const User = require('../users/user.model');
      const managerUser = await User.findById(data.manager);
      if (!managerUser) throw ApiError.notFound('Manager user not found.');
      if (managerUser.role !== 'parking_manager' && managerUser.role !== 'system_admin') {
        throw ApiError.badRequest('Assigned user must be a parking manager.');
      }
    }

    const lot = await ParkingLot.create({
      ...data,
      code: data.code.toUpperCase(),
      manager: data.manager || null,
    });

    if (data.manager) {
      const User = require('../users/user.model');
      await User.findByIdAndUpdate(data.manager, { assignedParkingLot: lot._id });
    }

    return lot;
  }

  async update(id, data) {
    if (data.code) {
      const existing = await ParkingLot.findOne({ code: data.code.toUpperCase(), _id: { $ne: id } });
      if (existing) throw ApiError.conflict(`Parking lot code '${data.code}' already exists.`);
      data.code = data.code.toUpperCase();
    }

    const lot = await ParkingLot.findById(id);
    if (!lot) throw ApiError.notFound('Parking lot not found.');
    
    const oldManager = lot.manager;

    if (data.manager && data.manager !== oldManager?.toString()) {
      const User = require('../users/user.model');
      const managerUser = await User.findById(data.manager);
      if (!managerUser) throw ApiError.notFound('Manager user not found.');
      if (managerUser.role !== 'parking_manager' && managerUser.role !== 'system_admin') {
        throw ApiError.badRequest('Assigned user must be a parking manager.');
      }
    }

    const updatedLot = await ParkingLot.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate('manager', 'fullName email phone');

    // Handle manager change bidirectional sync
    if (data.manager !== undefined && data.manager !== oldManager?.toString()) {
      const User = require('../users/user.model');
      // Clear old manager's assigned lot
      if (oldManager) {
        await User.findByIdAndUpdate(oldManager, { assignedParkingLot: null });
      }
      // Set new manager's assigned lot
      if (data.manager) {
        // If this manager was assigned to another lot, clear that lot's manager field
        const newManagerUser = await User.findById(data.manager);
        if (newManagerUser && newManagerUser.assignedParkingLot && newManagerUser.assignedParkingLot.toString() !== id) {
          await ParkingLot.findByIdAndUpdate(newManagerUser.assignedParkingLot, { manager: null });
        }
        await User.findByIdAndUpdate(data.manager, { assignedParkingLot: id });
      }
    }

    return updatedLot;
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
  async getStaff(parkingLotId) {
    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    const User = require('../users/user.model');
    const staff = await User.find({
      _id: { $in: lot.staff },
      role: { $in: ['parking_staff', 'parking_manager'] },
    })
      .select('fullName email phone avatar status role createdAt')
      .sort({ fullName: 1 });

    return staff;
  }

  /**
   * Assign a staff member to a parking lot
   */
  async assignStaff(parkingLotId, staffId) {
    const User = require('../users/user.model');

    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    // Validate staff user
    const staffUser = await User.findById(staffId);
    if (!staffUser) throw ApiError.notFound('Staff user not found.');
    if (!['parking_staff', 'parking_manager'].includes(staffUser.role)) {
      throw ApiError.badRequest('User must be a staff or a manager.');
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
  async removeStaff(parkingLotId, staffId) {
    const User = require('../users/user.model');

    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

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
      role: { $in: ['parking_staff', 'parking_manager'] },
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
   * Admin: assign manager to a parking lot by email.
   * - Upgrades user role to parking_manager if needed
   * - One manager can manage multiple lots
   * - Sends notification email
   */
  async assignManagerByEmail(parkingLotId, email) {
    const User = require('../users/user.model');
    const { sendEmail } = require('../../utils/email');

    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) throw ApiError.notFound(`No user found with email "${email}".`);

    if (user.role === 'system_admin') {
      throw ApiError.badRequest('Cannot assign system_admin as a parking manager.');
    }

    // Check if already manager of this lot
    if (lot.manager?.toString() === user._id.toString()) {
      throw ApiError.conflict('User is already the manager of this parking lot.');
    }

    // Promote role to parking_manager
    user.role = 'parking_manager';
    // Add this lot to user's assigned lots (no conflict check)
    await User.findByIdAndUpdate(user._id, {
      role: 'parking_manager',
      $addToSet: { assignedParkingLot: parkingLotId },
    });

    lot.manager = user._id;
    await lot.save();

    // Send notification email (non-blocking)
    sendEmail({
      to: user.email,
      subject: `You have been appointed as Manager – ${lot.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">🏢 Manager Appointment</h2>
          <p>Hi <strong>${user.fullName}</strong>,</p>
          <p>You have been appointed as the <strong>Parking Manager</strong> for:</p>
          <div style="background: #f5f3ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #4f46e5;">
            <p style="margin:0"><strong>${lot.name}</strong></p>
            <p style="margin:4px 0 0; color:#6b7280;">${lot.address?.street || ''} ${lot.address?.district || ''}, ${lot.address?.city || ''}</p>
          </div>
          <p>You can now log in to the Manager Portal to set up and manage this building.</p>
          <p style="color: #6b7280; font-size: 12px;">If this was a mistake, please contact your system administrator.</p>
        </div>
      `,
    }).catch(() => {});

    return { message: 'Manager assigned successfully.', user: { _id: user._id, fullName: user.fullName, email: user.email } };
  }

  /**
   * Manager: add staff to their parking lot by email.
   * - Sets user role to parking_staff
   * - Staff can work at multiple lots
   * - Sends notification email
   */
  async addStaffByEmail(parkingLotId, email, requestingUserId) {
    const User = require('../users/user.model');
    const { sendEmail } = require('../../utils/email');

    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    // Ensure the requester manages this lot (or is admin)
    if (requestingUserId) {
      const isManager = lot.manager?.toString() === requestingUserId.toString();
      if (!isManager) {
        const reqUser = await User.findById(requestingUserId);
        if (reqUser?.role !== 'system_admin') {
          throw ApiError.forbidden('You are not the manager of this parking lot.');
        }
      }
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) throw ApiError.notFound(`No user found with email "${email}".`);

    if (user.role === 'system_admin') {
      throw ApiError.badRequest('Cannot assign system_admin as staff.');
    }
    if (user.role === 'parking_manager') {
      throw ApiError.badRequest('User is a parking manager and cannot be added as staff.');
    }

    // Check if already in this lot's staff list
    if (lot.staff.some(id => id.toString() === user._id.toString())) {
      throw ApiError.conflict('User is already assigned to this parking lot.');
    }

    // Set role to parking_staff & add lot to user's assigned lots
    await User.findByIdAndUpdate(user._id, {
      role: 'parking_staff',
      $addToSet: { assignedParkingLot: parkingLotId },
    });

    lot.staff.push(user._id);
    await lot.save();

    // Send notification email (non-blocking)
    sendEmail({
      to: user.email,
      subject: `You have been added as Staff – ${lot.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">👷 Staff Assignment</h2>
          <p>Hi <strong>${user.fullName}</strong>,</p>
          <p>You have been assigned as <strong>Parking Staff</strong> at:</p>
          <div style="background: #f5f3ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #7c3aed;">
            <p style="margin:0"><strong>${lot.name}</strong></p>
            <p style="margin:4px 0 0; color:#6b7280;">${lot.address?.street || ''} ${lot.address?.district || ''}, ${lot.address?.city || ''}</p>
          </div>
          <p>Please log in to the Staff Portal to view your schedule and duties.</p>
          <p style="color: #6b7280; font-size: 12px;">If this was a mistake, please contact your manager.</p>
        </div>
      `,
    }).catch(() => {});

    return { message: 'Staff added successfully.', user: { _id: user._id, fullName: user.fullName, email: user.email } };
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

