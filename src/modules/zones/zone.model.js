const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema(
  {
    floor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Floor',
      required: true,
    },
    parkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Zone name is required'],
      trim: true,
    }, // e.g. "Khu A", "Khu B"
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    allowedVehicleTypes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VehicleType',
      },
    ],
    totalSlots: { type: Number, default: 0 },
    availableSlots: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'active',
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

zoneSchema.index({ floor: 1 });
zoneSchema.index({ parkingLot: 1 });
zoneSchema.index({ floor: 1, code: 1 }, { unique: true });
zoneSchema.index({ isDeleted: 1 });

zoneSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const Zone = mongoose.model('Zone', zoneSchema);

module.exports = Zone;
