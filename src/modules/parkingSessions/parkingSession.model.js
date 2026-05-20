const mongoose = require('mongoose');

const parkingSessionSchema = new mongoose.Schema(
  {
    sessionCode: {
      type: String,
      unique: true,
      required: true,
    },
    // User (may be null for non-registered users)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    parkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
    },
    floor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Floor',
      required: true,
    },
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
    },
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSlot',
      required: true,
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: true,
    },
    vehicleInfo: {
      licensePlate: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
      },
      vehicleModel: String,
      vehicleColor: String,
    },
    // Entry/Exit
    entryTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    exitTime: Date,
    checkInStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    checkOutStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Duration
    durationMs: Number,
    durationHours: Number,
    // Fee calculation
    baseFee: { type: Number, default: 0 },
    overtimeFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalFee: { type: Number, default: 0 },
    // Overtime
    isOvertime: { type: Boolean, default: false },
    overtimeHours: { type: Number, default: 0 },
    overtimeNotificationSent: { type: Boolean, default: false },
    // Payment
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'waived', 'refunded'],
      default: 'unpaid',
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    // Session status
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled', 'abandoned'],
      default: 'active',
    },
    // Evidence photos (entry/exit)
    evidenceImages: [
      {
        url: String,
        publicId: String,
        type: { type: String, enum: ['entry', 'exit', 'incident'] },
        capturedAt: { type: Date, default: Date.now },
      },
    ],
    notes: String,
    // Ticket number (physical)
    ticketNumber: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
parkingSessionSchema.index({ parkingLot: 1, status: 1 });
parkingSessionSchema.index({ slot: 1, status: 1 });
parkingSessionSchema.index({ user: 1, status: 1 });
parkingSessionSchema.index({ 'vehicleInfo.licensePlate': 1 });
parkingSessionSchema.index({ entryTime: -1 });
parkingSessionSchema.index({ status: 1, isOvertime: 1 });
parkingSessionSchema.index({ sessionCode: 1 });
parkingSessionSchema.index({ booking: 1 });

// Virtual: live duration
parkingSessionSchema.virtual('currentDurationHours').get(function () {
  const end = this.exitTime || new Date();
  const ms = end - this.entryTime;
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
});

const ParkingSession = mongoose.model('ParkingSession', parkingSessionSchema);

module.exports = ParkingSession;
