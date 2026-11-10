import nodemailer from 'nodemailer';

// In-memory test hook holding metadata of the last dispatched email (used by integration tests without API token leakage)
let lastDispatchedEmail = null;

export const getLastDispatchedEmailForTesting = () => lastDispatchedEmail;
export const resetLastDispatchedEmailForTesting = () => {
  lastDispatchedEmail = null;
};

/**
 * Creates and configures Nodemailer transporter based on environment variables.
 * Defaults to Gmail SMTP (smtp.gmail.com:587 with STARTTLS).
 */
export const createTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Validate that user and pass are set and are not placeholder strings
  const isConfigured = Boolean(
    user &&
    pass &&
    !user.includes('yourgmail@gmail.com') &&
    !user.includes('your_') &&
    !pass.includes('your_google_app_password') &&
    !pass.includes('your_')
  );

  if (isConfigured) {
    const isSecure = port === 465;
    return nodemailer.createTransport({
      host,
      port,
      secure: isSecure, // false for 587 (uses STARTTLS)
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: true,
      },
    });
  }
  return null;
};

/**
 * Safely parse SMTP error and provide diagnostic assistance without leaking credentials
 */
export const sanitizeSmtpError = (error) => {
  const rawMsg = error?.message || 'SMTP operation failed';
  const code = error?.code || 'UNKNOWN';

  let diagnosis = 'Verify your SMTP credentials in environment variables.';
  if (rawMsg.includes('535') || rawMsg.includes('Username and Password not accepted') || code === 'EAUTH') {
    diagnosis = 'Gmail authentication failed: A 16-character Google App Password is required. Generate one at https://myaccount.google.com/apppasswords with 2-Step Verification enabled.';
  } else if (code === 'ETIMEDOUT' || code === 'ESOCKET') {
    diagnosis = 'Network connection timed out while contacting smtp.gmail.com:587. Check firewall or internet connectivity.';
  } else if (code === 'ECONNREFUSED') {
    diagnosis = 'Connection refused by the mail server.';
  }

  return {
    code,
    message: rawMsg,
    diagnosis,
  };
};

/**
 * Verifies live SMTP credentials connection without sending an email
 */
export const verifySmtpConnection = async () => {
  const transporter = createTransporter();
  if (!transporter) {
    return {
      connected: false,
      reason: 'Gmail SMTP credentials missing or placeholder in environment variables.',
    };
  }

  try {
    await transporter.verify();
    return {
      connected: true,
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
    };
  } catch (error) {
    const diag = sanitizeSmtpError(error);
    console.error('SMTP Connection Diagnostic:', diag.diagnosis);
    return {
      connected: false,
      code: diag.code,
      reason: diag.message,
      diagnosis: diag.diagnosis,
    };
  }
};

/**
 * Sends an email or gracefully falls back to console logging with full action link
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.EMAIL_FROM || `CampusMart Security <${process.env.SMTP_USER || 'no-reply@campusmarket.ng'}>`;
  const transporter = createTransporter();

  if (!transporter) {
    console.log('\n────────────────────────────────────────────────────────────');
    console.log('✉️  EMAIL DELIVERY NOTICE (Gmail SMTP not configured in environment)');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Preview: ${text ? text.substring(0, 150) : ''}...`);
    console.log('────────────────────────────────────────────────────────────\n');
    return {
      delivered: false,
      simulated: true,
      message: 'Gmail SMTP credentials not configured; logged for local debugging.',
    };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true, messageId: info.messageId };
  } catch (error) {
    const diag = sanitizeSmtpError(error);
    console.error(`Failed to send email to ${to}: ${diag.message}`);
    console.error(`Diagnosis: ${diag.diagnosis}`);
    return { delivered: false, error: diag.message, diagnosis: diag.diagnosis };
  }
};

/**
 * Send email verification link to student
 */
export const sendVerificationEmail = async (user, rawToken) => {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const verificationUrl = `${clientUrl}/verify-email?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

  const subject = 'CampusMart — Verify Your Student Email Address';
  const text = `Hello ${user.firstName},\n\nPlease verify your student email address for CampusMart by clicking the link below:\n${verificationUrl}\n\nThis verification link expires in 24 hours.\n\nIf you did not create an account on CampusMart, please ignore this email.\n\nBest regards,\nThe CampusMart Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="margin-bottom: 24px; text-align: center;">
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0;">Campus<span style="color: #0284c7;">Mart</span></h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Nigeria's Verified Student Marketplace</p>
      </div>
      <div style="padding: 20px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
        <h2 style="color: #1e293b; font-size: 18px; margin-top: 0;">Verify your email address</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">Hello ${user.firstName},</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          Thank you for signing up for CampusMart! To complete your student profile and ensure safe trading with verified peers, please confirm ownership of your email address.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationUrl}" style="background-color: #0284c7; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          Or copy and paste this link into your browser:<br/>
          <a href="${verificationUrl}" style="color: #0284c7; word-break: break-all;">${verificationUrl}</a>
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
          Note: This verification link expires in 24 hours. If you did not create this account, no action is required.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        &copy; ${new Date().getFullYear()} CampusMart. Designed for UNILAG, YABATECH, LASU & Nigerian Universities.
      </div>
    </div>
  `;

  // Record for test runner inspection (avoids exposing tokens in public API HTTP responses)
  lastDispatchedEmail = {
    type: 'verification',
    to: user.email,
    rawToken,
    url: verificationUrl,
    subject,
    text,
    html,
    timestamp: Date.now(),
  };

  return await sendEmail({ to: user.email, subject, html, text });
};

/**
 * Send password reset link to user
 */
export const sendPasswordResetEmail = async (user, rawToken) => {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const resetUrl = `${clientUrl}/reset-password/${rawToken}`;

  const subject = 'CampusMart — Password Reset Request';
  const text = `Hello ${user.firstName},\n\nYou requested to reset your CampusMart password. Please click the link below to set a new password:\n${resetUrl}\n\nThis reset link expires in 1 hour.\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n\nBest regards,\nThe CampusMart Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="margin-bottom: 24px; text-align: center;">
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0;">Campus<span style="color: #0284c7;">Mart</span></h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Student Account Security</p>
      </div>
      <div style="padding: 20px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
        <h2 style="color: #1e293b; font-size: 18px; margin-top: 0;">Reset Your Password</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">Hello ${user.firstName},</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          We received a request to reset your password. Click the button below to choose a new, secure password.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="background-color: #0284c7; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          Or copy and paste this link into your browser:<br/>
          <a href="${resetUrl}" style="color: #0284c7; word-break: break-all;">${resetUrl}</a>
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
          Note: This reset link expires in 1 hour. If you did not request a password reset, you can safely ignore this message.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        &copy; ${new Date().getFullYear()} CampusMart Account Security.
      </div>
    </div>
  `;

  // Record for test runner inspection (avoids exposing tokens in public API HTTP responses)
  lastDispatchedEmail = {
    type: 'password_reset',
    to: user.email,
    rawToken,
    url: resetUrl,
    subject,
    text,
    html,
    timestamp: Date.now(),
  };

  return await sendEmail({ to: user.email, subject, html, text });
};

/**
 * Send password change security notification
 */
export const sendPasswordChangeNotification = async (user) => {
  const subject = 'CampusMart — Security Alert: Password Changed';
  const text = `Hello ${user.firstName},\n\nYour CampusMart account password was successfully changed.\n\nIf you performed this action, no further steps are required.\n\nIf you did not make this change, please contact CampusMart security immediately.\n\nBest regards,\nThe CampusMart Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="margin-bottom: 24px; text-align: center;">
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0;">Campus<span style="color: #0284c7;">Mart</span></h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Security Notice</p>
      </div>
      <div style="padding: 20px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
        <h2 style="color: #1e293b; font-size: 18px; margin-top: 0;">Your password has been changed</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">Hello ${user.firstName},</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          This is an automated confirmation that the password for your CampusMart account (<strong style="color: #0f172a;">${user.email}</strong>) was changed on ${new Date().toUTCString()}.
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; background-color: #f8fafc; padding: 12px; border-radius: 8px; border-left: 4px solid #0284c7;">
          All previous active login sessions on other devices have been automatically signed out.
        </p>
        <p style="color: #dc2626; font-size: 13px; line-height: 1.5; margin-top: 16px;">
          If you did NOT make this change, your account may be compromised. Please reset your password immediately or contact support.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        &copy; ${new Date().getFullYear()} CampusMart Account Protection.
      </div>
    </div>
  `;

  lastDispatchedEmail = {
    type: 'password_change_notice',
    to: user.email,
    subject,
    text,
    html,
    timestamp: Date.now(),
  };

  return await sendEmail({ to: user.email, subject, html, text });
};

/**
 * Send one-time passcode (OTP) for sensitive operations or two-factor authentication
 */
export const sendOtpEmail = async (user, otpCode, purpose = 'Verification') => {
  const subject = `CampusMart — Your ${purpose} Code: ${otpCode}`;
  const text = `Hello ${user.firstName},\n\nYour one-time passcode for ${purpose} is: ${otpCode}\n\nThis code expires in 10 minutes. Never share this code with anyone.\n\nBest regards,\nThe CampusMart Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="margin-bottom: 24px; text-align: center;">
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0;">Campus<span style="color: #0284c7;">Mart</span></h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">One-Time Security Passcode</p>
      </div>
      <div style="padding: 20px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; text-align: center;">
        <p style="color: #475569; font-size: 15px; margin-bottom: 8px;">Your verification code for ${purpose} is:</p>
        <div style="letter-spacing: 6px; font-size: 32px; font-weight: 800; color: #0284c7; background: #f0f9ff; padding: 16px; border-radius: 8px; display: inline-block; margin: 16px 0; border: 1px dashed #bae6fd;">
          ${otpCode}
        </div>
        <p style="color: #64748b; font-size: 13px;">
          This code expires in 10 minutes. If you did not request this code, no action is needed.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        &copy; ${new Date().getFullYear()} CampusMart Security.
      </div>
    </div>
  `;

  lastDispatchedEmail = {
    type: 'otp',
    to: user.email,
    otpCode,
    purpose,
    subject,
    text,
    html,
    timestamp: Date.now(),
  };

  return await sendEmail({ to: user.email, subject, html, text });
};

/**
 * Send security alert email (e.g. login from new IP, account suspension notice)
 */
export const sendSecurityAlertEmail = async (user, alertDetails = {}) => {
  const { title = 'Account Activity Notice', message = 'Unusual activity was observed on your account.' } = alertDetails;
  const subject = `CampusMart — Security Alert: ${title}`;
  const text = `Hello ${user.firstName},\n\nSecurity notice for your CampusMart account:\n${message}\n\nTime: ${new Date().toUTCString()}\n\nBest regards,\nThe CampusMart Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="margin-bottom: 24px; text-align: center;">
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0;">Campus<span style="color: #0284c7;">Mart</span></h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Account Protection</p>
      </div>
      <div style="padding: 20px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
        <h2 style="color: #b91c1c; font-size: 18px; margin-top: 0;">${title}</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">Hello ${user.firstName},</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          ${message}
        </p>
        <p style="color: #64748b; font-size: 12px; margin-top: 16px;">
          Timestamp: ${new Date().toUTCString()}
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        &copy; ${new Date().getFullYear()} CampusMart Security Team.
      </div>
    </div>
  `;

  lastDispatchedEmail = {
    type: 'security_alert',
    to: user.email,
    subject,
    text,
    html,
    timestamp: Date.now(),
  };

  return await sendEmail({ to: user.email, subject, html, text });
};
