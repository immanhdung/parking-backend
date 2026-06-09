const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10,15}$/, 'Please provide a valid phone number'],
    },
    role: {
      type: String,
      enum: ['system_admin', 'parking_manager', 'parking_staff', 'parking_user'],
      default: 'parking_user',
    },
    avatar: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked', 'pending'],
      default: 'pending',
    },
    // Assigned parking lot (for manager/staff)
    assignedParkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      default: null,
    },
    // Refresh tokens
    refreshTokens: [
      {
        token: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
        deviceInfo: String,
      },
    ],
    // Email verification
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    // Password reset
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    // Password change tracking
    passwordChangedAt: { type: Date, select: false },
    // Login tracking
    lastLogin: { type: Date },
    loginCount: { type: Number, default: 0 },
    // Soft delete
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ assignedParkingLot: 1 });
userSchema.index({ isDeleted: 1 });

// Virtual: display avatar URL with fallback
userSchema.virtual('avatarUrl').get(function () {
  return this.avatar?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(this.fullName)}&background=2563eb&color=fff`;
});

// Pre-save: hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
  next();
});

// Pre-find: exclude soft deleted
userSchema.pre(/^find/, function (next) {
  if (!this._conditions.includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// Instance method: compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Instance method: check if password was changed after JWT was issued
userSchema.methods.wasPasswordChangedAfter = function (jwtIssuedAt) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtIssuedAt < changedTimestamp;
  }
  return false;
};

// Instance method: generate email verification token
userSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return token;
};

// Instance method: generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  return token;
};

// Instance method: soft delete
userSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;
