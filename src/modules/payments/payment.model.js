const mongoose = require('mongoose');
const { generateInvoiceCode } = require('../../utils/helpers');

const paymentSchema = new mongoose.Schema(
  {
    invoiceCode: {
      type: String,
      unique: true,
    },
    parkingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSession',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    parkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    baseFee: { type: Number, default: 0 },
    overtimeFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    method: {
      type: String,
      enum: ['cash', 'momo', 'vnpay', 'card', 'bank_transfer'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
    },
    // Payment gateway data
    transactionId: String, // Gateway transaction ID
    gatewayResponse: { type: mongoose.Schema.Types.Mixed },
    // Cash payment
    cashReceived: Number,
    cashChange: Number,
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    paidAt: Date,
    refundedAt: Date,
    refundAmount: Number,
    refundReason: String,
    notes: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

paymentSchema.index({ parkingSession: 1 });
paymentSchema.index({ user: 1 });
paymentSchema.index({ parkingLot: 1, status: 1 });
paymentSchema.index({ method: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });

paymentSchema.pre('save', function (next) {
  if (!this.invoiceCode) {
    this.invoiceCode = generateInvoiceCode();
  }
  next();
});

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
