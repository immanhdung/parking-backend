const parkingLotService = require('./parkingLot.service');
const ApiResponse = require('../../utils/ApiResponse');
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
    const lot = await parkingLotService.create(req.body, req.user._id);
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
    const managerId = req.user.role === 'system_admin' ? null : req.user._id;
    const staff = await parkingLotService.getStaff(req.params.id, managerId);
    ApiResponse.success(res, 'Staff list retrieved.', staff);
  });

  /**
   * POST /parking-lots/:id/staff - Assign staff to a parking lot
   */
  assignStaff = asyncHandler(async (req, res) => {
    const managerId = req.user.role === 'system_admin' ? null : req.user._id;
    const result = await parkingLotService.assignStaff(req.params.id, req.body.staffId, managerId);
    ApiResponse.success(res, result.message, result.staff);
  });

  /**
   * DELETE /parking-lots/:id/staff/:staffId - Remove staff from a parking lot
   */
  removeStaff = asyncHandler(async (req, res) => {
    const managerId = req.user.role === 'system_admin' ? null : req.user._id;
    const result = await parkingLotService.removeStaff(req.params.id, req.params.staffId, managerId);
    ApiResponse.success(res, result.message);
  });

  /**
   * GET /parking-lots/available-staff - Get unassigned staff
   */
  getAvailableStaff = asyncHandler(async (req, res) => {
    const staff = await parkingLotService.getAvailableStaff(req.query);
    ApiResponse.success(res, 'Available staff retrieved.', staff);
  });
}

module.exports = new ParkingLotController();

