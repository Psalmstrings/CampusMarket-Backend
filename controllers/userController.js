import User from '../models/User.js';
import Listing from '../models/Listing.js';
import { sendVerificationEmail } from '../services/emailService.js';

// @desc    Get public seller profile and active listings
// @route   GET /api/users/:id/seller-profile
// @access  Public
export const getSellerProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('firstName lastName campus department level isVerified profileImage createdAt role')
      .populate('campus', 'name shortName location');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Seller profile not found',
      });
    }

    const activeListings = await Listing.find({
      seller: user._id,
      status: 'active',
    })
      .populate('category', 'name slug')
      .populate('campus', 'name shortName')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: {
        seller: user,
        activeListings,
        totalActive: activeListings.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching seller profile',
    });
  }
};

// @desc    Request email verification link for authenticated student
// @route   POST /api/users/verify-request
// @access  Private
export const requestVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+lastVerificationEmailSent +emailVerificationExpire +isVerified');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Your account is already verified.',
      });
    }

    // Enforce 60-second cooldown stored in MongoDB
    if (user.lastVerificationEmailSent) {
      const elapsed = Date.now() - new Date(user.lastVerificationEmailSent).getTime();
      if (elapsed < 60 * 1000) {
        const wait = Math.ceil((60000 - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${wait} seconds before requesting another verification email.`,
        });
      }
    }

    const verificationToken = user.createEmailVerificationToken();
    user.lastVerificationEmailSent = new Date();
    await user.save();

    await sendVerificationEmail(user, verificationToken);

    return res.json({
      success: true,
      message: 'A verification link has been sent to your student email address.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error requesting verification',
    });
  }
};
