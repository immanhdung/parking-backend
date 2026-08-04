const { google } = require('googleapis');
const logger = require('./logger');

const createGmailClient = () => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oAuth2Client });
};

const makeBody = (to, from, subject, html, text) => {
  const str = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    html || text
  ].join('\r\n');

  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const gmail = createGmailClient();
    const from = process.env.GMAIL_FROM || process.env.GMAIL_USER || 'noreply@parking.com';
    const rawMessage = makeBody(to, from, subject, html, text);

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
      },
    });
    logger.info(`Email sent: ${res.data.id}`);
    return res.data;
  } catch (error) {
    logger.error(`Email send error: ${error.message}`);
    throw error;
  }
};

const sendVerificationEmail = async (user, token) => {
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your email - Parking System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to Parking System!</h2>
        <p>Hi ${user.fullName},</p>
        <p>Please verify your email address by clicking the button below:</p>
        <a href="${verifyUrl}" 
           style="display: inline-block; padding: 12px 24px; background-color: #2563eb; 
                  color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Verify Email
        </a>
        <p>Or copy this link: <a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
        <hr/>
        <p style="color: #6b7280; font-size: 12px;">
          If you didn't create an account, please ignore this email.
        </p>
      </div>
    `,
  });
};

const sendResetPasswordEmail = async (user, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset Password - Parking System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Reset Your Password</h2>
        <p>Hi ${user.fullName},</p>
        <p>You requested a password reset. Click the button below:</p>
        <a href="${resetUrl}" 
           style="display: inline-block; padding: 12px 24px; background-color: #dc2626; 
                  color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Reset Password
        </a>
        <p>Or copy this link: <a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour.</p>
        <hr/>
        <p style="color: #6b7280; font-size: 12px;">
          If you didn't request a password reset, please ignore this email.
        </p>
      </div>
    `,
  });
};

const sendBookingConfirmation = async (user, booking) => {
  await sendEmail({
    to: user.email,
    subject: `Booking Confirmed #${booking._id} - Parking System`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Booking Confirmed!</h2>
        <p>Hi ${user.fullName},</p>
        <p>Your parking booking has been confirmed.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Booking ID:</strong> ${booking._id}</p>
          <p><strong>Parking Lot:</strong> ${booking.parkingLot?.name}</p>
          <p><strong>Date:</strong> ${new Date(booking.scheduledDate).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
          <p><strong>Vehicle Type:</strong> ${booking.vehicleType?.name}</p>
        </div>
        <p>Please arrive on time. Your QR code is attached.</p>
      </div>
    `,
  });
};

const sendShiftAssignmentEmail = async (user, shiftData) => {
  const loginUrl = `${process.env.CLIENT_URL}/login`;
  await sendEmail({
    to: user.email,
    subject: `New Shift Assigned - Parking System`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Shift Assigned!</h2>
        <p>Hi ${user.fullName},</p>
        <p>A manager has assigned a new work shift to you.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Date:</strong> ${shiftData.date}</p>
          <p><strong>Shift:</strong> ${shiftData.shiftType.toUpperCase()}</p>
        </div>
        <p>Please log in to your account and check your Work Schedule.</p>
        <a href="${loginUrl}" 
           style="display: inline-block; padding: 12px 24px; background-color: #2563eb; 
                  color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Login to System
        </a>
        <p>If you cannot make it to this shift, please request a leave through the system as soon as possible.</p>
      </div>
    `,
  });
};

const sendBuildingAssignmentEmail = async (user, parkingLot) => {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  await sendEmail({
    to: user.email,
    subject: 'You have been assigned to a new Parking Building',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Building Assignment Notification</h2>
        <p>Hello <strong>${user.fullName}</strong>,</p>
        <p>You have been assigned to a new parking building: <strong>${parkingLot.name}</strong> (${parkingLot.code}).</p>
        <p>Please log in to your account and check your Work Schedule. If your schedule is not suitable, you can request a change or leave through the system.</p>
        <a href="${loginUrl}" 
           style="display: inline-block; padding: 12px 24px; background-color: #2563eb; 
                  color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Login to System
        </a>
      </div>
    `,
  });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendBookingConfirmation,
  sendShiftAssignmentEmail,
  sendBuildingAssignmentEmail,
};
