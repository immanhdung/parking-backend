const express = require('express');
const router = express.Router();
const ctrl = require('../payment.controller');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect);

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: Get all payments
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, completed, failed, refunded] }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [cash, momo, vnpay] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated payment list
 */
router.get('/', ctrl.getPayments);

/**
 * @swagger
 * /payments/stats:
 *   get:
 *     summary: Get revenue statistics
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: parkingLotId
 *         schema: { type: string }
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [today, week, month, year] }
 *     responses:
 *       200:
 *         description: Revenue stats
 */
router.get('/stats', restrictTo('system_admin', 'parking_manager'), ctrl.getRevenueStats);

/**
 * @swagger
 * /payments/cash:
 *   post:
 *     summary: Process cash payment (staff)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, cashReceived]
 *             properties:
 *               sessionId:
 *                 type: string
 *               cashReceived:
 *                 type: number
 *                 example: 50000
 *     responses:
 *       201:
 *         description: Cash payment recorded
 */
router.post('/cash', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.processCash);

/**
 * @swagger
 * /payments/momo/initiate:
 *   post:
 *     summary: Initiate MoMo payment
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId]
 *             properties:
 *               sessionId:
 *                 type: string
 *               returnUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: MoMo payment URL and QR code
 */
router.post('/momo/initiate', ctrl.initiateMomo);

/**
 * @swagger
 * /payments/confirm:
 *   post:
 *     summary: Confirm payment callback (from payment gateway)
 *     tags: [Payments]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentId:
 *                 type: string
 *               transactionId:
 *                 type: string
 *               gatewayResponse:
 *                 type: object
 *     responses:
 *       200:
 *         description: Payment confirmed
 */
router.post('/confirm', ctrl.confirmPayment);

router.get('/:id', ctrl.getById);
router.post('/:id/refund', restrictTo('system_admin', 'parking_manager'), ctrl.refund);

module.exports = router;
