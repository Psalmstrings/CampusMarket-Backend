import crypto from 'crypto';
import User from '../models/User.js';
import Campus from '../models/Campus.js';
import { generateToken } from '../utils/generateToken.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangeNotification,
} from '../services/emailService.js';

// @desc    Register a new user (Unverified by default until email token validation)
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      confirmPassword,
      campus,
      department,
      level,
      role,
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !password || !campus) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    // Verify campus exists
    const campusDoc = await Campus.findById(campus);
    if (!campusDoc) {
      return res.status(400).json({
        success: false,
        message: 'Selected campus is not recognized',
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email address already exists',
      });
    }

    // Role check: never allow user to register as admin directly
    const userRole = role === 'vendor' ? 'vendor' : 'student';

    // Account creation: always unverified initially regardless of email domain
    const user = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      password,
      campus,
      department: department || '',
      level: level || '',
      role: userRole,
      isVerified: false,
      lastVerificationEmailSent: new Date(),
    });

    // Generate cryptographically secure email verification token (32 bytes hex)
    const verificationToken = user.createEmailVerificationToken();
    await user.save();

    // Dispatch verification email through configured service
    await sendVerificationEmail(user, verificationToken);

    const populatedUser = await User.findById(user._id)
      .select('-password')
      .populate('campus', 'name shortName location');

    const token = generateToken(user._id, user.tokenVersion || 0);

    // Note: Raw tokens are NEVER exposed in public API responses for security
    return res.status(201).json({
      success: true,
      message: 'Registration successful! A verification link has been sent to your email.',
      data: {
        token,
        user: populatedUser,
        verificationRequired: true,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration',
    });
  }
};

// @desc    Verify student email address using secure token
// @route   POST /api/auth/verify-email
// @access  Public
export const verifyEmail = async (req, res) => {
  try {
    const rawToken = req.body.token || req.query.token;

    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required',
      });
    }

    // Hash the token using SHA-256 to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken.trim())
      .digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpire: { $gt: Date.now() },
    }).populate('campus', 'name shortName location');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token. Please request a new verification link.',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'This account email has already been verified.',
      });
    }

    // Mark account as verified and clear verification tokens (single-use, prevents reuse)
    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save();

    return res.json({
      success: true,
      message: 'Email address successfully verified! Your verified student badge is now active.',
      data: {
        _id: user._id,
        email: user.email,
        isVerified: user.isVerified,
        role: user.role,
        campus: user.campus,
      },
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error verifying email address',
    });
  }
};

// @desc    Resend email verification link with persistent MongoDB rate limiting
// @route   POST /api/auth/resend-verification
// @access  Public (Optional auth or by email)
export const resendVerification = async (req, res) => {
  try {
    const email = (req.body.email || req.user?.email || '').toLowerCase().trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required to resend verification',
      });
    }

    const user = await User.findOne({ email }).select('+lastVerificationEmailSent +emailVerificationExpire +isVerified');

    // Prevent email enumeration: return generic success message if account does not exist
    if (!user) {
      return res.json({
        success: true,
        message: 'If this email belongs to an unverified account, a verification link has been sent.',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'This account is already verified.',
      });
    }

    // Persistent cooldown check (stored in MongoDB: survives server restarts and multi-instance deployments)
    if (user.lastVerificationEmailSent) {
      const elapsed = Date.now() - new Date(user.lastVerificationEmailSent).getTime();
      if (elapsed < 60 * 1000) {
        const waitSeconds = Math.ceil((60 * 1000 - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSeconds} seconds before requesting another verification email.`,
        });
      }
    }

    const verificationToken = user.createEmailVerificationToken();
    user.lastVerificationEmailSent = new Date();
    await user.save();

    await sendVerificationEmail(user, verificationToken);

    // Note: Raw token is NEVER returned in response
    return res.json({
      success: true,
      message: 'A new verification link has been sent to your email address.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error resending verification email',
    });
  }
};

// @desc    Request password reset email
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your email address',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always respond with success to avoid account enumeration
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists with that email address, password reset instructions have been sent.',
      });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save();

    await sendPasswordResetEmail(user, resetToken);

    // Note: Raw reset token is NEVER exposed in API response
    return res.json({
      success: true,
      message: 'If an account exists with that email address, password reset instructions have been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error processing password reset request',
    });
  }
};

// @desc    Reset password using valid reset token
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = async (req, res) => {
  try {
    const rawToken = req.params.token || req.body.token;
    const { password, confirmPassword } = req.body;

    if (!rawToken) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is missing',
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken.trim())
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token',
      });
    }

    // Set new password & clear reset tokens (single-use)
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    user.mustChangePassword = false;
    // Invalidate past sessions: increment tokenVersion so prior tokens fail
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.passwordChangedAt = new Date();
    await user.save();

    const token = generateToken(user._id, user.tokenVersion);

    return res.json({
      success: true,
      message: 'Password has been reset successfully. You are now logged in.',
      data: {
        token,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          campus: user.campus,
          isVerified: user.isVerified,
        },
      },
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error resetting password',
    });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Find user and include password for verification
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password')
      .populate('campus', 'name shortName location');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const token = generateToken(user._id, user.tokenVersion || 0);
    const userObj = user.toObject();
    delete userObj.password;

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: userObj,
        mustChangePassword: Boolean(user.mustChangePassword),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during login',
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('campus', 'name shortName location');

    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching user profile',
    });
  }
};

// @desc    Update user profile (Email changes reset verification status; prevents unauthorized privilege escalation)
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Strictly whitelist permitted fields (students CANNOT modify isVerified, role, or mustChangePassword)
    const { firstName, lastName, phone, department, level, profileImage, campus, email } = req.body;

    if (firstName) user.firstName = firstName.trim();
    if (lastName) user.lastName = lastName.trim();
    if (phone) user.phone = phone.trim();
    if (department !== undefined) user.department = department.trim();
    if (level !== undefined) user.level = level.trim();
    if (profileImage !== undefined) user.profileImage = profileImage;
    if (campus) {
      const validCampus = await Campus.findById(campus);
      if (validCampus) user.campus = campus;
    }

    // Critical Security Requirement: Email changes reset verification status and trigger new verification email
    let emailChanged = false;
    if (email && email.toLowerCase().trim() !== user.email) {
      const newEmail = email.toLowerCase().trim();
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(newEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address',
        });
      }

      // Check uniqueness
      const existingUser = await User.findOne({ email: newEmail });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'This email address is already in use by another account',
        });
      }

      user.email = newEmail;
      user.isVerified = false; // Reset verification status
      const verificationToken = user.createEmailVerificationToken();
      user.lastVerificationEmailSent = new Date();
      emailChanged = true;
      await sendVerificationEmail(user, verificationToken);
    }

    const updatedUser = await user.save();
    const populated = await User.findById(updatedUser._id)
      .select('-password')
      .populate('campus', 'name shortName location');

    return res.json({
      success: true,
      message: emailChanged
        ? 'Profile updated. Because your email address changed, your account verification has been reset. Please verify your new email.'
        : 'Profile updated successfully',
      data: populated,
      emailVerificationReset: emailChanged,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error updating profile',
    });
  }
};

// @desc    Change user password (invalidates prior JWT sessions)
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new passwords',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
    }

    if (confirmNewPassword && newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match',
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    // Session invalidation: increment tokenVersion so prior tokens fail
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.passwordChangedAt = new Date();
    await user.save();

    // Send security notification to user about password change
    await sendPasswordChangeNotification(user);

    return res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error changing password',
    });
  }
};
