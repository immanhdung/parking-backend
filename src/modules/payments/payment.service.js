const Payment = require('./payment.model');
const ParkingSession = require('../parkingSessions/parkingSession.model');
const notificationService = require('../notifications/notification.service');
const ApiError = require('../../utils/ApiError');
const Pagination = require('../../utils/pagination');

class PaymentService {
  async getPayments(query, user) {
    const { page = 1, limit = 10, sort = '-createdAt', status, method, parkingLot, startDate, endDate } = query;

    const filter = {};
    if (status) filter.status = status;
    if (method) filter.method = method;

    if (user.role === 'parking_manager' || user.role === 'parking_staff') {
      filter.parkingLot = user.assignedParkingLot;
    } else if (parkingLot) {
      filter.parkingLot = parkingLot;
    }

    if (user.role === 'parking_user') {
      filter.user = user._id;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    return Pagination.paginate(Payment, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: Pagination.buildSort(sort),
      populate: [
        { path: 'user', select: 'fullName email' },
        { path: 'parkingLot', select: 'name code' },
        { path: 'parkingSession', select: 'sessionCode vehicleInfo entryTime exitTime' },
      ],
    });
  }

  async getById(id) {
    const payment = await Payment.findById(id)
      .populate('user', 'fullName email phone')
      .populate('parkingLot', 'name code address')
      .populate('parkingSession')
      .populate('receivedBy', 'fullName');

    if (!payment) throw ApiError.notFound('Payment not found.');
    return payment;
  }

  /**
   * Process cash payment
   */
  async processCash(data, staffId) {
    const { sessionId, cashReceived } = data;

    const session = await ParkingSession.findById(sessionId);
    if (!session) throw ApiError.notFound('Parking session not found.');
    if (session.status !== 'completed') {
      throw ApiError.badRequest('Session must be completed (checked out) before payment.');
    }
    if (session.paymentStatus === 'paid') {
      throw ApiError.badRequest('Session is already paid.');
    }

    const amount = session.totalFee;
    if (cashReceived < amount) {
      throw ApiError.badRequest(`Insufficient cash. Required: ${amount.toLocaleString('vi-VN')} VND`);
    }

    const payment = await Payment.create({
      parkingSession: sessionId,
      user: session.user,
      parkingLot: session.parkingLot,
      amount,
      baseFee: session.baseFee,
      overtimeFee: session.overtimeFee,
      method: 'cash',
      status: 'completed',
      cashReceived,
      cashChange: cashReceived - amount,
      receivedBy: staffId,
      paidAt: new Date(),
    });

    // Update session payment status
    session.paymentStatus = 'paid';
    session.payment = payment._id;
    await session.save();

    // Notify user
    if (session.user) {
      await notificationService.create({
        recipient: session.user,
        type: 'payment_success',
        title: 'Payment Successful',
        message: `Payment of ${amount.toLocaleString('vi-VN')} VND received. Invoice: ${payment.invoiceCode}`,
        data: { paymentId: payment._id, invoiceCode: payment.invoiceCode },
      });
    }

    return payment.populate([
      { path: 'parkingSession', select: 'sessionCode vehicleInfo' },
      { path: 'parkingLot', select: 'name code' },
    ]);
  }

  /**
   * Initiate MoMo payment (mock)
   */
  async initiateMomo(sessionId, returnUrl) {
    const session = await ParkingSession.findById(sessionId);
    if (!session) throw ApiError.notFound('Session not found.');
    if (session.paymentStatus === 'paid') throw ApiError.badRequest('Already paid.');

    const payment = await Payment.create({
      parkingSession: sessionId,
      user: session.user,
      parkingLot: session.parkingLot,
      amount: session.totalFee,
      baseFee: session.baseFee,
      overtimeFee: session.overtimeFee,
      method: 'momo',
      status: 'pending',
    });

    // Mock MoMo payment URL
    const momoPayUrl = `https://payment.momo.vn/pay?partnerCode=${process.env.MOMO_PARTNER_CODE}&amount=${session.totalFee}&orderId=${payment._id}&returnUrl=${returnUrl}`;

    return {
      payment,
      payUrl: momoPayUrl,
      qrCodeUrl: `https://mock-momo-qr.com/${payment._id}`,
    };
  }

  /**
   * Confirm payment (webhook callback from gateway)
   */
  async confirmPayment(paymentId, transactionId, gatewayResponse) {
    const payment = await Payment.findById(paymentId).populate('parkingSession');
    if (!payment) throw ApiError.notFound('Payment not found.');
    if (payment.status === 'completed') throw ApiError.badRequest('Already completed.');

    payment.status = 'completed';
    payment.transactionId = transactionId;
    payment.gatewayResponse = gatewayResponse;
    payment.paidAt = new Date();
    await payment.save();

    // Update session
    const session = await ParkingSession.findById(payment.parkingSession._id);
    session.paymentStatus = 'paid';
    session.payment = payment._id;
    await session.save();

    if (session.user) {
      await notificationService.create({
        recipient: session.user,
        type: 'payment_success',
        title: 'Payment Successful',
        message: `Payment confirmed. Invoice: ${payment.invoiceCode}`,
        data: { paymentId: payment._id },
      });
    }

    return payment;
  }

  /**
   * Refund payment
   */
  async refund(paymentId, reason, staffId) {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw ApiError.notFound('Payment not found.');
    if (payment.status !== 'completed') throw ApiError.badRequest('Can only refund completed payments.');

    payment.status = 'refunded';
    payment.refundedAt = new Date();
    payment.refundAmount = payment.amount;
    payment.refundReason = reason;
    await payment.save();

    // Update session
    await ParkingSession.findByIdAndUpdate(payment.parkingSession, { paymentStatus: 'refunded' });

    return payment;
  }

  async getRevenueStats(parkingLotId, period = 'today') {
    const { getDateRange } = require('../../utils/helpers');
    const { start, end } = getDateRange(period);

    const mongoose = require('mongoose');
    const match = {
      status: 'completed',
      paidAt: { $gte: start, $lte: end },
    };
    if (parkingLotId) match.parkingLot = new mongoose.Types.ObjectId(parkingLotId);

    const result = await Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          totalTransactions: { $sum: 1 },
          avgTransaction: { $avg: '$amount' },
          byMethod: {
            $push: { method: '$method', amount: '$amount' },
          },
        },
      },
    ]);

    return result[0] || { totalRevenue: 0, totalTransactions: 0, avgTransaction: 0 };
  }
}

module.exports = new PaymentService();
