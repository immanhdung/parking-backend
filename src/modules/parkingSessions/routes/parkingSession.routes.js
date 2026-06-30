const express = require('express');
const router = express.Router();
const ctrl = require('../parkingSession.controller');
const { protect, restrictTo } = require('../../../middleware/auth');
const { uploadEvidence } = require('../../../config/cloudinary');

router.use(protect);

/**
 * @swagger
 * /parking-sessions:
 *   get:
 *     summary: Get all parking sessions
 *     tags: [Parking Sessions]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, completed, cancelled] }
 *       - in: query
 *         name: licensePlate
 *         schema: { type: string }
 *       - in: query
 *         name: parkingLot
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated session list
 */
router.get('/', ctrl.getSessions);

/**
 * @swagger
 * /parking-sessions/find-active:
 *   get:
 *     summary: Find active session by license plate or session code
 *     tags: [Parking Sessions]
 *     parameters:
 *       - in: query
 *         name: licensePlate
 *         schema: { type: string }
 *         example: 51A-12345
 *       - in: query
 *         name: sessionCode
 *         schema: { type: string }
 *       - in: query
 *         name: parkingLotId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Active session data
 *       404:
 *         description: No active session found
 */
router.get('/find-active', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.findActive);

/**
 * @swagger
 * /parking-sessions/overdue:
 *   get:
 *     summary: Get overdue sessions
 *     tags: [Parking Sessions]
 *     parameters:
 *       - in: query
 *         name: parkingLotId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of overdue sessions
 */
router.get('/overdue', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.getOverdue);

/**
 * @swagger
 * /parking-sessions/check-in:
 *   post:
 *     summary: Check-in a vehicle (staff)
 *     tags: [Parking Sessions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [parkingLotId]
 *             properties:
 *               bookingId:
 *                 type: string
 *                 description: Provide for booking-based check-in
 *               monthlyPassCode:
 *                 type: string
 *                 description: Provide for monthly pass QR-based check-in
 *               licensePlate:
 *                 type: string
 *                 example: 51A-12345
 *               vehicleTypeId:
 *                 type: string
 *                 description: Required for walk-in check-in
 *               parkingLotId:
 *                 type: string
 *               slotId:
 *                 type: string
 *                 description: Optional, auto-assigned if not provided
 *               vehicleModel:
 *                 type: string
 *               vehicleColor:
 *                 type: string
 *               ticketNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: Session created, slot assigned
 */
router.post('/check-in', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.checkIn);

/**
 * @swagger
 * /parking-sessions/{id}:
 *   get:
 *     summary: Get session by ID
 *     tags: [Parking Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session details with fee breakdown
 */
router.get('/:id', ctrl.getById);

/**
 * @swagger
 * /parking-sessions/{id}/check-out:
 *   patch:
 *     summary: Check-out a vehicle and calculate fee (staff)
 *     tags: [Parking Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session completed with fee breakdown
 */
router.patch('/:id/check-out', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.checkOut);

/**
 * @swagger
 * /parking-sessions/{id}/evidence:
 *   post:
 *     summary: Upload evidence images (entry/exit photos)
 *     tags: [Parking Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               type:
 *                 type: string
 *                 enum: [entry, exit, incident]
 *     responses:
 *       200:
 *         description: Images uploaded
 */
router.post(
  '/:id/evidence',
  restrictTo('system_admin', 'parking_manager', 'parking_staff'),
  uploadEvidence.array('images', 5),
  ctrl.addEvidence
);

/**
 * @swagger
 * /parking-sessions/{id}/license-plate:
 *   patch:
 *     summary: Update license plate of an active session (staff)
 *     tags: [Parking Sessions]
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
 *             required: [licensePlate]
 *             properties:
 *               licensePlate:
 *                 type: string
 *     responses:
 *       200:
 *         description: License plate updated successfully
 */
router.patch('/:id/license-plate', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.updateLicensePlate);

module.exports = router;
