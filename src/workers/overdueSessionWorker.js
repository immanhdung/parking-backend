/**
 * Overdue Session Background Worker
 * ===================================
 * Runs every SCAN_INTERVAL_MS (default: 60 seconds) to scan all active
 * parking sessions that are linked to a booking and have exceeded their
 * scheduled end time.
 *
 * When a newly overdue session is detected:
 *  1. Emits `overdueAlert` to the parkingLot Socket.IO room so staff/admin
 *     receive a real-time push notification without needing to refresh.
 *  2. Sets `overtimeNotificationSent = true` on the session so the same
 *     session is NOT spammed on subsequent ticks.
 *
 * Usage: call `startOverdueWorker(io)` after the DB connection is ready.
 */

const ParkingSession = require('../modules/parkingSessions/parkingSession.model');
const { emitOverdueAlert } = require('../sockets/socket.server');
const logger = require('../utils/logger');

// How often the worker runs (ms). Default: every 60 seconds.
const SCAN_INTERVAL_MS = parseInt(process.env.OVERDUE_SCAN_INTERVAL_MS) || 60 * 1000;

let workerTimer = null;

/**
 * Core scan logic — finds sessions that are newly overdue and emits alerts.
 */
const scanOverdueSessions = async () => {
  try {
    const now = new Date();

    // Fetch active sessions linked to a booking where the alert has NOT been sent yet.
    // We pull only the minimum fields needed for the alert payload.
    const activeSessions = await ParkingSession.find({
      status: 'active',
      booking: { $ne: null },
      overtimeNotificationSent: false,
    })
      .populate({
        path: 'booking',
        select: 'endTime scheduledDate',
      })
      .populate('parkingLot', 'name')
      .populate('slot', 'slotCode')
      .populate('user', 'fullName email')
      .lean(); // lean() for performance — we only need to update by ID below

    if (!activeSessions.length) return;

    const overdueIds = [];
    const alertPayloads = []; // { parkingLotId, payload }

    for (const session of activeSessions) {
      const booking = session.booking;
      if (!booking?.endTime || !booking?.scheduledDate) continue;

      // Build the scheduled end datetime from booking's date + time strings
      const dateStr = new Date(booking.scheduledDate).toISOString().split('T')[0];
      const scheduledEnd = new Date(`${dateStr}T${booking.endTime}:00`);

      if (now > scheduledEnd) {
        const overdueMinutes = Math.floor((now - scheduledEnd) / (1000 * 60));

        overdueIds.push(session._id);

        alertPayloads.push({
          parkingLotId: session.parkingLot?._id?.toString() || session.parkingLot?.toString(),
          payload: {
            sessionId: session._id,
            sessionCode: session.sessionCode,
            licensePlate: session.vehicleInfo?.licensePlate,
            slotCode: session.slot?.slotCode,
            parkingLotName: session.parkingLot?.name,
            overdueMinutes,
            scheduledEnd,
            userName: session.user?.fullName || 'Guest',
            alertedAt: now,
          },
        });
      }
    }

    if (!overdueIds.length) return;

    // Bulk-mark as notified so we don't re-alert on the next tick
    await ParkingSession.updateMany(
      { _id: { $in: overdueIds } },
      { $set: { overtimeNotificationSent: true } }
    );

    // Fire Socket.IO alerts — one per session
    for (const { parkingLotId, payload } of alertPayloads) {
      if (!parkingLotId) continue;
      emitOverdueAlert(parkingLotId, payload);
      logger.info(
        `[OverdueWorker] 🔔 Alert emitted — Session: ${payload.sessionCode} | ` +
        `Plate: ${payload.licensePlate} | Overdue: ${payload.overdueMinutes} min | ` +
        `Lot: ${payload.parkingLotName}`
      );
    }

    logger.info(`[OverdueWorker] Scan complete. ${overdueIds.length} new overdue session(s) alerted.`);
  } catch (err) {
    // Log but don't crash the worker — it will retry on the next tick
    logger.error(`[OverdueWorker] Error during scan: ${err.message}`);
  }
};

/**
 * Start the background worker.
 * Should be called once after the database connection is established.
 */
const startOverdueWorker = () => {
  if (workerTimer) {
    logger.warn('[OverdueWorker] Worker already running — ignoring duplicate start.');
    return;
  }

  logger.info(`[OverdueWorker] 🚀 Started. Scanning every ${SCAN_INTERVAL_MS / 1000}s for overdue sessions.`);

  // Run immediately on startup, then on every interval
  scanOverdueSessions();
  workerTimer = setInterval(scanOverdueSessions, SCAN_INTERVAL_MS);
};

/**
 * Stop the background worker (useful for graceful shutdown).
 */
const stopOverdueWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info('[OverdueWorker] ⛔ Stopped.');
  }
};

module.exports = { startOverdueWorker, stopOverdueWorker };
