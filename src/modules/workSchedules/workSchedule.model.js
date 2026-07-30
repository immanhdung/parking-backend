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
  weekStartDate: { // The start date of the week (Monday)
    type: String, // Format YYYY-MM-DD
    required: true,
  },
  shifts: [{
    date: String, // Format YYYY-MM-DD
    shiftType: {
      type: String,
      enum: ['morning', 'afternoon', 'night'],
      required: true,
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  managerNote: String
}, { timestamps: true });

module.exports = mongoose.model('WorkSchedule', workScheduleSchema);
