import express from 'express';
import {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  changePassword,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/securityMiddleware.js';
import { verifySmtpConnection } from '../services/emailService.js';

const router = express.Router();

router.get('/smtp-diagnostic', async (req, res) => {
  try {
    const rawUser = process.env.SMTP_USER || '';
    const rawPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
    const hasResend = Boolean(process.env.RESEND_API_KEY);
    const hasBrevo = Boolean(process.env.BREVO_API_KEY);

    const result = await verifySmtpConnection();

    return res.json({
      activeProvider: hasResend ? 'resend (HTTPS API - Port 443)' : hasBrevo ? 'brevo (HTTPS API - Port 443)' : 'gmail-smtp',
      resendConfigured: hasResend,
      brevoConfigured: hasBrevo,
      hasUser: Boolean(rawUser),
      userMasked: rawUser ? `${rawUser.slice(0, 3)}***` : 'NOT_SET',
      hasPass: Boolean(rawPass),
      passLength: rawPass.length,
      verificationResult: result,
      renderNote: (!hasResend && !hasBrevo && !result.connected)
        ? 'Render blocks raw outbound SMTP ports 25, 465, and 587. To send emails on Render, add RESEND_API_KEY (from resend.com) or BREVO_API_KEY (from brevo.com) to your Render Environment.'
        : 'Email provider connected and active.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);

// Email Verification
router.post('/verify-email', verifyEmail);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', optionalAuth, resendVerification);

// Password Reset Workflow
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);
router.post('/reset-password', authLimiter, resetPassword);

export default router;
