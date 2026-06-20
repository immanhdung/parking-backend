const express = require('express');
const router = express.Router();
const ctrl = require('../parkingSlot.controller');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect);

/**
 * @swagger
 * /parking-slots:
 *   get:
 *     summary: Get all parking slots with filters
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: query
 *         name: parkingLot
 *         schema: { type: string }
 *       - in: query
 *         name: floor
 *         schema: { type: string }
 *       - in: query
 *         name: zone
 *         schema: { type: string }
 *       - in: query
 *         name: vehicleType
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [available, occupied, reserved, maintenance, locked]
 *     responses:
 *       200:
 *         description: Paginated slot list
 *   post:
 *     summary: Create a new parking slot
 *     tags: [Parking Slots]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slotCode, parkingLot, floor, zone, vehicleType]
 *             properties:
 *               slotCode:
 *                 type: string
 *                 example: A-001
 *               parkingLot:
 *                 type: string
 *               floor:
 *                 type: string
 *               zone:
 *                 type: string
 *               vehicleType:
 *                 type: string
 *     responses:
 *       201:
 *         description: Slot created
 */
router.get('/', ctrl.getSlots);
router.post('/', restrictTo('system_admin', 'parking_manager'), ctrl.create);
router.post('/bulk', restrictTo('system_admin', 'parking_manager'), ctrl.bulkCreate);

/**
 * @swagger
 * /parking-slots/available:
 *   get:
 *     summary: Find available slots (AI-powered optimal suggestion)
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: query
 *         name: parkingLotId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: vehicleTypeId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: floorId
 *         schema: { type: string }
 *       - in: query
 *         name: zoneId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Available slots with recommended slot
 */
router.get('/available', ctrl.findAvailable);

/**
 * @swagger
 * /parking-slots/floor-map/{floorId}:
 *   get:
 *     summary: Get realtime slot map for a floor
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: path
 *         name: floorId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Floor slot map
 */
router.get('/floor-map/:floorId', ctrl.getFloorMap);
router.get('/occupancy/:parkingLotId', ctrl.getOccupancyByVehicleType);

/**
 * @swagger
 * /parking-slots/{id}:
 *   get:
 *     summary: Get slot by ID
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Slot data
 *   put:
 *     summary: Update slot
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated slot
 *   delete:
 *     summary: Delete slot
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Slot deleted
 */
router.get('/:id', ctrl.getById);
router.put('/:id', restrictTo('system_admin', 'parking_manager'), ctrl.update);
router.delete('/:id', restrictTo('system_admin', 'parking_manager'), ctrl.delete);

/**
 * @swagger
 * /parking-slots/{id}/status:
 *   patch:
 *     summary: Update slot status (realtime)
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [available, occupied, reserved, maintenance, locked]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated and emitted via Socket.IO
 */
router.patch('/:id/status', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.updateStatus);

/**
 * @swagger
 * /parking-slots/{id}/lock:
 *   post:
 *     summary: Temporarily lock a slot for 3 minutes while user is selecting
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Slot locked with lockedUntil timestamp
 *       409:
 *         description: Slot already locked by another user
 * /parking-slots/{id}/unlock:
 *   delete:
 *     summary: Release a slot lock
 *     tags: [Parking Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Slot unlocked
 */
router.post('/:id/lock', ctrl.lockSlot);
router.delete('/:id/lock', ctrl.unlockSlot);

module.exports = router;
