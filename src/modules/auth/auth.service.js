const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../users/user.model');
const ApiError = require('../../utils/ApiError');
const { sendVerificationEmail, sendResetPasswordEmail } = require('../../utils/email');
const logger = require('../../utils/logger');

class AuthService {
  /**
   * Generate JWT access token
   */
  generateAccessToken(userId, role) {
    return jwt.sign({ id: userId, role }, process.env.JWT_ACCESS_SECRET, {
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
    });
  }

  /**
   * Generate JWT refresh token
   */
  generateRefreshToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
    });
  }

  /**
   * Register new user
   */
  async register(data) {
    const { fullName, email, password, phone } = data;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw ApiError.conflict('Email is already registered.');
    }

    const user = await User.create({
      fullName,
      email,
      password,
      phone,
      role: 'parking_user',
      status: 'pending',
    });

    // Generate email verification token
    const verifyToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Send verification email
    try {
      await sendVerificationEmail(user, verifyToken);
    } catch (emailErr) {
      logger.error('Failed to send verification email:', emailErr.message);
      // Don't fail registration if email fails
    }

    return user;
  }

  /**
   * Login user
   */
  async login(email, password, deviceInfo = '') {
    // Get user with password field
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    if (user.status === 'blocked') {
      throw ApiError.forbidden('Your account has been blocked. Please contact support.');
    }

    if (user.status === 'pending') {
      throw ApiError.forbidden('Please verify your email before logging in.');
    }

    if (user.status === 'inactive') {
      throw ApiError.forbidden('Your account is inactive. Please contact support.');
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user._id, user.role);
    const refreshToken = this.generateRefreshToken(user._id);

    // Save refresh token
    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    user.refreshTokens.push({
      token: refreshToken,
      expiresAt: refreshExpiry,
      deviceInfo,
    });

    // Keep max 5 refresh tokens per user
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save({ validateBeforeSave: false });

    return { user, accessToken, refreshToken };
  }

  /**
   * Refresh access token
   */
  async refreshToken(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      throw ApiError.unauthorized('Invalid or expired refresh token.');
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      throw ApiError.unauthorized('User not found.');
    }

    // Check if refresh token exists in user's tokens
    const storedToken = user.refreshTokens.find(
      t => t.token === token && t.expiresAt > new Date()
    );

    if (!storedToken) {
      throw ApiError.unauthorized('Refresh token is not valid or has expired.');
    }

    // Remove old refresh token and generate new pair (token rotation)
    user.refreshTokens = user.refreshTokens.filter(t => t.token !== token);

    const newAccessToken = this.generateAccessToken(user._id, user.role);
    const newRefreshToken = this.generateRefreshToken(user._id);

    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    user.refreshTokens.push({
      token: newRefreshToken,
      expiresAt: refreshExpiry,
      deviceInfo: storedToken.deviceInfo,
    });

    await user.save({ validateBeforeSave: false });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout - invalidate refresh token
   */
  async logout(userId, refreshToken) {
    const user = await User.findById(userId);
    if (!user) return;

    user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
    await user.save({ validateBeforeSave: false });
  }

  /**
   * Verify email
   */
  async verifyEmail(token) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) {
      throw ApiError.badRequest('Invalid or expired email verification token.');
    }

    user.isEmailVerified = true;
    user.status = 'active';
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return user;
  }

  /**
   * Forgot password
   */
  async forgotPassword(email) {
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists
      return;
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendResetPasswordEmail(user, resetToken);
    } catch (err) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      throw ApiError.internal('Failed to send reset email. Please try again.');
    }
  }

  /**
   * Reset password
   */
  async resetPassword(token, newPassword) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      throw ApiError.badRequest('Invalid or expired password reset token.');
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    // Invalidate all refresh tokens
    user.refreshTokens = [];
    await user.save();

    return user;
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');

    if (!(await user.comparePassword(currentPassword))) {
      throw ApiError.badRequest('Current password is incorrect.');
    }

    if (currentPassword === newPassword) {
      throw ApiError.badRequest('New password must be different from current password.');
    }

    user.password = newPassword;
    user.refreshTokens = []; // Logout all devices
    await user.save();

    return user;
  }

  /**
   * Resend email verification
   */
  async resendVerification(email) {
    const user = await User.findOne({ email }).select(
      '+emailVerificationToken +emailVerificationExpires'
    );

    if (!user) {
      throw ApiError.notFound('User not found.');
    }

    if (user.isEmailVerified) {
      throw ApiError.badRequest('Email is already verified.');
    }

    const verifyToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    await sendVerificationEmail(user, verifyToken);
  }
}

module.exports = new AuthService();
