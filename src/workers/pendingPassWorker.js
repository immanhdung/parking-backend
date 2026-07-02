/**
 * Pending Monthly Pass Background Worker
 * ========================================
 * Runs every SCAN_INTERVAL_MS (default: 60 seconds) to scan all monthly
 * passes with status 'pending' that were created more than 5 minutes ago
 * and have NOT been paid yet.
 *
 * When a stale pending pass is found:
 *  1. Sets status → 'cancelled', paymentStatus stays 'pending'
 *  2. Sets cancelReason = 'Payment timeout (5 minutes)'
 *  3. Logs the cancellation
 *
 * This frees up the license plate so the user can re-purchase a new pass.
 */

const MonthlyPass = require('../modules/monthlyPasses/monthlyPass.model');
const logger = require('../utils/logger');

// How often the worker runs (ms). Default: every 60 seconds.
const SCAN_INTERVAL_MS = parseInt(process.env.PENDING_PASS_SCAN_INTERVAL_MS) || 60 * 1000;

// How long before a pending pass is considered expired (ms). Default: 5 minutes.
const PAYMENT_TIMEOUT_MS = parseInt(process.env.PENDING_PASS_TIMEOUT_MS) || 5 * 60 * 1000;

let workerTimer = null;

/**
 * Core scan logic — finds stale pending passes and cancels them.
 */
const scanPendingPasses = async () => {
  try {
    const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MS);

    // Find all pending passes created before the cutoff time
    const stalePasses = await MonthlyPass.find({
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: { $lt: cutoff },
    }).select('_id passCode licensePlate createdAt').lean();

    if (!stalePasses.length) return;

    const staleIds = stalePasses.map(p => p._id);

    // Bulk cancel
    await MonthlyPass.updateMany(
      { _id: { $in: staleIds } },
      {
        $set: {
          status: 'cancelled',
          cancelReason: 'Payment timeout (5 minutes)',
          cancelledAt: new Date(),
        },
      }
    );

    for (const pass of stalePasses) {
      logger.info(
        `[PendingPassWorker] ❌ Cancelled unpaid pass — Code: ${pass.passCode} | Plate: ${pass.licensePlate} | Created: ${pass.createdAt}`
      );
    }

    logger.info(`[PendingPassWorker] Scan complete. ${staleIds.length} pending pass(es) cancelled due to payment timeout.`);
  } catch (err) {
    logger.error(`[PendingPassWorker] Error during scan: ${err.message}`);
  }
};

/**
 * Start the background worker.
 * Should be called once after the database connection is established.
 */
const startPendingPassWorker = () => {
  if (workerTimer) {
    logger.warn('[PendingPassWorker] Worker already running — ignoring duplicate start.');
    return;
  }

  logger.info(`[PendingPassWorker] 🚀 Started. Scanning every ${SCAN_INTERVAL_MS / 1000}s for unpaid passes (timeout: ${PAYMENT_TIMEOUT_MS / 1000}s).`);

  // Run immediately on startup, then on every interval
  scanPendingPasses();
  workerTimer = setInterval(scanPendingPasses, SCAN_INTERVAL_MS);
};

/**
 * Stop the background worker (useful for graceful shutdown).
 */
const stopPendingPassWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info('[PendingPassWorker] ⛔ Stopped.');
  }
};

module.exports = { startPendingPassWorker, stopPendingPassWorker };
