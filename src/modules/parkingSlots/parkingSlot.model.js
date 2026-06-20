const mongoose = require('mongoose');

const parkingSlotSchema = new mongoose.Schema(
  {
    slotCode: {
      type: String,
      required: [true, 'Slot code is required'],
      trim: true,
      uppercase: true,
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
      required: true,
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: true,
    },
    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved', 'maintenance', 'locked'],
      default: 'available',
    },
    // Current occupant (if occupied)
    currentSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSession',
      default: null,
    },
    currentBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    // Temporary lock: user is previewing the slot (3-min TTL)
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    // Physical position (row, column)
    position: {
      row: String,
      column: Number,
    },
    notes: String,
    // Slot features
    features: {
      hasEVCharger: { type: Boolean, default: false },
      isHandicapped: { type: Boolean, default: false },
      isVIP: { type: Boolean, default: false },
      hasCCTV: { type: Boolean, default: true },
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index: slotCode unique per parking lot
parkingSlotSchema.index({ parkingLot: 1, slotCode: 1 }, { unique: true });
parkingSlotSchema.index({ parkingLot: 1, status: 1 });
parkingSlotSchema.index({ floor: 1, status: 1 });
parkingSlotSchema.index({ zone: 1, status: 1 });
parkingSlotSchema.index({ vehicleType: 1, status: 1 });
parkingSlotSchema.index({ currentSession: 1 });
parkingSlotSchema.index({ currentBooking: 1 });
parkingSlotSchema.index({ isDeleted: 1 });

// Pre-find: exclude soft deleted
parkingSlotSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const ParkingSlot = mongoose.model('ParkingSlot', parkingSlotSchema);

module.exports = ParkingSlot;
