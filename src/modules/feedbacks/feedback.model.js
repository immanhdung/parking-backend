const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
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
    parkingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSession',
    },
    type: {
      type: String,
      enum: ['general', 'complaint', 'suggestion', 'issue_report', 'compliment'],
      default: 'general',
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    tags: [String], // e.g. ['cleanliness', 'security', 'staff', 'pricing']
    images: [
      {
        url: String,
        publicId: String,
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'in_review', 'resolved', 'closed'],
      default: 'pending',
    },
    response: {
      content: String,
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      respondedAt: Date,
    },
    isPublic: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

feedbackSchema.index({ user: 1 });
feedbackSchema.index({ parkingLot: 1, status: 1 });
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ type: 1 });
feedbackSchema.index({ isDeleted: 1 });

feedbackSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;
