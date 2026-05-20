const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema(
  {
    incidentCode: {
      type: String,
      unique: true,
      required: true,
    },
    parkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
    },
    parkingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSession',
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSlot',
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'lost_ticket',
        'wrong_license_plate',
        'overdue',
        'wrong_zone',
        'slot_occupied',
        'slot_damaged',
        'vehicle_damage',
        'theft',
        'other',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed', 'escalated'],
      default: 'open',
    },
    images: [
      {
        url: String,
        publicId: String,
      },
    ],
    resolution: {
      description: String,
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolvedAt: Date,
      extraCharge: Number,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

incidentSchema.index({ parkingLot: 1, status: 1 });
incidentSchema.index({ type: 1 });
incidentSchema.index({ severity: 1, status: 1 });
incidentSchema.index({ reportedBy: 1 });
incidentSchema.index({ incidentCode: 1 });
incidentSchema.index({ isDeleted: 1 });

incidentSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const Incident = mongoose.model('Incident', incidentSchema);

module.exports = Incident;
