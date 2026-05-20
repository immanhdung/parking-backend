const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
    }, // e.g. 'USER_LOGIN', 'BOOKING_CREATED', 'SLOT_UPDATED'
    resource: String, // e.g. 'User', 'Booking', 'ParkingSlot'
    resourceId: mongoose.Schema.Types.ObjectId,
    description: String,
    metadata: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    status: {
      type: String,
      enum: ['success', 'failed', 'warning'],
      default: 'success',
    },
  },
  {
    timestamps: true,
  }
);

activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ action: 1 });
activityLogSchema.index({ resource: 1, resourceId: 1 });
activityLogSchema.index({ createdAt: -1 });

// Auto-expire after 90 days
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;
