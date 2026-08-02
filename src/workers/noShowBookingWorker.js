/**
 * No-Show Booking Background Worker
 * =====================================
 * Runs every SCAN_INTERVAL_MS (default: 60s) to scan all bookings with
 * status 'approved' that do not have a parkingSession (meaning the car hasn't checked in).
 *
 * If the current time has passed the booking's scheduled end time (`endTime`),
 * the booking is considered a "no-show".
 *
 * For each no-show booking:
 *   1. Sets status → 'no_show', cancelReason = 'No-show (did not check-in by end time)'
 *   2. Releases the reserved parking slot back to 'available'
 *   3. Logs the action
 */

const Booking = require('../modules/bookings/booking.model');
const ParkingSlot = require('../modules/parkingSlots/parkingSlot.model');
const logger = require('../utils/logger');

// How often the worker runs (ms). Default: every 60 seconds.
const SCAN_INTERVAL_MS = parseInt(process.env.NO_SHOW_SCAN_INTERVAL_MS) || 60 * 1000;

let workerTimer = null;

/**
 * Core scan logic — finds no-show bookings and marks them.
 */
const scanNoShowBookings = async () => {
  try {
    const now = new Date();

    // Find all approved bookings that do not have a linked parking session
    const potentialNoShows = await Booking.find({
      status: 'approved',
      $or: [{ parkingSession: { $exists: false } }, { parkingSession: null }],
    }).select('_id bookingCode assignedSlot scheduledDate estimatedDuration').lean();

    if (!potentialNoShows.length) return;

    const noShowIds = [];
    const slotIdsToRelease = [];

    for (const booking of potentialNoShows) {
      if (!booking.scheduledDate || !booking.estimatedDuration) continue;

      // scheduledDate is the exact entry Date object (including time).
      // We add estimatedDuration (in hours) to get the exact end Date object.
      const scheduledEnd = new Date(
        booking.scheduledDate.getTime() + booking.estimatedDuration * 60 * 60 * 1000
      );

      if (now > scheduledEnd) {
        noShowIds.push(booking._id);
        if (booking.assignedSlot) {
          slotIdsToRelease.push(booking.assignedSlot);
        }
      }
    }

    if (!noShowIds.length) return;

    // Bulk update Bookings to no_show
    await Booking.updateMany(
      { _id: { $in: noShowIds } },
      {
        $set: {
          status: 'no_show',
          cancelReason: 'No-show (did not check-in by end time)',
          cancelledAt: new Date(),
        },
      }
    );

    // Release reserved parking slots for each no-show booking
    if (slotIdsToRelease.length) {
      // Since slots are no longer set to 'reserved' on booking creation,
      // we just need to clear the currentBooking reference.
      await ParkingSlot.updateMany(
        { _id: { $in: slotIdsToRelease } },
        { $set: { currentBooking: null } }
      );
    }

    logger.info(
      `[NoShowBookingWorker] Scan complete. ${noShowIds.length} booking(s) marked as no_show.`
    );
  } catch (err) {
    logger.error(`[NoShowBookingWorker] Error during scan: ${err.message}`);
  }
};

/**
 * Start the background worker.
 * Should be called once after the database connection is established.
 */
const startNoShowBookingWorker = () => {
  if (workerTimer) {
    logger.warn('[NoShowBookingWorker] Worker already running — ignoring duplicate start.');
    return;
  }

  logger.info(
    `[NoShowBookingWorker] 🚀 Started. Scanning every ${SCAN_INTERVAL_MS / 1000}s for no-show bookings.`
  );

  // Run immediately on startup, then on every interval
  scanNoShowBookings();
  workerTimer = setInterval(scanNoShowBookings, SCAN_INTERVAL_MS);
};

/**
 * Stop the background worker (graceful shutdown).
 */
const stopNoShowBookingWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info('[NoShowBookingWorker] ⛔ Stopped.');
  }
};

module.exports = { startNoShowBookingWorker, stopNoShowBookingWorker };
