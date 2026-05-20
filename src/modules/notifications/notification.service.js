const Notification = require('./notification.model');
const Pagination = require('../../utils/pagination');
const ApiError = require('../../utils/ApiError');

class NotificationService {
  /**
   * Create and emit notification
   */
  async create(data, io = null) {
    const notification = await Notification.create({
      ...data,
      channels: data.channels || ['in_app'],
    });

    // Emit via Socket.IO if available
    if (io) {
      io.to(`user:${data.recipient}`).emit('newNotification', {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        createdAt: notification.createdAt,
      });
    }

    return notification;
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId, query) {
    const { page = 1, limit = 20, unreadOnly } = query;

    const filter = { recipient: userId };
    if (unreadOnly === 'true') filter.isRead = false;

    return Pagination.paginate(Notification, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
    });
  }

  /**
   * Mark notification(s) as read
   */
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) throw ApiError.notFound('Notification not found.');
    return notification;
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(userId) {
    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    return { message: 'All notifications marked as read.' };
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId) {
    const count = await Notification.countDocuments({ recipient: userId, isRead: false });
    return { count };
  }

  /**
   * Delete notification
   */
  async delete(notificationId, userId) {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId,
    });
    if (!notification) throw ApiError.notFound('Notification not found.');
    return { message: 'Notification deleted.' };
  }

  /**
   * Send bulk notification to multiple users
   */
  async sendBulk(userIds, data, io = null) {
    const notifications = userIds.map(uid => ({
      ...data,
      recipient: uid,
      channels: ['in_app'],
    }));

    const created = await Notification.insertMany(notifications);

    if (io) {
      userIds.forEach(uid => {
        io.to(`user:${uid}`).emit('newNotification', {
          type: data.type,
          title: data.title,
          message: data.message,
        });
      });
    }

    return created;
  }
}

module.exports = new NotificationService();
