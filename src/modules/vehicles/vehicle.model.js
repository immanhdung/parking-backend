const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: [true, 'Vehicle type is required'],
    },
    licensePlate: {
      type: String,
      required: [true, 'License plate is required'],
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9\-\.]{4,15}$/, 'Please provide a valid license plate'],
    },
    vehicleModel: {
      type: String,
      trim: true,
      maxlength: [100, 'Vehicle model cannot exceed 100 characters'],
    },
    vehicleColor: {
      type: String,
      trim: true,
      maxlength: [30, 'Vehicle color cannot exceed 30 characters'],
    },
    vehicleBrand: {
      type: String,
      trim: true,
      maxlength: [50, 'Vehicle brand cannot exceed 50 characters'],
    },
    nickname: {
      type: String,
      trim: true,
      maxlength: [50, 'Nickname cannot exceed 50 characters'],
    }, // e.g. "Xe đi làm", "Xe gia đình"
    isDefault: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      select: false,
    },
    deletedAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
vehicleSchema.index({ user: 1, isDeleted: 1 });
vehicleSchema.index({ licensePlate: 1 });
vehicleSchema.index({ user: 1, isDefault: 1 });

// Compound unique: one license plate per user (not globally unique - family can share)
vehicleSchema.index({ user: 1, licensePlate: 1, isDeleted: 1 }, { unique: true });

// Pre-find: exclude soft deleted
vehicleSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// Pre-save: ensure only one default vehicle per user
vehicleSchema.pre('save', async function (next) {
  if (this.isModified('isDefault') && this.isDefault) {
    await mongoose.model('Vehicle').updateMany(
      { user: this.user, _id: { $ne: this._id }, isDeleted: { $ne: true } },
      { isDefault: false }
    );
  }
  next();
});

// Instance method: soft delete
vehicleSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save({ validateBeforeSave: false });
};

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
