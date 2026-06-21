// ============================================
// ZONE ROUTES
// ============================================
const express = require('express');
const zoneRouter = express.Router();
const Zone = require('../../zones/zone.model');
const VehicleType = require('../../vehicleTypes/vehicleType.model');
const ApiResponse = require('../../../utils/ApiResponse');
const asyncHandler = require('../../../utils/asyncHandler');
const { protect, restrictTo } = require('../../../middleware/auth');
const ApiError = require('../../../utils/ApiError');
const Pagination = require('../../../utils/pagination');

zoneRouter.use(protect);

/**
 * @swagger
 * /zones:
 *   get:
 *     summary: Get all zones
 *     tags: [Zones]
 *     parameters:
 *       - in: query
 *         name: floor
 *         schema: { type: string }
 *       - in: query
 *         name: parkingLot
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Zone list
 *   post:
 *     summary: Create zone
 *     tags: [Zones]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [floor, parkingLot, name, code]
 *             properties:
 *               floor:
 *                 type: string
 *               parkingLot:
 *                 type: string
 *               name:
 *                 type: string
 *                 example: Khu A
 *               code:
 *                 type: string
 *                 example: A
 *     responses:
 *       201:
 *         description: Zone created
 */
zoneRouter.get('/', asyncHandler(async (req, res) => {
  const { floor, parkingLot, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (floor) filter.floor = floor;
  if (parkingLot) filter.parkingLot = parkingLot;

  const { docs, pagination } = await Pagination.paginate(Zone, filter, {
    page: parseInt(page), limit: parseInt(limit), sort: { name: 1 },
    populate: [
      { path: 'floor', select: 'name floorNumber' },
      { path: 'allowedVehicleTypes', select: 'name code' },
    ],
  });
  ApiResponse.paginated(res, 'Zones retrieved.', docs, pagination);
}));

zoneRouter.post('/', restrictTo('parking_manager'), asyncHandler(async (req, res) => {
  const zone = await Zone.create({ ...req.body, code: req.body.code?.toUpperCase() });
  ApiResponse.created(res, 'Zone created.', zone);
}));

zoneRouter.get('/:id', asyncHandler(async (req, res) => {
  const zone = await Zone.findById(req.params.id)
    .populate('floor', 'name floorNumber')
    .populate('parkingLot', 'name code')
    .populate('allowedVehicleTypes', 'name code pricing');
  if (!zone) throw ApiError.notFound('Zone not found.');
  ApiResponse.success(res, 'Zone retrieved.', zone);
}));

zoneRouter.put('/:id', restrictTo('parking_manager'), asyncHandler(async (req, res) => {
  const zone = await Zone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!zone) throw ApiError.notFound('Zone not found.');
  ApiResponse.success(res, 'Zone updated.', zone);
}));

zoneRouter.delete('/:id', restrictTo('parking_manager'), asyncHandler(async (req, res) => {
  const zone = await Zone.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
  if (!zone) throw ApiError.notFound('Zone not found.');
  ApiResponse.success(res, 'Zone deleted.');
}));

// ============================================
// VEHICLE TYPE ROUTES
// ============================================
const vehicleTypeRouter = express.Router();

vehicleTypeRouter.use(protect);

/**
 * @swagger
 * /vehicle-types:
 *   get:
 *     summary: Get all vehicle types
 *     tags: [Vehicle Types]
 *     responses:
 *       200:
 *         description: Vehicle type list
 *   post:
 *     summary: Create vehicle type (admin)
 *     tags: [Vehicle Types]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, size, pricing]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Xe ô tô
 *               code:
 *                 type: string
 *                 example: CAR
 *               size:
 *                 type: string
 *                 enum: [small, medium, large, extra_large]
 *               pricing:
 *                 type: object
 *                 properties:
 *                   dayBlockRate:
 *                     type: number
 *                     example: 5000
 *                     description: Price per 4-hour daytime block (6AM–6PM)
 *                   nightBlockRate:
 *                     type: number
 *                     example: 7500
 *                     description: Price per 4-hour nighttime block (6PM–6AM). Defaults to 1.5x dayBlockRate.
 *                   dailyRate:
 *                     type: number
 *                     example: 80000
 *                   monthlyRate:
 *                     type: number
 *                     example: 1500000
 *     responses:
 *       201:
 *         description: Vehicle type created
 */
vehicleTypeRouter.get('/', asyncHandler(async (req, res) => {
  const types = await VehicleType.find({ isActive: true }).sort({ name: 1 });
  ApiResponse.success(res, 'Vehicle types retrieved.', types);
}));

vehicleTypeRouter.post('/', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const existing = await VehicleType.findOne({ code: req.body.code?.toUpperCase() });
  if (existing) throw ApiError.conflict('Vehicle type code already exists.');
  const vt = await VehicleType.create({ ...req.body, code: req.body.code?.toUpperCase() });
  ApiResponse.created(res, 'Vehicle type created.', vt);
}));

vehicleTypeRouter.get('/:id', asyncHandler(async (req, res) => {
  const vt = await VehicleType.findById(req.params.id);
  if (!vt) throw ApiError.notFound('Vehicle type not found.');
  ApiResponse.success(res, 'Vehicle type retrieved.', vt);
}));

vehicleTypeRouter.put('/:id', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const vt = await VehicleType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!vt) throw ApiError.notFound('Vehicle type not found.');
  ApiResponse.success(res, 'Vehicle type updated.', vt);
}));

vehicleTypeRouter.delete('/:id', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const vt = await VehicleType.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
  if (!vt) throw ApiError.notFound('Vehicle type not found.');
  ApiResponse.success(res, 'Vehicle type deleted.');
}));

module.exports = { zoneRouter, vehicleTypeRouter };
