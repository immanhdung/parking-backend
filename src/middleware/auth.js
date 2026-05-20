const jwt = require('jsonwebtoken');
const User = require('../modules/users/user.model');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Protect routes - verify JWT token
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw ApiError.unauthorized('Access token required. Please log in.');
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

  // Get user
  const user = await User.findById(decoded.id).select('+passwordChangedAt');

  if (!user) {
    throw ApiError.unauthorized('User no longer exists.');
  }

  if (user.status === 'blocked') {
    throw ApiError.forbidden('Your account has been blocked. Please contact support.');
  }

  if (user.status === 'inactive') {
    throw ApiError.forbidden('Your account is inactive.');
  }

  // Check if password was changed after token was issued
  if (user.wasPasswordChangedAfter(decoded.iat)) {
    throw ApiError.unauthorized('Password was recently changed. Please log in again.');
  }

  req.user = user;
  next();
});

/**
 * Restrict to specific roles
 * @param {...string} roles - Allowed roles
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden(
        `Role '${req.user.role}' is not authorized to access this resource.`
      );
    }
    next();
  };
};

/**
 * Optional auth - attaches user if token present, doesn't fail if not
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.id);
      if (user && user.status === 'active') {
        req.user = user;
      }
    } catch (err) {
      // Silently fail - optional auth
    }
  }

  next();
});

/**
 * Check if user belongs to a parking lot (manager/staff)
 */
const checkParkingLotAccess = asyncHandler(async (req, res, next) => {
  const parkingLotId = req.params.parkingLotId || req.body.parkingLot;

  // System admin has access to all
  if (req.user.role === 'system_admin') {
    return next();
  }

  // Manager/Staff must be assigned to this lot
  if (['parking_manager', 'parking_staff'].includes(req.user.role)) {
    if (
      !req.user.assignedParkingLot ||
      req.user.assignedParkingLot.toString() !== parkingLotId
    ) {
      throw ApiError.forbidden('You do not have access to this parking lot.');
    }
  }

  next();
});

module.exports = { protect, restrictTo, optionalAuth, checkParkingLotAccess };
