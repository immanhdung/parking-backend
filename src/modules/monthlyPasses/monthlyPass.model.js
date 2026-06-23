const mongoose = require('mongoose');
const { generateQRCode } = require('../../utils/helpers');

const monthlyPassSchema = new mongoose.Schema(
  {
    passCode: {
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
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: true,
    },
    licensePlate: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'cancelled'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    qrCode: String,
    qrCodeData: String,
    cancelReason: String,
    cancelledAt: Date,
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
monthlyPassSchema.index({ user: 1, status: 1 });
monthlyPassSchema.index({ parkingLot: 1, status: 1 });
monthlyPassSchema.index({ licensePlate: 1, status: 1 });
monthlyPassSchema.index({ isDeleted: 1 });

// Pre-save: auto-generate pass code and QR
monthlyPassSchema.pre('save', async function (next) {
  if (!this.passCode) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.passCode = `MP-${timestamp}-${random}`;
  }
  
  if (this.isModified('passCode') || this.isModified('licensePlate') || !this.qrCode) {
    this.qrCodeData = JSON.stringify({
      type: 'monthly_pass',
      passCode: this.passCode,
      licensePlate: this.licensePlate
    });
    try {
      this.qrCode = await generateQRCode(this.qrCodeData);
    } catch (error) {
      console.error('Failed to generate QR code for Monthly Pass:', error);
    }
  }
  
  next();
});

monthlyPassSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const MonthlyPass = mongoose.model('MonthlyPass', monthlyPassSchema);

module.exports = MonthlyPass;
