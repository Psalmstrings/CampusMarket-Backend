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
    const rawPass = process.env.SMTP_PASS || '';
    const result = await verifySmtpConnection();
    return res.json({
      hasUser: Boolean(rawUser),
      userMasked: rawUser ? `${rawUser.slice(0, 3)}***` : 'NOT_SET',
      hasPass: Boolean(rawPass),
      passLength: rawPass.length,
      smtpHost: process.env.SMTP_HOST || 'default: smtp.gmail.com',
      smtpPort: process.env.SMTP_PORT || 'default: 587',
      result,
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
