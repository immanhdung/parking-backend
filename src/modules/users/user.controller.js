const userService = require('./user.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

class UserController {
  /**
   * GET /users - Admin only
   */
  getUsers = asyncHandler(async (req, res) => {
    const { docs, pagination } = await userService.getUsers(req.query);
    ApiResponse.paginated(res, 'Users retrieved successfully.', docs, pagination);
  });

  /**
   * GET /users/:id
   */
  getUserById = asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.params.id);
    ApiResponse.success(res, 'User retrieved.', user);
  });

  /**
   * GET /users/profile - Self
   */
  getProfile = asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.user._id);
    ApiResponse.success(res, 'Profile retrieved.', user);
  });

  /**
   * PUT /users/profile - Self update
   */
  updateProfile = asyncHandler(async (req, res) => {
    const user = await userService.updateProfile(req.user._id, req.body);
    ApiResponse.success(res, 'Profile updated successfully.', user);
  });

  /**
   * PUT /users/avatar
   */
  updateAvatar = asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image.' });
    }
    const user = await userService.updateAvatar(req.user._id, req.file);
    ApiResponse.success(res, 'Avatar updated successfully.', { avatar: user.avatarUrl });
  });

  /**
   * POST /users - Admin create user
   */
  createUser = asyncHandler(async (req, res) => {
    const user = await userService.createUser(req.body);
    ApiResponse.created(res, 'User created successfully.', user);
  });

  /**
   * PUT /users/:id - Admin update user
   */
  adminUpdateUser = asyncHandler(async (req, res) => {
    const user = await userService.adminUpdateUser(req.params.id, req.body);
    ApiResponse.success(res, 'User updated successfully.', user);
  });

  /**
   * PATCH /users/:id/block
   */
  blockUser = asyncHandler(async (req, res) => {
    const user = await userService.toggleBlockUser(req.params.id, true, req.user._id);
    ApiResponse.success(res, 'User blocked successfully.', { status: user.status });
  });

  /**
   * PATCH /users/:id/unblock
   */
  unblockUser = asyncHandler(async (req, res) => {
    const user = await userService.toggleBlockUser(req.params.id, false, req.user._id);
    ApiResponse.success(res, 'User unblocked successfully.', { status: user.status });
  });

  /**
   * DELETE /users/:id
   */
  deleteUser = asyncHandler(async (req, res) => {
    await userService.deleteUser(req.params.id, req.user._id);
    ApiResponse.success(res, 'User deleted successfully.');
  });

  /**
   * GET /users/:id/activity-logs
   */
  getActivityLogs = asyncHandler(async (req, res) => {
    const userId = req.params.id || req.user._id;
    const { docs, pagination } = await userService.getUserActivityLogs(userId, req.query);
    ApiResponse.paginated(res, 'Activity logs retrieved.', docs, pagination);
  });
}

module.exports = new UserController();
