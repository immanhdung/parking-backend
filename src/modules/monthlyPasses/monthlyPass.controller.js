const monthlyPassService = require('./monthlyPass.service');
const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');

exports.createMonthlyPass = catchAsync(async (req, res) => {
  const monthlyPass = await monthlyPassService.createMonthlyPass(req.body, req.user);
  sendResponse(res, 201, 'Monthly pass created successfully', monthlyPass);
});

exports.getMyMonthlyPasses = catchAsync(async (req, res) => {
  const result = await monthlyPassService.getMyMonthlyPasses(req.user, req.query);
  sendResponse(res, 200, 'My monthly passes retrieved successfully', result);
});

exports.getAllMonthlyPasses = catchAsync(async (req, res) => {
  const result = await monthlyPassService.getAllMonthlyPasses(req.query);
  sendResponse(res, 200, 'Monthly passes retrieved successfully', result);
});

exports.getMonthlyPassById = catchAsync(async (req, res) => {
  const monthlyPass = await monthlyPassService.getMonthlyPassById(req.params.id);
  sendResponse(res, 200, 'Monthly pass retrieved successfully', monthlyPass);
});

exports.changeVehicle = catchAsync(async (req, res) => {
  const monthlyPass = await monthlyPassService.changeVehicle(req.params.id, req.user, req.body);
  sendResponse(res, 200, 'Vehicle changed successfully', monthlyPass);
});
