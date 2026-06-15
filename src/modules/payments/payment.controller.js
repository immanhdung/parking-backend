const paymentService = require('./payment.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

class PaymentController {
  getPayments = asyncHandler(async (req, res) => {
    const { docs, pagination } = await paymentService.getPayments(req.query, req.user);
    ApiResponse.paginated(res, 'Payments retrieved.', docs, pagination);
  });

  getById = asyncHandler(async (req, res) => {
    const payment = await paymentService.getById(req.params.id);
    ApiResponse.success(res, 'Payment retrieved.', payment);
  });

  processCash = asyncHandler(async (req, res) => {
    const payment = await paymentService.processCash(req.body, req.user._id);
    ApiResponse.created(res, 'Cash payment processed.', payment);
  });

  initiateMomo = asyncHandler(async (req, res) => {
    const { sessionId, returnUrl } = req.body;
    const result = await paymentService.initiateMomo(sessionId, returnUrl);
    ApiResponse.success(res, 'MoMo payment initiated.', result);
  });

  confirmPayment = asyncHandler(async (req, res) => {
    const { paymentId, transactionId, gatewayResponse } = req.body;
    const payment = await paymentService.confirmPayment(paymentId, transactionId, gatewayResponse);
    ApiResponse.success(res, 'Payment confirmed.', payment);
  });

  refund = asyncHandler(async (req, res) => {
    const payment = await paymentService.refund(req.params.id, req.body.reason, req.user._id);
    ApiResponse.success(res, 'Payment refunded.', payment);
  });

  getRevenueStats = asyncHandler(async (req, res) => {
    const stats = await paymentService.getRevenueStats(req.query.parkingLotId, req.query.period);
    ApiResponse.success(res, 'Revenue stats retrieved.', stats);
  });

  /**
   * POST /payments/bank-transfer/initiate
   * Create pending payment + generate SEPay QR code URL
   */
  initiateBankTransfer = asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    const result = await paymentService.initiateBankTransfer(sessionId, req.user._id);
    ApiResponse.created(res, 'Bank transfer QR code generated.', result);
  });

  /**
   * POST /payments/bank-transfer/booking/initiate
   * Create pending payment + generate SEPay QR code URL for BOOKING prepay
   */
  initiateBookingBankTransfer = asyncHandler(async (req, res) => {
    const { bookingId } = req.body;
    const result = await paymentService.initiateBookingBankTransfer(bookingId, req.user._id);
    ApiResponse.created(res, 'Booking bank transfer QR code generated.', result);
  });

  /**
   * POST /payments/sepay-webhook
   * Public endpoint - called by SEPay when bank transfer is received
   * NO authentication required (verified by SEPay API key header)
   */
  sepayWebhook = asyncHandler(async (req, res) => {
    // Verify SEPay webhook API key if configured
    const sepayApiKey = process.env.SEPAY_WEBHOOK_API_KEY;
    if (sepayApiKey) {
      const authHeader = req.headers['authorization'];
      const providedKey = authHeader?.replace('Apikey ', '') || req.headers['x-api-key'];
      if (providedKey !== sepayApiKey) {
        return res.status(401).json({ success: false, message: 'Invalid webhook API key' });
      }
    }

    const io = req.app.get('io');
    const result = await paymentService.handleSepayWebhook(req.body, io);

    // SEPay expects { success: true } response
    res.status(200).json({ success: true, ...result });
  });

  /**
   * GET /payments/bank-transfer/:id/status
   * Check if bank transfer payment has been confirmed
   */
  checkBankTransferStatus = asyncHandler(async (req, res) => {
    const result = await paymentService.checkBankTransferStatus(req.params.id);
    ApiResponse.success(res, 'Payment status retrieved.', result);
  });
}

module.exports = new PaymentController();
