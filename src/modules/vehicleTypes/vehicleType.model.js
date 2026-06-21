const mongoose = require('mongoose');

const vehicleTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vehicle type name is required'],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    }, // e.g. CAR, MOTORBIKE, BICYCLE
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

vehicleTypeSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const VehicleType = mongoose.model('VehicleType', vehicleTypeSchema);

module.exports = VehicleType;
