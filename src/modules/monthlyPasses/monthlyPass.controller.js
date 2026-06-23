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
