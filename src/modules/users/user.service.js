const User = require('./user.model');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');
const { deleteImage } = require('../../config/cloudinary');

class UserService {
  /**
   * Get all users with pagination, filter, sort
   */
  async getUsers(query) {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      search,
      role,
      status,
      parkingLot,
    } = query;

    const filter = {};

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) filter.role = role;
    if (status) filter.status = status;
    if (parkingLot) filter.assignedParkingLot = parkingLot;

    const sortObj = Pagination.buildSort(sort);

    return Pagination.paginate(User, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: sortObj,
      select: '-refreshTokens -passwordResetToken -emailVerificationToken',
      populate: { path: 'assignedParkingLot', select: 'name code' },
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(id) {
    const user = await User.findById(id)
      .select('-refreshTokens -passwordResetToken -emailVerificationToken')
      .populate('assignedParkingLot', 'name code address');

    if (!user) throw ApiError.notFound('User not found.');
    return user;
  }

  /**
   * Update user profile (self)
   */
  async updateProfile(userId, data) {
    const allowedFields = ['fullName', 'phone'];
    const updateData = {};
    allowedFields.forEach(field => {
      if (data[field] !== undefined) updateData[field] = data[field];
    });

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select('-refreshTokens');

    if (!user) throw ApiError.notFound('User not found.');
    return user;
  }

  /**
   * Update avatar
   */
  async updateAvatar(userId, file) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found.');

    // Delete old avatar from cloudinary
    if (user.avatar?.publicId) {
      await deleteImage(user.avatar.publicId);
    }

    user.avatar = {
      url: file.path,
      publicId: file.filename,
    };
    await user.save({ validateBeforeSave: false });
    return user;
  }

  /**
   * Admin: update user (role, status, assignedParkingLot)
   */
  async adminUpdateUser(id, data) {
    const allowedFields = ['fullName', 'phone', 'role', 'status', 'assignedParkingLot'];
    const updateData = {};
    allowedFields.forEach(field => {
      if (data[field] !== undefined) updateData[field] = data[field];
    });

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .select('-refreshTokens')
      .populate('assignedParkingLot', 'name code');

    if (!user) throw ApiError.notFound('User not found.');
    return user;
  }

  /**
   * Block / Unblock user
   */
  async toggleBlockUser(id, blocked, adminId) {
    if (id === adminId.toString()) {
      throw ApiError.badRequest('You cannot block yourself.');
    }

    const user = await User.findById(id);
    if (!user) throw ApiError.notFound('User not found.');

    if (user.role === 'system_admin') {
      throw ApiError.forbidden('Cannot block a system admin.');
    }

    user.status = blocked ? 'blocked' : 'active';
    // Invalidate all sessions when blocked
    if (blocked) {
      user.refreshTokens = [];
    }
    await user.save({ validateBeforeSave: false });
    return user;
  }

  /**
   * Soft delete user
   */
  async deleteUser(id, adminId) {
    if (id === adminId.toString()) {
      throw ApiError.badRequest('You cannot delete yourself.');
    }

    const user = await User.findById(id);
    if (!user) throw ApiError.notFound('User not found.');

    if (user.role === 'system_admin') {
      throw ApiError.forbidden('Cannot delete a system admin.');
    }

    await user.softDelete();
    return { message: 'User deleted successfully.' };
  }

  /**
   * Create user (admin)
   */
  async createUser(data) {
    const existing = await User.findOne({ email: data.email });
    if (existing) throw ApiError.conflict('Email is already registered.');

    const user = await User.create({
      ...data,
      status: 'active',
      isEmailVerified: true,
    });

    return user;
  }

  /**
   * Get user activity logs
   */
  async getUserActivityLogs(userId, query) {
    const ActivityLog = require('../../utils/activityLog.model');
    const { page = 1, limit = 20 } = query;

    return Pagination.paginate(ActivityLog, { user: userId }, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
    });
  }
}

module.exports = new UserService();
