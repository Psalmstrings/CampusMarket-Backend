import User from '../models/User.js';
import Listing from '../models/Listing.js';

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

// @desc    Request verification (student/vendor submits request)
// @route   POST /api/users/verify-request
// @access  Private
export const requestVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // In MVP, mark pending or verified upon request
    user.isVerified = true;
    await user.save();

    return res.json({
      success: true,
      message: 'Student status verified successfully!',
      data: { isVerified: user.isVerified },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error requesting verification',
    });
  }
};
