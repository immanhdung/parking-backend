// ============================================
// ZONE ROUTES
// ============================================
const express = require('express');
const zoneRouter = express.Router();
const Zone = require('../../zones/zone.model');
const VehicleType = require('../../vehicleTypes/vehicleType.model');
const ApiResponse = require('../../../utils/ApiResponse');
const asyncHandler = require('../../../utils/asyncHandler');
const { protect, restrictTo, optionalAuth } = require('../../../middleware/auth');
const ApiError = require('../../../utils/ApiError');
const Pagination = require('../../../utils/pagination');

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
zoneRouter.get('/', optionalAuth, asyncHandler(async (req, res) => {
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

  // Attach live slot counts from ParkingSlot collection
  if (docs.length > 0) {
    const ParkingSlot = require('../../parkingSlots/parkingSlot.model');
    const mongoose = require('mongoose');
    const zoneIds = docs.map(d => new mongoose.Types.ObjectId(d._id));
    const agg = await ParkingSlot.aggregate([
      { $match: { zone: { $in: zoneIds }, isDeleted: { $ne: true } } },
      { $group: { _id: { zone: '$zone', status: '$status' }, count: { $sum: 1 } } },
    ]);
    const countMap = {};
    agg.forEach(r => {
      const zid = r._id.zone.toString();
      if (!countMap[zid]) countMap[zid] = { total: 0, available: 0 };
      countMap[zid].total += r.count;
      if (r._id.status === 'available') countMap[zid].available += r.count;
    });
    docs.forEach(z => {
      const c = countMap[z._id.toString()] || { total: 0, available: 0 };
      z.totalSlots = c.total;
      z.availableSlots = c.available;
    });
  }

  ApiResponse.paginated(res, 'Zones retrieved.', docs, pagination);
}));

zoneRouter.post('/', protect, restrictTo('parking_manager'), asyncHandler(async (req, res) => {
  const zone = await Zone.create({ ...req.body, code: req.body.code?.toUpperCase() });
  ApiResponse.created(res, 'Zone created.', zone);
}));

zoneRouter.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const zone = await Zone.findById(req.params.id)
    .populate('floor', 'name floorNumber')
    .populate('parkingLot', 'name code')
    .populate('allowedVehicleTypes', 'name code pricing');
  if (!zone) throw ApiError.notFound('Zone not found.');
  ApiResponse.success(res, 'Zone retrieved.', zone);
}));

zoneRouter.put('/:id', protect, restrictTo('parking_manager'), asyncHandler(async (req, res) => {
  const zone = await Zone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!zone) throw ApiError.notFound('Zone not found.');
  ApiResponse.success(res, 'Zone updated.', zone);
}));

zoneRouter.delete('/:id', protect, restrictTo('parking_manager'), asyncHandler(async (req, res) => {
  const zone = await Zone.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
  if (!zone) throw ApiError.notFound('Zone not found.');
  ApiResponse.success(res, 'Zone deleted.');
}));

// ============================================
// VEHICLE TYPE ROUTES
// ============================================
const vehicleTypeRouter = express.Router();

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
vehicleTypeRouter.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { parkingLot, isActive } = req.query;
  const filter = { isActive: isActive !== 'false' };
  if (parkingLot) {
    // Return vehicle types for this specific lot
    filter.parkingLot = parkingLot;
  } else {
    // Default: return global types (null parkingLot) 
    filter.parkingLot = null;
  }
  const types = await VehicleType.find(filter).sort({ name: 1 });
  ApiResponse.success(res, 'Vehicle types retrieved.', types);
}));

vehicleTypeRouter.post('/', protect, restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const code = req.body.code?.toUpperCase();
  const parkingLot = req.body.parkingLot || null;
  const existing = await VehicleType.findOne({ code, parkingLot });
  if (existing) throw ApiError.conflict('Vehicle type code already exists for this parking lot.');
  const vt = await VehicleType.create({ ...req.body, code, parkingLot });
  ApiResponse.created(res, 'Vehicle type created.', vt);
}));

vehicleTypeRouter.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const vt = await VehicleType.findById(req.params.id);
  if (!vt) throw ApiError.notFound('Vehicle type not found.');
  ApiResponse.success(res, 'Vehicle type retrieved.', vt);
}));

vehicleTypeRouter.put('/:id', protect, restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const vt = await VehicleType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!vt) throw ApiError.notFound('Vehicle type not found.');
  ApiResponse.success(res, 'Vehicle type updated.', vt);
}));

vehicleTypeRouter.delete('/:id', protect, restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const vt = await VehicleType.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
  if (!vt) throw ApiError.notFound('Vehicle type not found.');
  ApiResponse.success(res, 'Vehicle type deleted.');
}));

module.exports = { zoneRouter, vehicleTypeRouter };
