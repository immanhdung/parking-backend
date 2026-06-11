const vehicleService = require('./vehicle.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

class VehicleController {
  /**
   * GET /vehicles - Get my vehicles
   */
  getMyVehicles = asyncHandler(async (req, res) => {
    const { docs, pagination } = await vehicleService.getMyVehicles(req.user._id, req.query);
    ApiResponse.paginated(res, 'Vehicles retrieved successfully.', docs, pagination);
  });

  /**
   * GET /vehicles/:id - Get vehicle by ID
   */
  getVehicleById = asyncHandler(async (req, res) => {
    const vehicle = await vehicleService.getVehicleById(req.params.id, req.user._id);
    ApiResponse.success(res, 'Vehicle retrieved.', vehicle);
  });

  /**
   * POST /vehicles - Add a new vehicle
   */
  addVehicle = asyncHandler(async (req, res) => {
    const vehicle = await vehicleService.addVehicle(req.user._id, req.body);
    ApiResponse.created(res, 'Vehicle added successfully.', vehicle);
  });

  /**
   * PUT /vehicles/:id - Update vehicle
   */
  updateVehicle = asyncHandler(async (req, res) => {
    const vehicle = await vehicleService.updateVehicle(req.params.id, req.user._id, req.body);
    ApiResponse.success(res, 'Vehicle updated successfully.', vehicle);
  });

  /**
   * PATCH /vehicles/:id/default - Set as default vehicle
   */
  setDefault = asyncHandler(async (req, res) => {
    const vehicle = await vehicleService.setDefault(req.params.id, req.user._id);
    ApiResponse.success(res, 'Default vehicle updated.', vehicle);
  });

  /**
   * DELETE /vehicles/:id - Delete vehicle
   */
  deleteVehicle = asyncHandler(async (req, res) => {
    await vehicleService.deleteVehicle(req.params.id, req.user._id);
    ApiResponse.success(res, 'Vehicle deleted successfully.');
  });

  /**
   * GET /vehicles/default - Get default vehicle
   */
  getDefaultVehicle = asyncHandler(async (req, res) => {
    const vehicle = await vehicleService.getDefaultVehicle(req.user._id);
    ApiResponse.success(res, vehicle ? 'Default vehicle retrieved.' : 'No default vehicle set.', vehicle);
  });
}

module.exports = new VehicleController();
