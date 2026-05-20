const express = require('express');
const router = express.Router();
const ctrl = require('../booking.controller');
const { protect, restrictTo } = require('../../../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../../../middleware/validate');

router.use(protect);

const createBookingValidator = [
  body('parkingLot').notEmpty().withMessage('Parking lot is required').isMongoId(),
  body('vehicleType').notEmpty().withMessage('Vehicle type is required').isMongoId(),
  body('scheduledDate').notEmpty().withMessage('Scheduled date is required').isISO8601(),
  body('startTime').notEmpty().withMessage('Start time is required').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('endTime').notEmpty().withMessage('End time is required').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('vehicleInfo.licensePlate').notEmpty().withMessage('License plate is required'),
];

/**
 * @swagger
 * /bookings/my:
 *   get:
 *     summary: Get my bookings
 *     tags: [Bookings]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, cancelled, completed]
 *     responses:
 *       200:
 *         description: My bookings list
 */
router.get('/my', ctrl.myBookings);

/**
 * @swagger
 * /bookings:
 *   get:
 *     summary: Get all bookings (staff/admin)
 *     tags: [Bookings]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: parkingLot
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated booking list
 *   post:
 *     summary: Create a booking
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [parkingLot, vehicleType, scheduledDate, startTime, endTime, vehicleInfo]
 *             properties:
 *               parkingLot:
 *                 type: string
 *               vehicleType:
 *                 type: string
 *               scheduledDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-12-25"
 *               startTime:
 *                 type: string
 *                 example: "08:00"
 *               endTime:
 *                 type: string
 *                 example: "17:00"
 *               vehicleInfo:
 *                 type: object
 *                 properties:
 *                   licensePlate:
 *                     type: string
 *                     example: "51A-12345"
 *                   vehicleModel:
 *                     type: string
 *                   vehicleColor:
 *                     type: string
 *               floorId:
 *                 type: string
 *               zoneId:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created with QR code
 */
router.get('/', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.getBookings);
router.post('/', createBookingValidator, validate, ctrl.create);

/**
 * @swagger
 * /bookings/{id}:
 *   get:
 *     summary: Get booking by ID
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking data with QR code
 */
router.get('/:id', ctrl.getById);

/**
 * @swagger
 * /bookings/{id}/approve:
 *   patch:
 *     summary: Approve a booking (staff/manager)
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking approved
 */
router.patch('/:id/approve', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.approve);

/**
 * @swagger
 * /bookings/{id}/cancel:
 *   patch:
 *     summary: Cancel a booking
 *     tags: [Bookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking cancelled
 */
router.patch('/:id/cancel', ctrl.cancel);

module.exports = router;
