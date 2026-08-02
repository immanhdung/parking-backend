/**
 * Overdue Session Background Worker
 * ===================================
 * Runs every SCAN_INTERVAL_MS (default: 60 seconds) to scan all active
 * parking sessions that are linked to a booking and have exceeded their
 * scheduled end time.
 *
 * When a newly overdue session is detected (and the current slot has an
 * upcoming booking conflict within the checkout buffer window):
 *  1. Finds a new available slot in the same parking lot / floor (same vehicleType).
 *  2. Moves the session to the new slot in the DB (session.slot updated).
 *  3. Frees the original slot (removes currentSession reference).
 *  4. Marks the new slot as occupied (sets currentSession).
 *  5. Sends an email to the user notifying them of the relocation.
 *  6. Emits `overdueAlert` via Socket.IO so staff see it on the dashboard.
 *  7. Sets `overtimeNotificationSent = true` to avoid re-processing.
 *
 * Slots are only reassigned when the original slot is needed by an upcoming
 * booking (within CHECKOUT_BUFFER_MS). If nobody needs the slot yet, only
 * the Socket.IO alert is fired (no physical move needed yet).
 *
 * Usage: call `startOverdueWorker(io)` after the DB connection is ready.
 */

const ParkingSession = require('../modules/parkingSessions/parkingSession.model');
const ParkingSlot    = require('../modules/parkingSlots/parkingSlot.model');
const Booking        = require('../modules/bookings/booking.model');
const { emitOverdueAlert } = require('../sockets/socket.server');
const { sendOverdueRelocationEmail } = require('../utils/emailService');
const logger = require('../utils/logger');

// How often the worker runs (ms). Default: every 60 seconds.
const SCAN_INTERVAL_MS  = parseInt(process.env.OVERDUE_SCAN_INTERVAL_MS)  || 60 * 1000;

// If the original slot has a booking starting within this many ms, we must move the car.
const CHECKOUT_BUFFER_MS = 15 * 60 * 1000; // 15 minutes

let workerTimer = null;
let _io = null; // Socket.IO instance injected via startOverdueWorker(io)

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given a booking's scheduledDate + HH:mm endTime, returns the absolute end Date.
 * Handles cross-midnight bookings.
 */
function bookingAbsoluteEnd(booking) {
  const dateStr = new Date(booking.scheduledDate).toISOString().split('T')[0];
  return new Date(`${dateStr}T${booking.endTime}:00`);
}

/**
 * Returns true if the slot has an upcoming booking that starts within
 * CHECKOUT_BUFFER_MS from now — meaning someone is waiting for this slot.
 */
async function slotNeededSoon(slotId) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + CHECKOUT_BUFFER_MS);

  const upcoming = await Booking.find({
    assignedSlot: slotId,
    status: { $in: ['pending', 'approved'] },
  }).lean();

  for (const b of upcoming) {
    const dateStr = new Date(b.scheduledDate).toISOString().split('T')[0];
    const [h, m] = b.startTime.split(':').map(Number);
    const start = new Date(`${dateStr}T${b.startTime}:00`);
    if (start >= now && start <= windowEnd) return true;
  }
  return false;
}

/**
 * Finds an available replacement slot in the same parking lot for the same vehicle type.
 * Prefers the same floor, falls back to any floor.
 * Returns null if none found.
 */
async function findReplacementSlot(parkingLotId, vehicleTypeId, preferredFloorId, excludeSlotId) {
  const baseFilter = {
    parkingLot: parkingLotId,
    vehicleType: vehicleTypeId,
    status: 'available',
    _id: { $ne: excludeSlotId },
    isDeleted: { $ne: true },
  };

  // Try same floor first
  if (preferredFloorId) {
    const sameFloor = await ParkingSlot.find({ ...baseFilter, floor: preferredFloorId })
      .populate('floor', 'name floorNumber')
      .populate('zone', 'name code')
      .limit(20);
    const free = await filterConflictFree(sameFloor);
    if (free.length) return free[Math.floor(Math.random() * free.length)];
  }

  // Fallback: any floor
  const any = await ParkingSlot.find(baseFilter)
    .populate('floor', 'name floorNumber')
    .populate('zone', 'name code')
    .limit(30);
  const free = await filterConflictFree(any);
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

/**
 * From a list of candidate slots, keeps only those with no active or imminent booking.
 */
async function filterConflictFree(slots) {
  const now = new Date();
  const results = [];
  for (const slot of slots) {
    // Skip if slot already has an active session
    if (slot.currentSession) continue;

    // Skip if slot has an upcoming booking within the next hour
    const soon = new Date(now.getTime() + 60 * 60 * 1000);
    const upcoming = await Booking.findOne({
      assignedSlot: slot._id,
      status: { $in: ['pending', 'approved'] },
    }).lean();
    if (upcoming) {
      const dateStr = new Date(upcoming.scheduledDate).toISOString().split('T')[0];
      const start = new Date(`${dateStr}T${upcoming.startTime}:00`);
      if (start <= soon) continue;
    }
    results.push(slot);
  }
  return results;
}

// ─── Core scan ─────────────────────────────────────────────────────────────────

const scanOverdueSessions = async () => {
  try {
    const now = new Date();

    // Fetch active sessions linked to a booking. We check all of them to see
    // if their slot is needed, regardless of whether we've sent the socket alert yet.
    const activeSessions = await ParkingSession.find({
      status: 'active',
      booking: { $ne: null },
    })
      .populate({ path: 'booking', select: 'endTime scheduledDate' })
      .populate('parkingLot', 'name')
      .populate({ path: 'slot', populate: [
        { path: 'floor', select: 'name floorNumber' },
        { path: 'zone', select: 'name code' },
      ]})
      .populate('vehicleType', '_id')
      .populate('user', 'fullName email');

    if (!activeSessions.length) return;

    const notifiedIds = [];

    for (const session of activeSessions) {
      const booking = session.booking;
      if (!booking?.endTime || !booking?.scheduledDate) continue;

      const scheduledEnd = bookingAbsoluteEnd(booking);
      if (now <= scheduledEnd) continue; // Not overdue yet

      const overdueMinutes = Math.floor((now - scheduledEnd) / (1000 * 60));
      const oldSlot = session.slot;
      const lotId   = session.parkingLot?._id || session.parkingLot;
      const lotName = session.parkingLot?.name || 'Parking Lot';

      // ── Emit Socket.IO alert to staff (ONLY ONCE) ──────────────────────────
      if (!session.overtimeNotificationSent) {
        const alertPayload = {
          sessionId:    session._id,
          sessionCode:  session.sessionCode,
          licensePlate: session.vehicleInfo?.licensePlate,
          slotCode:     oldSlot?.slotCode,
          parkingLotName: lotName,
          overdueMinutes,
          scheduledEnd,
          userName: session.user?.fullName || 'Guest',
          alertedAt: now,
        };
        if (lotId) emitOverdueAlert(lotId.toString(), alertPayload);
        notifiedIds.push(session._id);
      }

      // ── Check if slot is needed by an upcoming booking ─────────────────────
      const needed = await slotNeededSoon(oldSlot?._id);

      if (needed) {
        // Find replacement slot
        const replacement = await findReplacementSlot(
          lotId,
          session.vehicleType?._id || session.vehicleType,
          oldSlot?.floor?._id || oldSlot?.floor,
          oldSlot?._id
        );

        if (replacement) {
          // 1. Move session → new slot
          await ParkingSession.findByIdAndUpdate(session._id, {
            slot:  replacement._id,
            floor: replacement.floor?._id || replacement.floor,
            zone:  replacement.zone?._id  || replacement.zone,
            notes: `${session.notes ? session.notes + ' | ' : ''}Auto-relocated from ${oldSlot?.slotCode} (overdue ${overdueMinutes} min)`,
          });

          // 2. Free original slot
          await ParkingSlot.findByIdAndUpdate(oldSlot?._id, {
            $set: { currentSession: null },
          });

          // 3. Mark new slot as occupied
          await ParkingSlot.findByIdAndUpdate(replacement._id, {
            $set: {
              status: 'occupied',
              currentSession: session._id,
            },
          });

          logger.info(
            `[OverdueWorker] 🔄 Relocated session ${session.sessionCode}: ` +
            `${oldSlot?.slotCode} → ${replacement.slotCode} (overdue ${overdueMinutes} min)`
          );

          // 4. Send email
          if (session.user?.email) {
            const floorObj = replacement.floor;
            const zoneObj  = replacement.zone;
            await sendOverdueRelocationEmail({
              to:             session.user.email,
              userName:       session.user.fullName || 'Customer',
              oldSlotCode:    oldSlot?.slotCode || '—',
              newSlotCode:    replacement.slotCode,
              floorName:      typeof floorObj === 'object'
                                ? (floorObj.name || `Floor ${floorObj.floorNumber}`)
                                : '—',
              zoneName:       typeof zoneObj === 'object' ? (zoneObj.name || '') : '',
              lotName,
              overdueMinutes,
            });
          }
        } else {
          // No replacement found — still alert staff, no physical move
          logger.warn(
            `[OverdueWorker] ⚠️  No replacement slot found for overdue session ${session.sessionCode} ` +
            `(slot ${oldSlot?.slotCode}). Staff must handle manually.`
          );
        }
      } else {
        // Slot not yet needed — just alert staff, no move required
        logger.info(
          `[OverdueWorker] ⏱ Session ${session.sessionCode} is overdue ` +
          `(${overdueMinutes} min) but slot ${oldSlot?.slotCode} not yet needed.`
        );
      }
    }

    if (notifiedIds.length > 0) {
      // Mark newly alerted sessions as notified for the Socket alert
      await ParkingSession.updateMany(
        { _id: { $in: notifiedIds } },
        { $set: { overtimeNotificationSent: true } }
      );
    }

    logger.info(`[OverdueWorker] Scan complete. ${activeSessions.length} active session(s) checked.`);
  } catch (err) {
    logger.error(`[OverdueWorker] Error during scan: ${err.message}`);
  }
};

// ─── Start / Stop ──────────────────────────────────────────────────────────────

/**
 * Start the background worker.
 * @param {import('socket.io').Server} io  — Socket.IO server instance
 */
const startOverdueWorker = (io) => {
  if (workerTimer) {
    logger.warn('[OverdueWorker] Worker already running — ignoring duplicate start.');
    return;
  }
  _io = io;
  logger.info(`[OverdueWorker] 🚀 Started. Scanning every ${SCAN_INTERVAL_MS / 1000}s for overdue sessions.`);

  scanOverdueSessions();
  workerTimer = setInterval(scanOverdueSessions, SCAN_INTERVAL_MS);
};

const stopOverdueWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info('[OverdueWorker] ⛔ Stopped.');
  }
};

module.exports = { startOverdueWorker, stopOverdueWorker };
