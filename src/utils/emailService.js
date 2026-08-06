/**
 * Email Service — Gmail API
 * ====================================
 * Sends transactional emails using Gmail API.
 *
 * Required .env variables:
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN
 *   GMAIL_USER      — sender email address
 *   GMAIL_FROM_NAME — display name (default: "ParkingBuilding")
 */

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

const FROM = `"${process.env.GMAIL_FROM_NAME || 'ParkingBuilding'}" <${process.env.GMAIL_USER}>`;

const makeBody = (to, from, subject, html) => {
  const str = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    html
  ].join('\r\n');

  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * Send a generic email.
 * @param {string} to         - Recipient email
 * @param {string} subject    - Email subject
 * @param {string} html       - HTML body
 */
async function sendMail(to, subject, html) {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) {
    logger.warn('[EmailService] Gmail API credentials not configured — skipping email to ' + to);
    return;
  }
  try {
    const gmail = createGmailClient();
    const rawMessage = makeBody(to, FROM, subject, html);
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
      },
    });
    logger.info(`[EmailService] ✉️  Sent to ${to}: "${subject}" (msgId: ${res.data.id})`);
  } catch (err) {
    logger.error(`[EmailService] Failed to send email to ${to}: ${err.message}`);
  }
}

/**
 * Overdue slot relocation notification.
 * Sent to the user whose session was administratively moved to a new slot.
 */
async function sendOverdueRelocationEmail({ to, userName, licensePlate, oldSlotCode, newSlotCode, floorName, zoneName, lotName }) {
  const subject = `⚠️ [ParkingBuilding] Your vehicle has been relocated — ${oldSlotCode} → ${newSlotCode}`;
  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: white; border-radius: 16px;
                 box-shadow: 0 4px 20px rgba(0,0,0,0.07); overflow: hidden; }
    .header { background: linear-gradient(135deg, #ef4444, #dc2626); padding: 28px 32px; }
    .header h1 { color: white; margin: 0; font-size: 20px; }
    .header p  { color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px; }
    .body { padding: 28px 32px; }
    .alert-box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px;
                 padding: 16px; margin-bottom: 20px; }
    .alert-box p { margin: 0; font-size: 14px; color: #991b1b; }
    .slot-row { display: flex; align-items: center; gap: 12px; margin: 20px 0; font-size: 18px; font-weight: 700; }
    .slot-badge { background: #f1f5f9; border: 1.5px solid #cbd5e1; border-radius: 8px;
                  padding: 8px 16px; font-family: monospace; color: #334155; }
    .slot-badge.new { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
    .arrow { font-size: 22px; color: #94a3b8; }
    .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .info-table td { padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .info-table td:first-child { color: #64748b; width: 140px; }
    .info-table td:last-child { font-weight: 600; color: #0f172a; }
    .action-note { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px;
                   padding: 14px; font-size: 13px; color: #9a3412; margin-top: 20px; }
    .footer { background: #f8fafc; padding: 16px 32px; text-align: center;
              font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚗 Vehicle Relocation Notice</h1>
      <p>Your vehicle has exceeded the allotted parking time</p>
    </div>
    <div class="body">
      <p>Hi <strong>${userName}</strong>,</p>

      <div class="alert-box">
        <p>⏰ Your vehicle with license plate <strong>${licensePlate}</strong> has exceeded the scheduled end time.
        To free the reserved spot for the next customer, your session has been <strong>administratively moved</strong>.</p>
      </div>

      <div class="slot-row">
        <span class="slot-badge">${oldSlotCode}</span>
        <span class="arrow">→</span>
        <span class="slot-badge new">${newSlotCode}</span>
      </div>

      <table class="info-table">
        <tr><td>Parking Lot</td><td>${lotName}</td></tr>
        <tr><td>Floor / Zone</td><td>${floorName}${zoneName ? ' / ' + zoneName : ''}</td></tr>
        <tr><td>New Slot</td><td>${newSlotCode}</td></tr>
        <tr><td>License Plate</td><td>${licensePlate}</td></tr>
      </table>

      <div class="action-note">
        🔧 <strong>Action required:</strong> Please proceed to slot <strong>${newSlotCode}</strong> or speak with
        a parking attendant immediately. Overtime fees are continuing to accumulate.
      </div>
    </div>
    <div class="footer">
      ParkingBuilding System &nbsp;·&nbsp; This is an automated message, please do not reply.
    </div>
  </div>
</body>
</html>
  `;
  return sendMail(to, subject, html);
}

module.exports = { sendMail, sendOverdueRelocationEmail };
