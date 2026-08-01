const parkingLotService = require('./parkingLot.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

class ParkingLotController {
  getAll = asyncHandler(async (req, res) => {
    const { docs, pagination } = await parkingLotService.getAll(req.query);
    ApiResponse.paginated(res, 'Parking lots retrieved.', docs, pagination);
  });

  getById = asyncHandler(async (req, res) => {
    const lot = await parkingLotService.getById(req.params.id);
    ApiResponse.success(res, 'Parking lot retrieved.', lot);
  });

  create = asyncHandler(async (req, res) => {
    const lot = await parkingLotService.create(req.body);
    ApiResponse.created(res, 'Parking lot created.', lot);
  });

  update = asyncHandler(async (req, res) => {
    const lot = await parkingLotService.update(req.params.id, req.body);
    ApiResponse.success(res, 'Parking lot updated.', lot);
  });

  delete = asyncHandler(async (req, res) => {
    await parkingLotService.delete(req.params.id);
    ApiResponse.success(res, 'Parking lot deleted.');
  });

  getSlotsSummary = asyncHandler(async (req, res) => {
    const summary = await parkingLotService.getSlotsSummary(req.params.id);
    ApiResponse.success(res, 'Slots summary retrieved.', summary);
  });

  /**
   * GET /parking-lots/:id/staff - Get staff assigned to a parking lot
   */
  getStaff = asyncHandler(async (req, res) => {
    const staff = await parkingLotService.getStaff(req.params.id);
    ApiResponse.success(res, 'Staff list retrieved.', staff);
  });

  /**
   * POST /parking-lots/:id/staff - Assign staff to a parking lot
   */
  assignStaff = asyncHandler(async (req, res) => {
    const result = await parkingLotService.assignStaff(req.params.id, req.body.staffId);
    ApiResponse.success(res, result.message, result.staff);
  });

  /**
   * DELETE /parking-lots/:id/staff/:staffId - Remove staff from a parking lot
   */
  removeStaff = asyncHandler(async (req, res) => {
    const result = await parkingLotService.removeStaff(req.params.id, req.params.staffId);
    ApiResponse.success(res, result.message);
  });

  /**
   * GET /parking-lots/available-staff - Get unassigned staff
   */
  getAvailableStaff = asyncHandler(async (req, res) => {
    const staff = await parkingLotService.getAvailableStaff(req.query);
    ApiResponse.success(res, 'Available staff retrieved.', staff);
  });

  /**
   * POST /parking-lots/:id/assign-manager  (admin only)
   * Body: { email }
   */
  assignManagerByEmail = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw ApiError.badRequest('Email is required.');
    const result = await parkingLotService.assignManagerByEmail(req.params.id, email);
    ApiResponse.success(res, result.message, result.user);
  });

  /**
   * POST /parking-lots/:id/add-staff  (manager/admin)
   * Body: { email }
   */
  addStaffByEmail = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw ApiError.badRequest('Email is required.');
    const result = await parkingLotService.addStaffByEmail(req.params.id, email, req.user._id);
    ApiResponse.success(res, result.message, result.user);
  });
}

module.exports = new ParkingLotController();


