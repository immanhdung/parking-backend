const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema(
  {
    parkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
    },
    floorNumber: {
      type: Number,
      required: [true, 'Floor number is required'],
    },
    name: {
      type: String,
      required: [true, 'Floor name is required'],
      trim: true,
    }, // e.g. "Tầng 1", "Tầng Hầm B1"
    floorType: {
      type: String,
      enum: ['ground', 'above_ground', 'basement'],
      default: 'above_ground',
    },
    totalSlots: { type: Number, default: 0 },
    availableSlots: { type: Number, default: 0 },
    occupiedSlots: { type: Number, default: 0 },
    // Which vehicle types are allowed on this floor
    allowedVehicleTypes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VehicleType',
      },
    ],
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'active',
    },
    description: String,
    mapImageUrl: String, // Floor layout image
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index: each floor number unique per parking lot
floorSchema.index({ parkingLot: 1, floorNumber: 1 }, { unique: true });
floorSchema.index({ parkingLot: 1, status: 1 });
floorSchema.index({ isDeleted: 1 });

// Virtual: occupancy rate
floorSchema.virtual('occupancyRate').get(function () {
  if (this.totalSlots === 0) return 0;
  return Math.round((this.occupiedSlots / this.totalSlots) * 100);
});

floorSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const Floor = mongoose.model('Floor', floorSchema);

module.exports = Floor;
