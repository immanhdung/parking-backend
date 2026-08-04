/**
 * dateUtils.js — Timezone-safe date helpers
 * ==========================================
 *
 * PROBLEM:
 *   `new Date(scheduledDate).setHours(h, m, 0, 0)` uses the SERVER's LOCAL timezone.
 *   Locally (UTC+7) this works fine. On Vercel/Render (UTC) the result is shifted
 *   by 7 hours, causing slot-release, conflict-check, and overdue logic to fire at
 *   the wrong wall-clock time.
 *
 * SOLUTION:
 *   We store scheduledDate as a Date in MongoDB. It may be:
 *   1. UTC midnight of the ICT date (when parsed from "YYYY-MM-DD" string by Mongoose)
 *      e.g. "2026-08-05" → 2026-08-05T00:00:00.000Z = 07:00 ICT Aug 5
 *   2. An absolute UTC timestamp matching the entry time (when saved as new Date(entryTime))
 *      e.g. 2026-08-04T17:40:00.000Z = 00:40 ICT Aug 5
 *
 *   In both cases, startTime/endTime strings like "00:40" represent local ICT times.
 *   The correct approach: extract the ICT calendar date (Y/M/D) from scheduledDate,
 *   then build the absolute UTC timestamp by treating H:M as ICT local time.
 *
 *   TZ_OFFSET_MS = 7 * 60 * 60 * 1000  (ICT = UTC+7)
 */

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // ICT = UTC+7

/**
 * Extract the ICT calendar date components (year, month, day in ICT) from any Date.
 * Works regardless of server timezone.
 * @param {Date|string} date
 * @returns {{ year: number, month: number, day: number }}
 */
function toICTDate(date) {
  const d = new Date(date);
  // Shift to ICT by adding offset, then read UTC components
  const ictMs = d.getTime() + TZ_OFFSET_MS;
  const ict = new Date(ictMs);
  return {
    year:  ict.getUTCFullYear(),
    month: ict.getUTCMonth(),
    day:   ict.getUTCDate(),
  };
}

/**
 * Convert a stored scheduledDate + "HH:MM" time string (ICT) to an absolute UTC Date.
 * Works correctly regardless of the server's system timezone.
 *
 * @param {Date|string} scheduledDate  - The date stored in DB (any form)
 * @param {string}      timeStr        - Local ICT time string, e.g. "23:45" or "01:30"
 * @returns {Date}
 */
function toAbsoluteDate(scheduledDate, timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const { year, month, day } = toICTDate(scheduledDate);
  // Build UTC midnight of that ICT day, then add ICT hours/minutes, then subtract offset
  const utcMidnightOfICTDay = Date.UTC(year, month, day, 0, 0, 0, 0);
  return new Date(utcMidnightOfICTDay + h * 3600000 + m * 60000 - TZ_OFFSET_MS);
}

/**
 * Same as toAbsoluteDate but handles cross-midnight: if endH < startH it adds 24h.
 *
 * @param {Date|string} scheduledDate
 * @param {string}      startTimeStr  - e.g. "22:00"
 * @param {string}      endTimeStr    - e.g. "01:00" (cross-midnight)
 * @returns {{ start: Date, end: Date }}
 */
function toAbsoluteDateRange(scheduledDate, startTimeStr, endTimeStr) {
  const [sH, sM] = startTimeStr.split(':').map(Number);
  let [eH, eM] = endTimeStr.split(':').map(Number);
  if (eH < sH || (eH === sH && eM <= sM)) eH += 24; // cross-midnight

  const { year, month, day } = toICTDate(scheduledDate);
  const utcMidnightOfICTDay = Date.UTC(year, month, day, 0, 0, 0, 0);

  const start = new Date(utcMidnightOfICTDay + sH * 3600000 + sM * 60000 - TZ_OFFSET_MS);
  const durationMs = ((eH * 60 + eM) - (sH * 60 + sM)) * 60000;
  const end = new Date(start.getTime() + durationMs);

  return { start, end };
}

module.exports = { toAbsoluteDate, toAbsoluteDateRange, TZ_OFFSET_MS };
