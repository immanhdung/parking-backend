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

  _validateFloorNumber(data) {
    const { floorType } = data;
    if (data.floorNumber === undefined || data.floorNumber === null) return;

    if (floorType === 'ground') {
      // Ground floor is always 0
      data.floorNumber = 0;
    } else if (floorType === 'basement') {
      // Store as NEGATIVE so compound index {parkingLot, floorNumber} stays unique
      // e.g. B1 → -1, B2 → -2 (user inputs 1 or 2, we negate it)
      const num = Math.abs(parseInt(data.floorNumber));
      if (isNaN(num) || num < 1) {
        throw ApiError.badRequest('Basement floor number must be >= 1 (B1, B2…).');
      }
      data.floorNumber = -num;  // B1 stored as -1, B2 stored as -2
    } else if (floorType === 'above_ground') {
      const num = parseInt(data.floorNumber);
      if (isNaN(num) || num < 1) {
        throw ApiError.badRequest('Floor number must be >= 1 for above-ground floors.');
      }
      data.floorNumber = num;
    }
  }

  async create(data) {
    this._validateFloorNumber(data);
    const floor = await Floor.create(data);
    return floor;
  }

  async update(id, data) {
    this._validateFloorNumber(data);
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
