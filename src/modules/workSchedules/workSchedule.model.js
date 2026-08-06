const mongoose = require('mongoose');

const workScheduleSchema = new mongoose.Schema({
  staff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  parkingLot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingLot',
    required: true,
  },
  monthYear: { // Format YYYY-MM
    type: String,
    required: true,
  },
  shifts: [{
    date: String, // Format YYYY-MM-DD
    shiftType: {
      type: String,
      enum: ['morning', 'afternoon', 'night'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'published', 'leave_pending', 'leave_approved', 'assignment_pending'],
      default: 'pending'
    },
    managerNote: String,
    leaveReason: String
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'published'],
    default: 'pending'
  },
  managerNote: String
}, { timestamps: true });

module.exports = mongoose.model('WorkSchedule', workScheduleSchema);
