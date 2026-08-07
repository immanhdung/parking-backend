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
      .populate('managers', 'fullName email phone avatar role')
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

    const mongoose = require('mongoose');
    const Zone = require('../zones/zone.model');
    const Booking = require('../bookings/booking.model');
    const Payment = require('../payments/payment.model');
    const MonthlyPass = require('../monthlyPasses/monthlyPass.model');
    const Notification = require('../notifications/notification.model');
    const User = require('../users/user.model');
    const ParkingSession = require('../parkingSessions/parkingSession.model');
    const lotObjectId = new mongoose.Types.ObjectId(id);

    // ── Guard 1: Active sessions (cars still parked) ─────────────────────────
    const activeSessions = await ParkingSession.countDocuments({ parkingLot: id, status: 'active' });
    if (activeSessions > 0) {
      throw ApiError.badRequest(
        `Cannot delete: ${activeSessions} vehicle(s) are currently parked. Check out all vehicles first.`
      );
    }

    // ── Pre-delete: cancel processing payments to prevent SEPay webhook crash ─
    // Orphaned 'processing' payments would cause payment.service.js to throw
    // "Payment not found" when the webhook arrives after deletion.
    await Payment.updateMany(
      { parkingLot: id, status: { $in: ['pending', 'processing'] } },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Parking lot deleted by admin' } }
    );

    // ── Cascade delete ────────────────────────────────────────────────────────
    // 1. Slots — native driver to bypass the pre-find isDeleted middleware
    await ParkingSlot.collection.deleteMany({ parkingLot: lotObjectId });

    // 2. Zones — bypass pre-find middleware
    await Zone.collection.deleteMany({ parkingLot: lotObjectId });

    // 3. Floors — bypass pre-find middleware
    await Floor.collection.deleteMany({ parkingLot: lotObjectId });

    // 4. Historical parking sessions (confirmed no active ones above)
    await ParkingSession.deleteMany({ parkingLot: id });

    // 5. All bookings (past/cancelled — upcoming already blocked above)
    await Booking.deleteMany({ parkingLot: id });

    // 6. Payments (processing ones already cancelled above)
    await Payment.deleteMany({ parkingLot: id });

    // 7. Monthly passes (active ones already blocked above)
    await MonthlyPass.deleteMany({ parkingLot: id });

    // 8. Notifications — best-effort
    try {
      await Notification.deleteMany({ 'data.parkingLotId': id.toString() });
    } catch (_) { /* skip if notification model differs */ }

    // 9. Unassign staff/managers — $pull only removes THIS lot's ref.
    //    Users with other lots assigned remain fully functional.
    await User.updateMany(
      { assignedParkingLot: id },
      { $pull: { assignedParkingLot: id } }
    );

    // 10. Delete the lot document itself
    await ParkingLot.findByIdAndDelete(id);

    return { message: `Parking lot "${lot.name}" and all related data deleted successfully.` };
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

    // Collect all staff IDs
    const staffIds = [...lot.staff];
    // Include all managers from managers[] array
    (lot.managers || []).forEach(mId => {
      if (!staffIds.some(id => id.toString() === mId.toString())) {
        staffIds.push(mId);
      }
    });
    // Also include legacy lot.manager if not already in list
    if (lot.manager && !staffIds.some(id => id.toString() === lot.manager.toString())) {
      staffIds.push(lot.manager);
    }

    const staff = await User.find({
      _id: { $in: staffIds },
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

    // Check if already assigned to another lot (staff: one lot only)
    const currentAssigned = Array.isArray(staffUser.assignedParkingLot)
      ? staffUser.assignedParkingLot.map(id => id.toString())
      : [];
    const alreadyInOtherLot = currentAssigned.some(id => id !== parkingLotId);
    if (alreadyInOtherLot) {
      const otherLotId = currentAssigned.find(id => id !== parkingLotId);
      const otherLot = await ParkingLot.findById(otherLotId).select('name');
      throw ApiError.conflict(
        `Staff is already assigned to "${otherLot?.name || 'another lot'}". Remove them first.`
      );
    }

    // Check if already in this lot's staff list
    if (lot.staff.some(id => id.toString() === staffId)) {
      throw ApiError.conflict('Staff is already assigned to this parking lot.');
    }

    // Add staff to parking lot
    lot.staff.push(staffId);
    await lot.save();

    // Update user's assignedParkingLot (replace entirely — staff: one lot only)
    await User.findByIdAndUpdate(staffId, { assignedParkingLot: [parkingLotId] });

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

    // Clear user's assignedParkingLot (set to empty array)
    await User.findByIdAndUpdate(staffId, { assignedParkingLot: [] });

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
      // Available = not assigned to any lot (empty array or missing field)
      $or: [
        { assignedParkingLot: { $exists: false } },
        { assignedParkingLot: null },
        { assignedParkingLot: { $size: 0 } },
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
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');

    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });
    let isNewUser = false;
    let tempPassword = null;

    if (!user) {
      // Auto-create account
      tempPassword = crypto.randomBytes(6).toString('hex'); // e.g. "a3f9c2b1d4e5"
      const hashed = await bcrypt.hash(tempPassword, 12);
      user = await User.create({
        fullName: normalizedEmail.split('@')[0],
        email: normalizedEmail,
        password: hashed,
        role: 'parking_manager',
        status: 'active',
        isEmailVerified: true,
        assignedParkingLot: [parkingLotId],
      });
      isNewUser = true;
    } else {
      if (user.role === 'system_admin') {
        throw ApiError.badRequest('Cannot assign system_admin as a parking manager.');
      }
      if (lot.manager?.toString() === user._id.toString()) {
        throw ApiError.conflict('User is already the manager of this parking lot.');
      }
      await User.findByIdAndUpdate(user._id, {
        role: 'parking_manager',
        $addToSet: { assignedParkingLot: parkingLotId },
      });
    }

    // Update lot: set primary manager + add to managers[]
    lot.manager = user._id;
    if (!(lot.managers || []).some(id => id.toString() === user._id.toString())) {
      lot.managers = [...(lot.managers || []), user._id];
    }
    await lot.save();

    // Send email
    const subject = isNewUser
      ? `Your new Manager account – ${lot.name}`
      : `You have been appointed as Manager – ${lot.name}`;

    const html = isNewUser ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">🏢 Welcome to Parking Management</h2>
        <p>Hi <strong>${user.fullName}</strong>,</p>
        <p>An account has been created for you as <strong>Parking Manager</strong> at:</p>
        <div style="background: #f5f3ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #4f46e5;">
          <p style="margin:0"><strong>${lot.name}</strong></p>
          <p style="margin:4px 0 0; color:#6b7280;">${lot.address?.street || ''} ${lot.address?.district || ''}, ${lot.address?.city || ''}</p>
        </div>
        <p>Your login credentials:</p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; font-family: monospace;">
          <p style="margin:0"><strong>Email:</strong> ${user.email}</p>
          <p style="margin:4px 0 0"><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        <p style="color: #ef4444; font-size: 13px;">⚠️ Please change your password after first login.</p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">🏢 Manager Appointment</h2>
        <p>Hi <strong>${user.fullName}</strong>,</p>
        <p>You have been appointed as the <strong>Parking Manager</strong> for:</p>
        <div style="background: #f5f3ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #4f46e5;">
          <p style="margin:0"><strong>${lot.name}</strong></p>
          <p style="margin:4px 0 0; color:#6b7280;">${lot.address?.street || ''} ${lot.address?.district || ''}, ${lot.address?.city || ''}</p>
        </div>
        <p>You can now log in to the Manager Portal to set up and manage this building.</p>
      </div>
    `;

    sendEmail({ to: user.email, subject, html }).catch(() => {});

    return { message: isNewUser ? 'Account created and manager assigned.' : 'Manager assigned successfully.', user: { _id: user._id, fullName: user.fullName, email: user.email, isNewUser } };
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
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');

    const lot = await ParkingLot.findById(parkingLotId);
    if (!lot) throw ApiError.notFound('Parking lot not found.');

    // Ensure the requester manages this lot (or is admin)
    if (requestingUserId) {
      const allManagerIds = [
        ...(lot.managers || []).map(id => id.toString()),
        lot.manager ? lot.manager.toString() : null,
      ].filter(Boolean);
      const isInLotManagerList = allManagerIds.includes(requestingUserId.toString());

      if (!isInLotManagerList) {
        const reqUser = await User.findById(requestingUserId);
        if (reqUser?.role === 'system_admin') {
          // system_admin always allowed — fall through
        } else if (reqUser?.role === 'parking_manager') {
          // Also accept managers whose assignedParkingLot contains this lot
          // (covers cases where lot.managers[] wasn't updated by the old assignment path)
          const assignedIds = Array.isArray(reqUser.assignedParkingLot)
            ? reqUser.assignedParkingLot.map(id => id.toString())
            : reqUser.assignedParkingLot
              ? [reqUser.assignedParkingLot.toString()]
              : [];
          if (!assignedIds.includes(parkingLotId.toString())) {
            throw ApiError.forbidden('You are not the manager of this parking lot.');
          }
        } else {
          throw ApiError.forbidden('You are not the manager of this parking lot.');
        }
      }
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });
    let isNewUser = false;
    let tempPassword = null;

    if (!user) {
      // Auto-create account with 1 lot only
      tempPassword = crypto.randomBytes(6).toString('hex');
      const hashed = await bcrypt.hash(tempPassword, 12);
      user = await User.create({
        fullName: normalizedEmail.split('@')[0],
        email: normalizedEmail,
        password: hashed,
        role: 'parking_staff',
        status: 'active',
        isEmailVerified: true,
        assignedParkingLot: [parkingLotId],
      });
      isNewUser = true;
    } else {
      if (user.role === 'system_admin') {
        throw ApiError.badRequest('Cannot assign system_admin as staff.');
      }
      if (user.role === 'parking_manager') {
        throw ApiError.badRequest('User is a parking manager and cannot be added as staff.');
      }
      if (lot.staff.some(id => id.toString() === user._id.toString())) {
        throw ApiError.conflict('User is already assigned to this parking lot.');
      }

      // If staff is already in another lot, block the assignment
      const currentAssigned = Array.isArray(user.assignedParkingLot)
        ? user.assignedParkingLot.map(id => id.toString())
        : [];
      const oldLotIds = currentAssigned.filter(id => id !== parkingLotId);
      if (oldLotIds.length > 0) {
        const otherLot = await ParkingLot.findById(oldLotIds[0]).select('name');
        throw ApiError.conflict(
          `Staff is already working at "${otherLot?.name || 'another lot'}". Remove them from that lot first.`
        );
      }

      // Assign to this lot (replace entirely — staff: one lot only)
      await User.findByIdAndUpdate(user._id, {
        role: 'parking_staff',
        assignedParkingLot: [parkingLotId],
      });
    }

    if (!isNewUser) {
      lot.staff.push(user._id);
      await lot.save();
    } else {
      lot.staff.push(user._id);
      await lot.save();
    }

    // Send email
    const subject = isNewUser
      ? `Your new Staff account – ${lot.name}`
      : `You have been added as Staff – ${lot.name}`;

    const html = isNewUser ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">👷 Welcome to the Team</h2>
        <p>Hi <strong>${user.fullName}</strong>,</p>
        <p>An account has been created for you as <strong>Parking Staff</strong> at:</p>
        <div style="background: #f5f3ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #7c3aed;">
          <p style="margin:0"><strong>${lot.name}</strong></p>
          <p style="margin:4px 0 0; color:#6b7280;">${lot.address?.street || ''} ${lot.address?.district || ''}, ${lot.address?.city || ''}</p>
        </div>
        <p>Your login credentials:</p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; font-family: monospace;">
          <p style="margin:0"><strong>Email:</strong> ${user.email}</p>
          <p style="margin:4px 0 0"><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        <p style="color: #ef4444; font-size: 13px;">⚠️ Please change your password after first login.</p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">👷 Staff Assignment</h2>
        <p>Hi <strong>${user.fullName}</strong>,</p>
        <p>You have been assigned as <strong>Parking Staff</strong> at:</p>
        <div style="background: #f5f3ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #7c3aed;">
          <p style="margin:0"><strong>${lot.name}</strong></p>
          <p style="margin:4px 0 0; color:#6b7280;">${lot.address?.street || ''} ${lot.address?.district || ''}, ${lot.address?.city || ''}</p>
        </div>
        <p>Please log in to the Staff Portal to view your schedule and duties.</p>
      </div>
    `;

    sendEmail({ to: user.email, subject, html }).catch(() => {});

    return { message: isNewUser ? 'Account created and staff assigned.' : 'Staff added successfully.', user: { _id: user._id, fullName: user.fullName, email: user.email, isNewUser } };
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

