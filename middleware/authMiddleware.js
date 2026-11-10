import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'campusmarket_super_secret_jwt_key_2026'
      );

      const user = await User.findById(decoded.id).select('-password +passwordChangedAt');
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User no longer exists',
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact support.',
        });
      }

      // Session & Token Invalidation: verify token version against current database state
      if (
        decoded.version !== undefined &&
        user.tokenVersion !== undefined &&
        decoded.version !== user.tokenVersion
      ) {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_REVOKED_PASSWORD_CHANGED',
          message: 'User recently changed password. Please log in again with your new credentials.',
        });
      }

      req.user = user;
      return next();
    } catch (error) {
      console.error('Auth verification error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed or expired',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no authentication token provided',
    });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: role '${req.user?.role}' is not authorized to access this resource`,
      });
    }
    next();
  };
};

export const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: `Forbidden: role '${req.user?.role}' is not authorized to access this resource`,
    });
  }

  // Force default seeded administrator to change password before administering
  if (req.user.mustChangePassword) {
    return res.status(403).json({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Initial administrator must change password before performing administration tasks.',
    });
  }

  next();
};

export const verifiedOnly = (req, res, next) => {
  if (!req.user || !req.user.isVerified) {
    return res.status(403).json({
      success: false,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Please verify your student email address to perform this action.',
    });
  }
  next();
};

export const optionalAuth = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'campusmarket_super_secret_jwt_key_2026'
      );
      const user = await User.findById(decoded.id).select('-password');
      if (user && user.isActive) {
        req.user = user;
      }
    } catch (err) {
      // Ignored for optional auth
    }
  }
  next();
};
