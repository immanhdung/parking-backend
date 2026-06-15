const Payment = require('./payment.model');
const ParkingSession = require('../parkingSessions/parkingSession.model');
const Booking = require('../bookings/booking.model');
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

  /**
   * Initiate bank transfer payment with VietQR / SEPay QR code for SESSION CHECKOUT
   * Creates a pending payment and returns QR code URL for customer to scan
   */
  async initiateBankTransfer(sessionId, staffId) {
    const { generateTransferContent } = require('../../utils/helpers');
    const logger = require('../../utils/logger');

    const session = await ParkingSession.findById(sessionId);
    if (!session) throw ApiError.notFound('Parking session not found.');
    if (session.status !== 'completed') {
      throw ApiError.badRequest('Session must be completed (checked out) before payment.');
    }
    if (session.paymentStatus === 'paid') {
      throw ApiError.badRequest('Session is already paid.');
    }

    const amount = session.totalFee;
    if (!amount || amount <= 0) {
      throw ApiError.badRequest('Invalid payment amount.');
    }

    // Generate unique transfer content: PAR + DDMM + 6 random chars
    const transferContent = generateTransferContent();

    // Use official VietQR standard for best compatibility with MoMo/ZaloPay
    // VietQR uses 'addInfo' parameter which forces bank apps to pre-fill the transfer message
    const bankId = process.env.SEPAY_BANK_ID || 'MB'; // 'MB' is the standard short name
    const accountNumber = process.env.SEPAY_ACCOUNT_NUMBER || '0342347435';
    const accountName = encodeURIComponent(process.env.SEPAY_ACCOUNT_NAME || 'PARKINGBUILDING');
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNumber}-compact.jpg?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${accountName}`;

    // Create pending bank_transfer payment
    const payment = await Payment.create({
      parkingSession: sessionId,
      user: session.user,
      parkingLot: session.parkingLot,
      amount,
      baseFee: session.baseFee,
      overtimeFee: session.overtimeFee,
      method: 'bank_transfer',
      status: 'pending',
      transferContent,
      bankTransferQrUrl: qrUrl,
      receivedBy: staffId,
    });

    // Link payment to session
    session.payment = payment._id;
    await session.save();

    logger.info(`[Payment] Bank transfer initiated: ${transferContent} | Amount: ${amount} VND | Session: ${session.sessionCode}`);

    return {
      payment,
      qrUrl,
      transferContent,
      amount,
      bankInfo: {
        bankName: bankId,
        accountNumber,
        accountName: process.env.SEPAY_ACCOUNT_NAME || 'PARKINGBUILDING',
      },
    };
  }

  /**
   * Initiate bank transfer payment for BOOKING
   */
  async initiateBookingBankTransfer(bookingId, userId) {
    const { generateTransferContent } = require('../../utils/helpers');
    const logger = require('../../utils/logger');

    const booking = await Booking.findById(bookingId);
    if (!booking) throw ApiError.notFound('Booking not found.');
    if (booking.paymentStatus === 'paid') {
      throw ApiError.badRequest('Booking is already paid.');
    }

    const amount = booking.estimatedFee;
    if (!amount || amount <= 0) {
      throw ApiError.badRequest('Invalid payment amount.');
    }

    const transferContent = generateTransferContent();

    const bankId = process.env.SEPAY_BANK_ID || 'MB';
    const accountNumber = process.env.SEPAY_ACCOUNT_NUMBER || '0342347435';
    const accountName = encodeURIComponent(process.env.SEPAY_ACCOUNT_NAME || 'PARKINGBUILDING');
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNumber}-compact.jpg?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${accountName}`;

    const payment = await Payment.create({
      booking: bookingId,
      user: userId,
      parkingLot: booking.parkingLot,
      amount,
      baseFee: amount,
      overtimeFee: 0,
      method: 'bank_transfer',
      status: 'pending',
      transferContent,
      bankTransferQrUrl: qrUrl,
      paymentType: 'booking',
    });

    return {
      payment,
      transferContent,
      amount,
      bankInfo: { bankName: bankId, accountNumber, accountName: process.env.SEPAY_ACCOUNT_NAME },
      qrUrl,
    };
  }

  /**
   * Handle SEPay webhook callback
   * SEPay sends POST when a bank transfer is received
   * We match the transfer content to find and confirm the pending payment
   */
  async handleSepayWebhook(webhookData, io) {
    const logger = require('../../utils/logger');

    logger.info(`[SEPay Webhook] Received: ${JSON.stringify(webhookData)}`);

    const {
      content,           // Transfer content (contains our PAR code)
      transferAmount,    // Amount transferred
      transferType,      // 'in' = money received
      transactionDate,
      id,
      gateway,
      accountNumber,
      referenceCode,
    } = webhookData;

    // Only process incoming transfers
    if (transferType !== 'in') {
      logger.info('[SEPay Webhook] Skipping: not an incoming transfer');
      return { matched: false, reason: 'Not an incoming transfer' };
    }

    if (!content) {
      logger.warn('[SEPay Webhook] Skipping: no content in transfer');
      return { matched: false, reason: 'No transfer content' };
    }

    // Extract PAR code from transfer content
    const parMatch = content.match(/PAR\d{4}[A-Z0-9]{6}/i);
    const transferContentCode = parMatch ? parMatch[0].toUpperCase() : null;
    let payment = null;

    if (transferContentCode) {
      logger.info(`[SEPay Webhook] Extracted PAR code: ${transferContentCode}`);
      // Find pending payment with matching transfer content
      payment = await Payment.findOne({
        transferContent: transferContentCode,
        status: 'pending',
        method: 'bank_transfer',
      }).populate('parkingSession').populate('booking');
    }

    // Fallback: If MoMo/ZaloPay overwrites the transfer content, match by EXACT AMOUNT
    if (!payment) {
      logger.warn(`[SEPay Webhook] PAR code not found. Falling back to amount matching: ${transferAmount} VND`);
      const pendingPayments = await Payment.find({
        amount: transferAmount,
        status: 'pending',
        method: 'bank_transfer',
      }).populate('parkingSession').populate('booking');

      if (pendingPayments.length === 1) {
        payment = pendingPayments[0];
        logger.info(`[SEPay Webhook] Successfully matched payment exactly by amount: ${payment.invoiceCode}`);
      } else if (pendingPayments.length > 1) {
        logger.warn(`[SEPay Webhook] Multiple pending payments found with amount ${transferAmount}. Cannot auto-confirm.`);
        return { matched: false, reason: 'Multiple pending payments with same amount. Manual confirmation required.' };
      }
    }

    if (!payment) {
      logger.warn(`[SEPay Webhook] No pending payment matched for webhook.`);
      return { matched: false, reason: 'No matching pending payment found (by content or amount)' };
    }

    // Verify amount (allow small tolerance for bank fees)
    if (transferAmount < payment.amount) {
      logger.warn(`[SEPay Webhook] Amount mismatch: expected ${payment.amount}, got ${transferAmount}`);
      return { matched: false, reason: `Insufficient amount: expected ${payment.amount}, received ${transferAmount}` };
    }

    // Confirm payment
    payment.status = 'completed';
    payment.transactionId = referenceCode || String(id);
    payment.paidAt = transactionDate ? new Date(transactionDate) : new Date();
    payment.gatewayResponse = webhookData;
    await payment.save();

    // Update parent document and emit socket events
    if (payment.paymentType === 'booking' && payment.booking) {
      const booking = await Booking.findById(payment.booking._id || payment.booking);
      if (booking) {
        booking.paymentStatus = 'paid';
        booking.payment = payment._id;
        await booking.save();
        logger.info(`[SEPay Webhook] Booking ${booking.bookingCode} marked as paid.`);
      }

      if (io) {
        io.emit('bookingPaymentConfirmed', {
          bookingId: booking ? booking._id : payment.booking,
          paymentId: payment._id,
          amount: payment.amount,
          invoiceCode: payment.invoiceCode,
          transferContent: transferContentCode,
        });
      }
    } else if (payment.parkingSession) {
      const session = await ParkingSession.findById(payment.parkingSession._id || payment.parkingSession);
      if (session) {
        session.paymentStatus = 'paid';
        session.payment = payment._id;
        await session.save();
        logger.info(`[SEPay Webhook] Session ${session.sessionCode} marked as paid.`);
      }

      if (io) {
        const lotId = (payment.parkingLot || '').toString();
        io.to(`parkingLot:${lotId}`).emit('paymentConfirmed', {
          paymentId: payment._id,
          invoiceCode: payment.invoiceCode,
          sessionId: session ? session._id : payment.parkingSession,
          amount: payment.amount,
          method: 'bank_transfer',
          transferContent: transferContentCode,
        });
        io.emit('paymentConfirmed', {
          paymentId: payment._id,
          invoiceCode: payment.invoiceCode,
          amount: payment.amount,
          transferContent: transferContentCode,
        });
      }
    }

    // Notify user
    if (payment.user) {
      await notificationService.create({
        recipient: payment.user,
        type: 'payment_success',
        title: 'Bank Transfer Confirmed',
        message: `Payment of ${payment.amount.toLocaleString('vi-VN')} VND confirmed. Invoice: ${payment.invoiceCode}`,
        data: { paymentId: payment._id, invoiceCode: payment.invoiceCode },
      });
    }

    logger.info(`[SEPay Webhook] ✅ Payment confirmed: ${payment.invoiceCode} | ${transferContentCode} | ${payment.amount} VND`);

    return {
      matched: true,
      paymentId: payment._id,
      invoiceCode: payment.invoiceCode,
      amount: payment.amount,
    };
  }

  /**
   * Check bank transfer payment status (polling from FE)
   */
  async checkBankTransferStatus(paymentId) {
    const payment = await Payment.findById(paymentId)
      .select('status transferContent amount invoiceCode paidAt')
      .lean();

    if (!payment) throw ApiError.notFound('Payment not found.');

    return {
      status: payment.status,
      isPaid: payment.status === 'completed',
      transferContent: payment.transferContent,
      amount: payment.amount,
      invoiceCode: payment.invoiceCode,
      paidAt: payment.paidAt,
    };
  }
}

module.exports = new PaymentService();
