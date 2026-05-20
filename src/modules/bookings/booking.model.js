const mongoose = require('mongoose');
const { generateBookingCode } = require('../../utils/helpers');

const bookingSchema = new mongoose.Schema(
  {
    bookingCode: {
      type: String,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    parkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
    },
    floor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Floor',
    },
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
    },
    assignedSlot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSlot',
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: true,
    },
    vehicleInfo: {
      licensePlate: {
        type: String,
        trim: true,
        uppercase: true,
      },
      vehicleModel: String,
      vehicleColor: String,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    }, // e.g. "08:00"
    endTime: {
      type: String,
      required: true,
    }, // e.g. "17:00"
    estimatedDuration: Number, // in hours
    estimatedFee: Number,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show'],
      default: 'pending',
    },
    cancelReason: String,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    cancelledAt: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    // QR code for check-in
    qrCode: String,
    qrCodeData: String,
    // Linked parking session (after check-in)
    parkingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSession',
    },
    notes: String,
    // Notification tracking
    reminderSent: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ parkingLot: 1, status: 1 });
bookingSchema.index({ parkingLot: 1, scheduledDate: 1 });
bookingSchema.index({ assignedSlot: 1 });
bookingSchema.index({ bookingCode: 1 });
bookingSchema.index({ status: 1, scheduledDate: 1 });
bookingSchema.index({ isDeleted: 1 });

// Pre-save: auto-generate booking code
bookingSchema.pre('save', function (next) {
  if (!this.bookingCode) {
    this.bookingCode = generateBookingCode();
  }
  next();
});

bookingSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
