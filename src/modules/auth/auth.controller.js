const authService = require('./auth.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

class AuthController {
  /**
   * POST /auth/register
   */
  register = asyncHandler(async (req, res) => {
    const user = await authService.register(req.body);

    ApiResponse.created(res, 'Registration successful. Please check your email to verify your account.', {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
    });
  });

  /**
   * POST /auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const deviceInfo = req.headers['user-agent'] || '';

    const { user, accessToken, refreshToken } = await authService.login(email, password, deviceInfo);

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    ApiResponse.success(res, 'Login successful.', {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        avatar: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        assignedParkingLot: user.assignedParkingLot,
      },
      accessToken,
      refreshToken,
    });
  });

  /**
   * POST /auth/logout
   */
  logout = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (req.user && refreshToken) {
      await authService.logout(req.user._id, refreshToken);
    }

    res.clearCookie('refreshToken');
    ApiResponse.success(res, 'Logged out successfully.');
  });

  /**
   * POST /auth/refresh-token
   */
  refreshToken = asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    const { accessToken, refreshToken } = await authService.refreshToken(token);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    ApiResponse.success(res, 'Token refreshed successfully.', { accessToken, refreshToken });
  });

  /**
   * GET /auth/verify-email/:token
   */
  verifyEmail = asyncHandler(async (req, res) => {
    const user = await authService.verifyEmail(req.params.token);
    ApiResponse.success(res, 'Email verified successfully. You can now log in.', {
      id: user._id,
      email: user.email,
    });
  });

  /**
   * POST /auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.email);
    // Always return success (don't reveal if email exists)
    ApiResponse.success(res, 'If that email is registered, you will receive a password reset link.');
  });

  /**
   * POST /auth/reset-password/:token
   */
  resetPassword = asyncHandler(async (req, res) => {
    await authService.resetPassword(req.params.token, req.body.password);
    res.clearCookie('refreshToken');
    ApiResponse.success(res, 'Password reset successfully. Please log in with your new password.');
  });

  /**
   * POST /auth/change-password
   */
  changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user._id, currentPassword, newPassword);
    res.clearCookie('refreshToken');
    ApiResponse.success(res, 'Password changed successfully. Please log in again.');
  });

  /**
   * POST /auth/resend-verification
   */
  resendVerification = asyncHandler(async (req, res) => {
    await authService.resendVerification(req.body.email);
    ApiResponse.success(res, 'Verification email sent. Please check your inbox.');
  });

  /**
   * GET /auth/me
   */
  getMe = asyncHandler(async (req, res) => {
    const user = req.user;
    ApiResponse.success(res, 'User profile retrieved.', {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatarUrl,
      status: user.status,
      isEmailVerified: user.isEmailVerified,
      assignedParkingLot: user.assignedParkingLot,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    });
  });
}

module.exports = new AuthController();
