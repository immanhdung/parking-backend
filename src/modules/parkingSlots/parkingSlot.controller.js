const parkingSlotService = require('./parkingSlot.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

class ParkingSlotController {
  getSlots = asyncHandler(async (req, res) => {
    const { docs, pagination } = await parkingSlotService.getSlots(req.query);
    ApiResponse.paginated(res, 'Slots retrieved.', docs, pagination);
  });

  getById = asyncHandler(async (req, res) => {
    const slot = await parkingSlotService.getById(req.params.id);
    ApiResponse.success(res, 'Slot retrieved.', slot);
  });

  create = asyncHandler(async (req, res) => {
    const slot = await parkingSlotService.create(req.body);
    ApiResponse.created(res, 'Slot created.', slot);
  });

  bulkCreate = asyncHandler(async (req, res) => {
    const { slots, parkingLotId } = req.body;
    const created = await parkingSlotService.bulkCreate(slots, parkingLotId);
    ApiResponse.created(res, `${created.length} slots created.`, created);
  });

  update = asyncHandler(async (req, res) => {
    const slot = await parkingSlotService.update(req.params.id, req.body);
    ApiResponse.success(res, 'Slot updated.', slot);
  });

  updateStatus = asyncHandler(async (req, res) => {
    const { status, notes } = req.body;
    const slot = await parkingSlotService.updateStatus(req.params.id, status, { notes });
    
    // Emit realtime update via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`parkingLot:${slot.parkingLot}`).emit('slotStatusUpdated', {
        slotId: slot._id,
        slotCode: slot.slotCode,
        status: slot.status,
        floor: slot.floor,
        zone: slot.zone,
      });
    }

    ApiResponse.success(res, 'Slot status updated.', slot);
  });

  delete = asyncHandler(async (req, res) => {
    await parkingSlotService.delete(req.params.id);
    ApiResponse.success(res, 'Slot deleted.');
  });

  findAvailable = asyncHandler(async (req, res) => {
    const { parkingLotId, vehicleTypeId, floorId, zoneId } = req.query;
    const result = await parkingSlotService.findAvailableSlots(
      parkingLotId,
      vehicleTypeId,
      { floorId, zoneId }
    );
    ApiResponse.success(res, 'Available slots retrieved.', result);
  });

  getFloorMap = asyncHandler(async (req, res) => {
    const slots = await parkingSlotService.getFloorSlotMap(req.params.floorId);
    ApiResponse.success(res, 'Floor slot map retrieved.', slots);
  });

  getOccupancyByVehicleType = asyncHandler(async (req, res) => {
    const data = await parkingSlotService.getOccupancyByVehicleType(req.params.parkingLotId);
    ApiResponse.success(res, 'Occupancy data retrieved.', data);
  });
}

module.exports = new ParkingSlotController();
