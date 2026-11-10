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
    const nodemailer = (await import('nodemailer')).default;

    const tests = {};

    // Test 1: Port 587 STARTTLS
    try {
      const t587 = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: rawUser, pass: rawPass },
        connectionTimeout: 5000,
        greetingTimeout: 3000,
        socketTimeout: 5000,
      });
      await t587.verify();
      tests['port_587'] = 'SUCCESS';
    } catch (e) {
      tests['port_587'] = `${e.code || e.message}`;
    }

    // Test 2: Port 465 SSL
    try {
      const t465 = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: rawUser, pass: rawPass },
        connectionTimeout: 5000,
        greetingTimeout: 3000,
        socketTimeout: 5000,
      });
      await t465.verify();
      tests['port_465'] = 'SUCCESS';
    } catch (e) {
      tests['port_465'] = `${e.code || e.message}`;
    }

    return res.json({
      hasUser: Boolean(rawUser),
      userMasked: rawUser ? `${rawUser.slice(0, 3)}***` : 'NOT_SET',
      hasPass: Boolean(rawPass),
      passLength: rawPass.length,
      portsTest: tests,
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
