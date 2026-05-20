const express = require('express');
const router = express.Router();
const userController = require('../user.controller');
const { protect, restrictTo } = require('../../../middleware/auth');
const { uploadAvatar } = require('../../../config/cloudinary');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Get my profile
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Profile data
 *   put:
 *     summary: Update my profile
 *     tags: [Users]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);

/**
 * @swagger
 * /users/avatar:
 *   put:
 *     summary: Update profile avatar
 *     tags: [Users]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar updated
 */
router.put('/avatar', uploadAvatar.single('avatar'), userController.updateAvatar);

/**
 * @swagger
 * /users/my-activity:
 *   get:
 *     summary: Get my activity logs
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Activity logs
 */
router.get('/my-activity', userController.getActivityLogs);

// Admin only routes
/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [system_admin, parking_manager, parking_staff, parking_user]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, blocked, pending]
 *     responses:
 *       200:
 *         description: Paginated user list
 *   post:
 *     summary: Create user (admin only)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password, role]
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *               phone:
 *                 type: string
 *               assignedParkingLot:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created
 */
router.get('/', restrictTo('system_admin'), userController.getUsers);
router.post('/', restrictTo('system_admin'), userController.createUser);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User data
 *       404:
 *         description: User not found
 *   put:
 *     summary: Update user (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User updated
 *   delete:
 *     summary: Delete user (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted
 */
router.get('/:id', restrictTo('system_admin', 'parking_manager'), userController.getUserById);
router.put('/:id', restrictTo('system_admin'), userController.adminUpdateUser);
router.delete('/:id', restrictTo('system_admin'), userController.deleteUser);

/**
 * @swagger
 * /users/{id}/block:
 *   patch:
 *     summary: Block a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User blocked
 */
router.patch('/:id/block', restrictTo('system_admin'), userController.blockUser);
router.patch('/:id/unblock', restrictTo('system_admin'), userController.unblockUser);
router.get('/:id/activity-logs', restrictTo('system_admin'), userController.getActivityLogs);

module.exports = router;
