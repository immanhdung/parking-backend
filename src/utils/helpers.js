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
 * Calculate parking fee
 * @param {Date} entryTime
 * @param {Date} exitTime
 * @param {Object} vehicleType - { hourlyRate, dailyRate }
 */
const calculateParkingFee = (entryTime, exitTime, vehicleType) => {
  const durationMs = exitTime - entryTime;
  const durationHours = durationMs / (1000 * 60 * 60);
  const durationDays = Math.floor(durationHours / 24);
  const remainingHours = durationHours % 24;

  let fee = 0;
  if (durationDays > 0) {
    fee += durationDays * vehicleType.dailyRate;
  }
  if (remainingHours > 0) {
    // Round up to next hour
    fee += Math.ceil(remainingHours) * vehicleType.hourlyRate;
  }

  // Minimum 1 hour
  if (fee === 0 && durationMs > 0) {
    fee = vehicleType.hourlyRate;
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
 * @param {Date} scheduledEnd - Booking scheduled end time
 * @param {Date} actualExit - Actual exit time
 * @param {Number} hourlyRate
 */
const calculateOvertimeFee = (scheduledEnd, actualExit, hourlyRate) => {
  if (actualExit <= scheduledEnd) return 0;
  const overtimeMs = actualExit - scheduledEnd;
  const overtimeHours = Math.ceil(overtimeMs / (1000 * 60 * 60));
  return overtimeHours * hourlyRate * 1.5; // 1.5x rate for overtime
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
