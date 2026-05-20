// ============================================
// FLOORS MODULE
// ============================================
const Floor = require('./floor.model');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');

class FloorService {
  async getAll(query) {
    const { parkingLot, status, page = 1, limit = 20 } = query;
    const filter = {};
    if (parkingLot) filter.parkingLot = parkingLot;
    if (status) filter.status = status;

    return Pagination.paginate(Floor, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { floorNumber: 1 },
      populate: [
        { path: 'parkingLot', select: 'name code' },
        { path: 'allowedVehicleTypes', select: 'name code' },
      ],
    });
  }

  async getById(id) {
    const floor = await Floor.findById(id)
      .populate('parkingLot', 'name code')
      .populate('allowedVehicleTypes', 'name code icon');
    if (!floor) throw ApiError.notFound('Floor not found.');
    return floor;
  }

  async create(data) {
    const floor = await Floor.create(data);
    return floor;
  }

  async update(id, data) {
    const floor = await Floor.findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate('allowedVehicleTypes', 'name code');
    if (!floor) throw ApiError.notFound('Floor not found.');
    return floor;
  }

  async delete(id) {
    const floor = await Floor.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!floor) throw ApiError.notFound('Floor not found.');
    return { message: 'Floor deleted.' };
  }
}

module.exports = new FloorService();
