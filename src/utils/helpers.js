const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * Generate a random string token
 */
const generateToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Generate invoice code
 */
const generateInvoiceCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `INV-${timestamp}-${random}`;
};

/**
 * Generate booking reference code
 */
const generateBookingCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `BK-${timestamp}-${random}`;
};

/**
 * Generate QR code as data URL
 */
const generateQRCode = async (data) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(data), {
      errorCorrectionLevel: 'M',
      width: 256,
    });
    return qrDataUrl;
  } catch (error) {
    throw new Error('Failed to generate QR code');
  }
};

/**
 * Calculate parking fee using 4-hour blocks
 * - Daytime block (06:00–18:00): charged at dayBlockRate
 * - Nighttime block (18:00–06:00): charged at nightBlockRate (default = dayBlockRate × 1.5)
 * - Parking 1–4h in a block = 1 block charged
 * @param {Date} entryTime
 * @param {Date} exitTime
 * @param {Object} pricing - { dayBlockRate, nightBlockRate, dailyRate }
 */
const calculateParkingFee = (entryTime, exitTime, pricing) => {
  const durationMs = exitTime - entryTime;
  const durationHours = durationMs / (1000 * 60 * 60);
  const durationDays = Math.floor(durationHours / 24);

  if (durationMs <= 0) {
    return { fee: 0, durationMs: 0, durationHours: 0, durationDays: 0 };
  }

  let fee = 0;
  let currentStart = new Date(entryTime);

  while (currentStart < exitTime) {
    // Determine the actual end of this block for fee calculation
    const blockEnd = new Date(Math.min(exitTime.getTime(), currentStart.getTime() + 4 * 60 * 60 * 1000));
    // Subtract 1ms so an exact boundary (like 18:00:00) doesn't count as crossing into the next hour
    const effectiveEnd = new Date(blockEnd.getTime() - 1);

    const startHour = currentStart.getHours();
    const endHour = effectiveEnd.getHours();

    // 06:00 to 17:59 is daytime, 18:00 to 05:59 is nighttime
    const isStartNight = startHour >= 18 || startHour < 6;
    const isEndNight = endHour >= 18 || endHour < 6;
    
    // If any part of the block's actual duration is in the nighttime, charge as night block
    const isNightBlock = isStartNight || isEndNight;

    const baseBlockRate = pricing.dayBlockRate;
    // Nighttime rate from DB, fallback to dayBlockRate × 1.5
    const nightBlockRate = pricing.nightBlockRate || (baseBlockRate * 1.5);

    if (isNightBlock) {
      fee += nightBlockRate;
    } else {
      fee += baseBlockRate;
    }

    // Advance by 1 block (4 hours)
    currentStart = new Date(currentStart.getTime() + 4 * 60 * 60 * 1000);
  }

  return {
    fee: Math.round(fee),
    durationMs,
    durationHours: Math.round(durationHours * 100) / 100,
    durationDays,
  };
};

/**
 * Calculate overtime fee
 * When customer stays past their booking end time, charge by extra blocks (same as normal parking)
 * @param {Date} scheduledEnd - Booking scheduled end time
 * @param {Date} actualExit - Actual exit time
 * @param {Object} pricing - { dayBlockRate, nightBlockRate }
 */
const calculateOvertimeFee = (scheduledEnd, actualExit, pricing) => {
  if (actualExit <= scheduledEnd) return 0;

  // Reuse the same block-based logic for the overtime period
  const { fee } = calculateParkingFee(scheduledEnd, actualExit, pricing);
  return fee;
};

/**
 * Build MongoDB filter from query params
 * Supports: field=value, field[gte]=value, field[lte]=value, etc.
 */
const buildFilter = (queryParams, allowedFields) => {
  const filter = {};
  const operators = ['gt', 'gte', 'lt', 'lte', 'in', 'nin', 'ne'];

  Object.keys(queryParams).forEach(key => {
    if (!allowedFields.includes(key)) return;

    const value = queryParams[key];
    if (typeof value === 'object') {
      const mongoFilter = {};
      Object.keys(value).forEach(op => {
        if (operators.includes(op)) {
          mongoFilter[`$${op}`] = value[op];
        }
      });
      filter[key] = mongoFilter;
    } else {
      filter[key] = value;
    }
  });

  return filter;
};

/**
 * Format currency to VND
 */
const formatVND = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
};

/**
 * Get date range for reports
 */
const getDateRange = (period) => {
  const now = new Date();
  const start = new Date();

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start.setDate(now.getDate() - 30);
  }

  return { start, end: now };
};

/**
 * Determine if a time is peak hour (7-9 AM, 5-8 PM)
 */
const isPeakHour = (date) => {
  const hour = date.getHours();
  return (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
};

/**
 * Suggest optimal slot based on vehicle type and proximity
 * Simple AI logic: prefer slots by zone priority, then availability
 */
const suggestOptimalSlot = (availableSlots, vehicleType) => {
  if (!availableSlots || availableSlots.length === 0) return null;

  // Sort by floor (lower = more accessible), then by zone
  const sorted = [...availableSlots].sort((a, b) => {
    const floorDiff = (a.floor?.floorNumber || 0) - (b.floor?.floorNumber || 0);
    if (floorDiff !== 0) return floorDiff;
    return (a.zone?.name || '').localeCompare(b.zone?.name || '');
  });

  return sorted[0];
};

/**
 * Generate unique transfer content for bank payments
 * Format: PAR + DDMM + 6 random alphanumeric chars
 * Example: PAR1606A3B2C1
 */
const generateTransferContent = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PAR${dd}${mm}${random}`;
};

module.exports = {
  generateToken,
  generateInvoiceCode,
  generateBookingCode,
  generateQRCode,
  calculateParkingFee,
  calculateOvertimeFee,
  buildFilter,
  formatVND,
  getDateRange,
  isPeakHour,
  suggestOptimalSlot,
  generateTransferContent,
};
