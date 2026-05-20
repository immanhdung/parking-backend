const express = require('express');
const router = express.Router();
const floorService = require('../floor.service');
const ApiResponse = require('../../../utils/ApiResponse');
const asyncHandler = require('../../../utils/asyncHandler');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect);

/**
 * @swagger
 * /floors:
 *   get:
 *     summary: Get all floors
 *     tags: [Floors]
 *     parameters:
 *       - in: query
 *         name: parkingLot
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, maintenance] }
 *     responses:
 *       200:
 *         description: Floor list
 *   post:
 *     summary: Create a floor
 *     tags: [Floors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [parkingLot, floorNumber, name]
 *             properties:
 *               parkingLot:
 *                 type: string
 *               floorNumber:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: Tầng 1
 *               floorType:
 *                 type: string
 *                 enum: [ground, above_ground, basement]
 *               allowedVehicleTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Floor created
 */
router.get('/', asyncHandler(async (req, res) => {
  const { docs, pagination } = await floorService.getAll(req.query);
  ApiResponse.paginated(res, 'Floors retrieved.', docs, pagination);
}));

router.post('/', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const floor = await floorService.create(req.body);
  ApiResponse.created(res, 'Floor created.', floor);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const floor = await floorService.getById(req.params.id);
  ApiResponse.success(res, 'Floor retrieved.', floor);
}));

router.put('/:id', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const floor = await floorService.update(req.params.id, req.body);
  ApiResponse.success(res, 'Floor updated.', floor);
}));

router.delete('/:id', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  await floorService.delete(req.params.id);
  ApiResponse.success(res, 'Floor deleted.');
}));

module.exports = router;
