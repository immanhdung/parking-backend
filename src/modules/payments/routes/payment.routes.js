const express = require('express');
const router = express.Router();
const ctrl = require('../payment.controller');
const { protect, restrictTo } = require('../../../middleware/auth');

/**
 * @swagger
 * /payments/sepay-webhook:
 *   post:
 *     summary: SEPay webhook callback (public endpoint)
 *     description: |
 *       Called by SEPay when a bank transfer is received.
 *       Matches transfer content (PAR code) to confirm pending payments.
 *       No authentication required.
 *     tags: [Payments]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id: { type: number }
 *               gateway: { type: string, example: MBBank }
 *               transactionDate: { type: string }
 *               accountNumber: { type: string }
 *               content: { type: string, example: PAR1606A3B2C1 }
 *               transferType: { type: string, enum: [in, out] }
 *               transferAmount: { type: number }
 *               referenceCode: { type: string }
 *     responses:
 *       200:
 *         description: Webhook processed
 */
router.post('/sepay-webhook', ctrl.sepayWebhook);

// All routes below require authentication
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
 *         schema: { type: string, enum: [cash, momo, vnpay, bank_transfer] }
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
 * /payments/bank-transfer/initiate:
 *   post:
 *     summary: Initiate bank transfer payment with SEPay QR code
 *     description: Creates a pending payment and returns QR code URL for customer to scan
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
 *                 description: Parking session ID (must be checked out)
 *     responses:
 *       201:
 *         description: QR code generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qrUrl: { type: string, description: SEPay QR image URL }
 *                 transferContent: { type: string, example: PAR1606A3B2C1 }
 *                 amount: { type: number }
 *                 bankInfo:
 *                   type: object
 *                   properties:
 *                     bankName: { type: string }
 *                     accountNumber: { type: string }
 *                     accountName: { type: string }
 */
router.post('/bank-transfer/initiate', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.initiateBankTransfer);

/**
 * @swagger
 * /payments/bank-transfer/booking/initiate:
 *   post:
 *     summary: Initiate bank transfer payment for booking
 *     description: Creates a pending payment and returns QR code URL for booking
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId]
 *             properties:
 *               bookingId:
 *                 type: string
 *     responses:
 *       201:
 *         description: QR code generated
 */
router.post('/bank-transfer/booking/initiate', ctrl.initiateBookingBankTransfer);

/**
 * @swagger
 * /payments/bank-transfer/monthly-pass/initiate:
 *   post:
 *     summary: Initiate bank transfer payment for monthly pass
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monthlyPassId]
 *             properties:
 *               monthlyPassId:
 *                 type: string
 *     responses:
 *       201:
 *         description: QR code generated
 */
router.post('/bank-transfer/monthly-pass/initiate', restrictTo('parking_user', 'system_admin', 'parking_manager'), ctrl.initiateMonthlyPassBankTransfer);

/**
 * @swagger
 * /payments/bank-transfer/{id}/status:
 *   get:
 *     summary: Check bank transfer payment status
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment status
 */
router.get('/bank-transfer/:id/status', ctrl.checkBankTransferStatus);

router.post('/momo/initiate', ctrl.initiateMomo);
router.post('/confirm', ctrl.confirmPayment);
router.get('/:id', ctrl.getById);
router.post('/:id/refund', restrictTo('system_admin', 'parking_manager'), ctrl.refund);

module.exports = router;
