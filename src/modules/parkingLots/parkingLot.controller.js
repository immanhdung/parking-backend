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
}

module.exports = new ParkingLotController();
