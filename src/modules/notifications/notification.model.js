const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: [
        'booking_approved',
        'booking_rejected',
        'booking_cancelled',
        'booking_reminder',
        'checkin_success',
        'checkout_success',
        'payment_success',
        'payment_failed',
        'slot_available',
        'overdue_parking',
        'overdue_alert',
        'incident_alert',
        'system_notice',
        'account_status',
        'general',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
    }, // Extra data (bookingId, sessionId, etc.)
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: Date,
    // Push notification tracking
    isPushed: { type: Boolean, default: false },
    pushedAt: Date,
    channels: [{
      type: String,
      enum: ['in_app', 'email', 'sms', 'push'],
    }],
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
