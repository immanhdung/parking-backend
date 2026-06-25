const Vehicle = require('./vehicle.model');
const VehicleType = require('../vehicleTypes/vehicleType.model');
const MonthlyPass = require('../monthlyPasses/monthlyPass.model');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');

class VehicleService {
  /**
   * Get all vehicles of a user
   */
  async getMyVehicles(userId, query) {
    const { page = 1, limit = 20, sort = '-isDefault,-createdAt' } = query;

    return Pagination.paginate(Vehicle, { user: userId }, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: Pagination.buildSort(sort),
      populate: { path: 'vehicleType', select: 'name code icon size pricing' },
    });
  }

  /**
   * Get a single vehicle by ID (owned by user)
   */
  async getVehicleById(vehicleId, userId) {
    const vehicle = await Vehicle.findById(vehicleId)
      .populate('vehicleType', 'name code icon size pricing');

    if (!vehicle) throw ApiError.notFound('Vehicle not found.');

    if (vehicle.user.toString() !== userId.toString()) {
      throw ApiError.forbidden('Access denied.');
    }

    return vehicle;
  }

  /**
   * Add a new vehicle
   */
  async addVehicle(userId, data) {
    const { vehicleType, licensePlate, vehicleModel, vehicleColor, vehicleBrand, nickname, isDefault } = data;

    // Validate vehicle type
    const vType = await VehicleType.findById(vehicleType);
    if (!vType || !vType.isActive) {
      throw ApiError.badRequest('Vehicle type is not available.');
    }

    // Check duplicate license plate for this user
    const existing = await Vehicle.findOne({
      user: userId,
      licensePlate: licensePlate.toUpperCase().trim(),
    });
    if (existing) {
      throw ApiError.conflict('You already have a vehicle with this license plate.');
    }

    // If this is the first vehicle, make it default
    const vehicleCount = await Vehicle.countDocuments({ user: userId });
    const shouldBeDefault = vehicleCount === 0 ? true : (isDefault || false);

    const vehicle = await Vehicle.create({
      user: userId,
      vehicleType,
      licensePlate: licensePlate.toUpperCase().trim(),
      vehicleModel,
      vehicleColor,
      vehicleBrand,
      nickname,
      isDefault: shouldBeDefault,
    });

    return vehicle.populate('vehicleType', 'name code icon size pricing');
  }

  /**
   * Update vehicle info
   */
  async updateVehicle(vehicleId, userId, data) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) throw ApiError.notFound('Vehicle not found.');

    if (vehicle.user.toString() !== userId.toString()) {
      throw ApiError.forbidden('Access denied.');
    }

    // If changing vehicle type, validate it BEFORE mutating the vehicle
    if (data.vehicleType) {
      const vType = await VehicleType.findById(data.vehicleType);
      if (!vType || !vType.isActive) {
        throw ApiError.badRequest('Vehicle type is not available.');
      }

      // Block vehicleType change if vehicle has an active/pending monthly pass
      const currentVehicleTypeId = vehicle.vehicleType?.toString();
      if (currentVehicleTypeId && data.vehicleType.toString() !== currentVehicleTypeId) {
        const activeMonthlyPass = await MonthlyPass.findOne({
          licensePlate: vehicle.licensePlate,
          status: { $in: ['active', 'pending'] },
        });
        if (activeMonthlyPass) {
          throw ApiError.badRequest(
            'Cannot change vehicle type while this vehicle has an active or pending monthly pass. Please cancel or wait for the pass to expire first.'
          );
        }
      }
    }

    const allowedFields = ['vehicleType', 'licensePlate', 'vehicleModel', 'vehicleColor', 'vehicleBrand', 'nickname', 'isDefault'];
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        vehicle[field] = field === 'licensePlate' ? data[field].toUpperCase().trim() : data[field];
      }
    });

    // If changing license plate, check duplicate
    if (data.licensePlate) {
      const existing = await Vehicle.findOne({
        user: userId,
        licensePlate: data.licensePlate.toUpperCase().trim(),
        _id: { $ne: vehicleId },
      });
      if (existing) {
        throw ApiError.conflict('You already have a vehicle with this license plate.');
      }
    }

    await vehicle.save();
    return vehicle.populate('vehicleType', 'name code icon size pricing');
  }

  /**
   * Set a vehicle as default
   */
  async setDefault(vehicleId, userId) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) throw ApiError.notFound('Vehicle not found.');

    if (vehicle.user.toString() !== userId.toString()) {
      throw ApiError.forbidden('Access denied.');
    }

    vehicle.isDefault = true;
    await vehicle.save(); // pre-save hook will unset other defaults

    return vehicle.populate('vehicleType', 'name code icon size pricing');
  }

  /**
   * Delete a vehicle (soft delete)
   */
  async deleteVehicle(vehicleId, userId) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) throw ApiError.notFound('Vehicle not found.');

    if (vehicle.user.toString() !== userId.toString()) {
      throw ApiError.forbidden('Access denied.');
    }

    const wasDefault = vehicle.isDefault;
    await vehicle.softDelete();

    // If deleted vehicle was default, set another as default
    if (wasDefault) {
      const nextVehicle = await Vehicle.findOne({ user: userId }).sort({ createdAt: -1 });
      if (nextVehicle) {
        nextVehicle.isDefault = true;
        await nextVehicle.save({ validateBeforeSave: false });
      }
    }

    return { message: 'Vehicle deleted successfully.' };
  }

  /**
   * Get user's default vehicle
   */
  async getDefaultVehicle(userId) {
    const vehicle = await Vehicle.findOne({ user: userId, isDefault: true })
      .populate('vehicleType', 'name code icon size pricing');

    return vehicle || null;
  }
}

module.exports = new VehicleService();
