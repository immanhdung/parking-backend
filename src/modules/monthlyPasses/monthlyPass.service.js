const MonthlyPass = require('./monthlyPass.model');
const VehicleType = require('../vehicleTypes/vehicleType.model');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');

class MonthlyPassService {
  async createMonthlyPass(data, user) {
    const { parkingLotId, vehicleTypeId, licensePlate, months = 1 } = data;

    const vehicleType = await VehicleType.findById(vehicleTypeId);
    if (!vehicleType) throw ApiError.notFound('Vehicle type not found.');

    const pricePerMonth = vehicleType.pricing?.monthlyRate || 0;
    if (pricePerMonth <= 0) {
      throw ApiError.badRequest('This vehicle type does not support monthly passes.');
    }

    // Find the latest active or pending pass for this vehicle in the SAME parking lot
    const existingPass = await MonthlyPass.findOne({
      licensePlate: licensePlate.toUpperCase(),
      parkingLot: parkingLotId,
      status: { $in: ['pending', 'active'] },
      endDate: { $gte: new Date() },
    }).sort({ endDate: -1 });

    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    startDate.setHours(0, 0, 0, 0); // start at beginning of day

    if (existingPass) {
      // If there is an existing pass, the new one starts the day after it expires (renewal)
      startDate.setTime(existingPass.endDate.getTime());
      startDate.setDate(startDate.getDate() + 1);
      startDate.setHours(0, 0, 0, 0);
    }
    
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + parseInt(months));
    endDate.setDate(endDate.getDate() - 1); // Adjust so it ends on the last valid day
    endDate.setHours(23, 59, 59, 999); // end at end of day

    const monthlyPass = await MonthlyPass.create({
      user: user._id,
      parkingLot: parkingLotId,
      vehicleType: vehicleTypeId,
      licensePlate: licensePlate.toUpperCase(),
      startDate,
      endDate,
      price: pricePerMonth * parseInt(months),
      status: 'pending', // Will become active after payment
      paymentStatus: 'pending',
    });

    return monthlyPass.populate([
      { path: 'parkingLot', select: 'name code' },
      { path: 'vehicleType', select: 'name' }
    ]);
  }

  async getMyMonthlyPasses(user, query) {
    const { page = 1, limit = 10, status } = query;
    const filter = { user: user._id };
    if (status) filter.status = status;

    return Pagination.paginate(MonthlyPass, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'parkingLot', select: 'name code' },
        { path: 'vehicleType', select: 'name' }
      ]
    });
  }

  async getAllMonthlyPasses(query) {
    const { page = 1, limit = 10, status, licensePlate, parkingLot } = query;
    const filter = {};
    if (status) filter.status = status;
    if (licensePlate) {
      filter.licensePlate = { $regex: new RegExp(licensePlate, 'i') };
    }
    if (parkingLot) filter.parkingLot = parkingLot;

    return Pagination.paginate(MonthlyPass, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'user', select: 'fullName email phone' },
        { path: 'parkingLot', select: 'name code' },
        { path: 'vehicleType', select: 'name' }
      ]
    });
  }

  async getMonthlyPassById(id) {
    const monthlyPass = await MonthlyPass.findById(id).populate([
      { path: 'user', select: 'fullName email phone' },
      { path: 'parkingLot', select: 'name code address' },
      { path: 'vehicleType', select: 'name' }
    ]);
    if (!monthlyPass) throw ApiError.notFound('Monthly pass not found.');
    return monthlyPass;
  }

  async changeVehicle(id, user, data) {
    const { licensePlate } = data;
    if (!licensePlate) throw ApiError.badRequest('New license plate is required.');

    const monthlyPass = await MonthlyPass.findById(id).populate('vehicleType');
    if (!monthlyPass) throw ApiError.notFound('Monthly pass not found.');

    if (user.role === 'parking_user' && monthlyPass.user.toString() !== user._id.toString()) {
      throw ApiError.forbidden('You can only modify your own monthly pass.');
    }

    if (monthlyPass.status !== 'active') {
      throw ApiError.badRequest('Can only change vehicle for active passes.');
    }

    const cleanPlate = licensePlate.toUpperCase().trim();
    if (monthlyPass.licensePlate === cleanPlate) {
      throw ApiError.badRequest('The new license plate is the same as the current one.');
    }

    // Check if the new plate is already in use by another active pass
    const existingPass = await MonthlyPass.findOne({
      _id: { $ne: monthlyPass._id },
      licensePlate: cleanPlate,
      status: { $in: ['pending', 'active'] },
      endDate: { $gte: new Date() },
    });

    if (existingPass) {
      throw ApiError.badRequest('An active or pending monthly pass already exists for this license plate.');
    }

    monthlyPass.licensePlate = cleanPlate;
    await monthlyPass.save();

    return monthlyPass;
  }

  // To be called by check-in process to verify if a vehicle has an active monthly pass
  async getActivePassForLicensePlate(licensePlate) {
    const now = new Date();
    return MonthlyPass.findOne({
      licensePlate: licensePlate.toUpperCase(),
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
  }
}

module.exports = new MonthlyPassService();
