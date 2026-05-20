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
}

module.exports = new PaymentController();
