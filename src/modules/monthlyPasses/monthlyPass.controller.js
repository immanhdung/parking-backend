const monthlyPassService = require('./monthlyPass.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

exports.createMonthlyPass = asyncHandler(async (req, res) => {
  const monthlyPass = await monthlyPassService.createMonthlyPass(req.body, req.user);
  ApiResponse.created(res, 'Monthly pass created successfully', monthlyPass);
});

exports.getMyMonthlyPasses = asyncHandler(async (req, res) => {
  const result = await monthlyPassService.getMyMonthlyPasses(req.user, req.query);
  ApiResponse.success(res, 'My monthly passes retrieved successfully', result);
});

exports.getAllMonthlyPasses = asyncHandler(async (req, res) => {
  const result = await monthlyPassService.getAllMonthlyPasses(req.query);
  ApiResponse.success(res, 'Monthly passes retrieved successfully', result);
});

exports.getMonthlyPassById = asyncHandler(async (req, res) => {
  const monthlyPass = await monthlyPassService.getMonthlyPassById(req.params.id);
  ApiResponse.success(res, 'Monthly pass retrieved successfully', monthlyPass);
});

exports.changeVehicle = asyncHandler(async (req, res) => {
  const monthlyPass = await monthlyPassService.changeVehicle(req.params.id, req.user, req.body);
  ApiResponse.success(res, 'Vehicle changed successfully', monthlyPass);
});

exports.cancelMyPass = asyncHandler(async (req, res) => {
  const result = await monthlyPassService.cancelMyPass(req.params.id, req.user);
  ApiResponse.success(res, result.message, null);
});

// Verify a pass by passCode — used by staff scanner to validate before check-in
exports.verifyPassByCode = asyncHandler(async (req, res) => {
  const { passCode } = req.query;
  if (!passCode) return res.status(400).json({ message: 'passCode is required' });

  const MonthlyPass = require('./monthlyPass.model');
  const pass = await MonthlyPass.findOne({ passCode })
    .populate('parkingLot', '_id name')
    .populate('vehicleType', 'name')
    .select('passCode licensePlate status startDate endDate parkingLot vehicleType');

  if (!pass) return res.status(404).json({ message: 'Pass not found.' });

  ApiResponse.success(res, 'Pass verified.', {
    passCode: pass.passCode,
    licensePlate: pass.licensePlate,
    status: pass.status,
    startDate: pass.startDate,
    endDate: pass.endDate,
    parkingLotId: pass.parkingLot?._id,
    parkingLotName: pass.parkingLot?.name,
    vehicleTypeName: pass.vehicleType?.name,
  });
});
