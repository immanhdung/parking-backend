const mongoose = require('mongoose');

const vehicleTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vehicle type name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    }, // e.g. CAR, MOTORBIKE, BICYCLE
    parkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      default: null, // null = global (legacy); ObjectId = per-lot
    },
    description: String,
    icon: String, // Icon URL or class name
    size: {
      type: String,
      enum: ['small', 'medium', 'large', 'extra_large'],
      required: true,
    },
    pricing: {
      dayBlockRate: {
        type: Number,
        required: [true, 'Day block rate is required'],
        min: [0, 'Rate cannot be negative'],
      },
      nightBlockRate: {
        type: Number,
        min: [0, 'Rate cannot be negative'],
      },
      dailyRate: {
        type: Number,
        required: [true, 'Daily rate is required'],
        min: [0, 'Rate cannot be negative'],
      },
      monthlyRate: {
        type: Number,
        default: 0,
        min: 0,
      },
      blockHours: {
        type: Number,
        default: 4,
        min: 1,
      },
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

vehicleTypeSchema.index({ isActive: 1 });
vehicleTypeSchema.index({ isDeleted: 1 });
vehicleTypeSchema.index({ parkingLot: 1 });
// Unique per lot: same code cannot exist twice in the same lot (null lot = global)
vehicleTypeSchema.index({ code: 1, parkingLot: 1 }, { unique: true });

vehicleTypeSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const VehicleType = mongoose.model('VehicleType', vehicleTypeSchema);

module.exports = VehicleType;
