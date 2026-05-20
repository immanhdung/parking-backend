const notificationService = require('../notification.service');
const ApiResponse = require('../../../utils/ApiResponse');
const asyncHandler = require('../../../utils/asyncHandler');

class NotificationController {
  getMyNotifications = asyncHandler(async (req, res) => {
    const { docs, pagination } = await notificationService.getUserNotifications(req.user._id, req.query);
    ApiResponse.paginated(res, 'Notifications retrieved.', docs, pagination);
  });

  getUnreadCount = asyncHandler(async (req, res) => {
    const result = await notificationService.getUnreadCount(req.user._id);
    ApiResponse.success(res, 'Unread count retrieved.', result);
  });

  markAsRead = asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);
    ApiResponse.success(res, 'Notification marked as read.', notification);
  });

  markAllAsRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markAllAsRead(req.user._id);
    ApiResponse.success(res, result.message);
  });

  delete = asyncHandler(async (req, res) => {
    await notificationService.delete(req.params.id, req.user._id);
    ApiResponse.success(res, 'Notification deleted.');
  });
}

module.exports = new NotificationController();

// ===== ROUTES =====
const express = require('express');
const router = express.Router();
const { protect } = require('../../../middleware/auth');

router.use(protect);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get my notifications
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Notification list
 */
const ctrl = new NotificationController();
router.get('/', ctrl.getMyNotifications);
router.get('/unread-count', ctrl.getUnreadCount);
router.patch('/mark-all-read', ctrl.markAllAsRead);
router.patch('/:id/read', ctrl.markAsRead);
router.delete('/:id', ctrl.delete);

module.exports = router;
