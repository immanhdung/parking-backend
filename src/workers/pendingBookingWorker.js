/**
 * Pending Booking Background Worker
 * =====================================
 * Runs every SCAN_INTERVAL_MS (default: 60s) to scan all bookings with
 * status 'pending' or 'approved' that:
 *   - Have paymentStatus !== 'paid'
 *   - Were created more than PAYMENT_TIMEOUT_MS ago (default: 10 minutes)
 *
 * For each stale booking:
 *   1. Sets status → 'cancelled', cancelReason = 'Payment timeout'
 *   2. Releases the reserved parking slot back to 'available'
 *   3. Logs the cancellation
 */

const Booking = require('../modules/bookings/booking.model');
const ParkingSlot = require('../modules/parkingSlots/parkingSlot.model');
const logger = require('../utils/logger');

// How often the worker runs (ms). Default: every 60 seconds.
const SCAN_INTERVAL_MS = parseInt(process.env.PENDING_BOOKING_SCAN_INTERVAL_MS) || 60 * 1000;

// How long before an unpaid booking is considered expired (ms). Default: 10 minutes.
const PAYMENT_TIMEOUT_MS = parseInt(process.env.PENDING_BOOKING_TIMEOUT_MS) || 10 * 60 * 1000;

let workerTimer = null;

/**
 * Core scan logic — finds stale unpaid bookings and cancels them.
 */
const scanPendingBookings = async () => {
  try {
    const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MS);

    // Find all pending/approved bookings that are unpaid and created before cutoff
    const staleBookings = await Booking.find({
      status: { $in: ['pending', 'approved'] },
      paymentStatus: { $ne: 'paid' },
      createdAt: { $lt: cutoff },
    }).select('_id bookingCode assignedSlot parkingLot floor zone createdAt').lean();

    if (!staleBookings.length) return;

    const staleIds = staleBookings.map(b => b._id);

    // Bulk cancel the stale bookings
    await Booking.updateMany(
      { _id: { $in: staleIds } },
      {
        $set: {
          status: 'cancelled',
          cancelReason: 'Payment timeout (10 minutes)',
          cancelledAt: new Date(),
        },
      }
    );

    // Release reserved parking slots for each cancelled booking
    const slotIds = staleBookings
      .filter(b => b.assignedSlot)
      .map(b => b.assignedSlot);

    if (slotIds.length) {
      await ParkingSlot.updateMany(
        { _id: { $in: slotIds } },
        { $set: { status: 'available', currentBooking: null } }
      );
    }

    for (const booking of staleBookings) {
      logger.info(
        `[PendingBookingWorker] ❌ Cancelled unpaid booking — Code: ${booking.bookingCode} | Created: ${booking.createdAt}`
      );
    }

    logger.info(
      `[PendingBookingWorker] Scan complete. ${staleIds.length} booking(s) cancelled due to payment timeout.`
    );
  } catch (err) {
    logger.error(`[PendingBookingWorker] Error during scan: ${err.message}`);
  }
};

/**
 * Start the background worker.
 * Should be called once after the database connection is established.
 */
const startPendingBookingWorker = () => {
  if (workerTimer) {
    logger.warn('[PendingBookingWorker] Worker already running — ignoring duplicate start.');
    return;
  }

  logger.info(
    `[PendingBookingWorker] 🚀 Started. Scanning every ${SCAN_INTERVAL_MS / 1000}s for unpaid bookings (timeout: ${PAYMENT_TIMEOUT_MS / 1000}s).`
  );

  // Run immediately on startup, then on every interval
  scanPendingBookings();
  workerTimer = setInterval(scanPendingBookings, SCAN_INTERVAL_MS);
};

/**
 * Stop the background worker (graceful shutdown).
 */
const stopPendingBookingWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info('[PendingBookingWorker] ⛔ Stopped.');
  }
};

module.exports = { startPendingBookingWorker, stopPendingBookingWorker };
