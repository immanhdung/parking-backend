// ===== FEEDBACK SERVICE =====
const Feedback = require('./feedback.model');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');

class FeedbackService {
  async getAll(query, user) {
    const { page = 1, limit = 10, sort = '-createdAt', status, type, parkingLot, rating } = query;
    const filter = {};

    if (user.role === 'parking_user') filter.user = user._id;
    if (user.role === 'parking_manager') filter.parkingLot = user.assignedParkingLot;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (parkingLot && user.role !== 'parking_manager') filter.parkingLot = parkingLot;
    if (rating) filter.rating = parseInt(rating);

    return Pagination.paginate(Feedback, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: Pagination.buildSort(sort),
      populate: [
        { path: 'user', select: 'fullName email avatar' },
        { path: 'parkingLot', select: 'name code' },
      ],
    });
  }

  async getById(id) {
    const fb = await Feedback.findById(id)
      .populate('user', 'fullName email avatar')
      .populate('parkingLot', 'name code address')
      .populate('parkingSession', 'sessionCode vehicleInfo')
      .populate('response.respondedBy', 'fullName');
    if (!fb) throw ApiError.notFound('Feedback not found.');
    return fb;
  }

  async create(data, userId) {
    const fb = await Feedback.create({ ...data, user: userId });
    return fb;
  }

  async respond(id, response, staffId) {
    const fb = await Feedback.findByIdAndUpdate(
      id,
      {
        status: 'resolved',
        response: { content: response, respondedBy: staffId, respondedAt: new Date() },
      },
      { new: true }
    );
    if (!fb) throw ApiError.notFound('Feedback not found.');
    return fb;
  }

  async delete(id, userId, role) {
    const fb = await Feedback.findById(id);
    if (!fb) throw ApiError.notFound('Feedback not found.');
    if (role === 'parking_user' && fb.user.toString() !== userId.toString()) {
      throw ApiError.forbidden('Access denied.');
    }
    fb.isDeleted = true;
    await fb.save();
    return { message: 'Feedback deleted.' };
  }

  async getStats(parkingLotId) {
    const mongoose = require('mongoose');
    const match = parkingLotId ? { parkingLot: new mongoose.Types.ObjectId(parkingLotId), isDeleted: { $ne: true } } : { isDeleted: { $ne: true } };
    const result = await Feedback.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          total: { $sum: 1 },
          byRating: { $push: '$rating' },
        },
      },
    ]);
    return result[0] || { avgRating: 0, total: 0 };
  }
}

const feedbackService = new FeedbackService();
module.exports = feedbackService;
