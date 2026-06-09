const mongoose = require('mongoose');

const parkingLotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Parking lot name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: { type: String, trim: true },
    address: {
      street: { type: String, required: true },
      ward: String,
      district: { type: String, required: true },
      city: { type: String, required: true },
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    images: [
      {
        url: String,
        publicId: String,
        caption: String,
      },
    ],
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    staff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    totalFloors: { type: Number, default: 0 },
    totalSlots: { type: Number, default: 0 },
    availableSlots: { type: Number, default: 0 },
    occupiedSlots: { type: Number, default: 0 },
    operatingHours: {
      open: { type: String, default: '06:00' },
      close: { type: String, default: '22:00' },
      is24Hours: { type: Boolean, default: false },
    },
    contactPhone: String,
    contactEmail: String,
    amenities: [String], // e.g. ['CCTV', 'Security Guard', 'EV Charging']
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance', 'closed'],
      default: 'active',
    },
    settings: {
      allowBooking: { type: Boolean, default: true },
      maxBookingHours: { type: Number, default: 24 },
      maxAdvanceBookingDays: { type: Number, default: 7 },
      overtimeGracePeriodMinutes: { type: Number, default: 15 },
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

// Indexes
parkingLotSchema.index({ status: 1 });
parkingLotSchema.index({ manager: 1 });
parkingLotSchema.index({ isDeleted: 1 });
parkingLotSchema.index({ 'address.city': 1 });

// Virtual: occupancy rate
parkingLotSchema.virtual('occupancyRate').get(function () {
  if (this.totalSlots === 0) return 0;
  return Math.round((this.occupiedSlots / this.totalSlots) * 100);
});

// Pre-find: exclude soft deleted
parkingLotSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const ParkingLot = mongoose.model('ParkingLot', parkingLotSchema);

module.exports = ParkingLot;
