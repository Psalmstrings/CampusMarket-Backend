import User from '../models/User.js';
import Listing from '../models/Listing.js';
import Campus from '../models/Campus.js';
import Category from '../models/Category.js';
import Report from '../models/Report.js';

// @desc    Get comprehensive admin dashboard statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
export const getAdminStats = async (req, res) => {
  try {
    const [
      totalUsers,
      verifiedUsers,
      totalListings,
      pendingListings,
      activeListings,
      soldListings,
      reportedListings,
      pendingReports,
      totalCampuses,
      totalCategories,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      Listing.countDocuments(),
      Listing.countDocuments({ status: 'pending' }),
      Listing.countDocuments({ status: 'active' }),
      Listing.countDocuments({ status: 'sold' }),
      Report.distinct('listing').then((arr) => arr.length),
      Report.countDocuments({ status: 'pending' }),
      Campus.countDocuments({ isActive: true }),
      Category.countDocuments({ isActive: true }),
    ]);

    // Breakdown: Listings by Campus
    const listingsByCampus = await Listing.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$campus', count: { $sum: 1 } } },
      {
        $lookup: {
          from: 'campuses',
          localField: '_id',
          foreignField: '_id',
          as: 'campusInfo',
        },
      },
      { $unwind: '$campusInfo' },
      {
        $project: {
          campusName: '$campusInfo.shortName',
          count: 1,
        },
      },
    ]);

    // Breakdown: Listings by Category
    const listingsByCategory = await Listing.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'catInfo',
        },
      },
      { $unwind: '$catInfo' },
      {
        $project: {
          categoryName: '$catInfo.name',
          count: 1,
        },
      },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);

    return res.json({
      success: true,
      data: {
        totalUsers,
        verifiedUsers,
        totalListings,
        pendingListings,
        activeListings,
        soldListings,
        reportedListings,
        pendingReports,
        totalCampuses,
        totalCategories,
        listingsByCampus,
        listingsByCategory,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching admin stats',
    });
  }
};

// @desc    Get users list for admin management
// @route   GET /api/admin/users
// @access  Private/Admin
export const getAdminUsers = async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const query = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'suspended') {
      query.isActive = false;
    }

    if (search && search.trim() !== '') {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }, { phone: regex }];
    }

    const users = await User.find(query)
      .select('-password')
      .populate('campus', 'name shortName')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching users',
    });
  }
};

// @desc    Update user status (verify, suspend, change role)
// @route   PATCH /api/admin/users/:id
// @access  Private/Admin
export const updateAdminUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const { isVerified, isActive, role } = req.body;

    if (isVerified !== undefined) user.isVerified = isVerified;
    if (isActive !== undefined) user.isActive = isActive;
    if (role && ['student', 'vendor', 'admin'].includes(role)) {
      user.role = role;
    }

    await user.save();
    const updated = await User.findById(user._id).select('-password').populate('campus', 'name shortName');

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error updating user',
    });
  }
};

// @desc    Get all listings for admin moderation
// @route   GET /api/admin/listings
// @access  Private/Admin
export const getAdminListings = async (req, res) => {
  try {
    let { status, campus, category, search } = req.query;
    const query = {};

    // Sanitize: treat literal string "undefined" as no value
    if (status === 'undefined') status = undefined;
    if (campus === 'undefined') campus = undefined;
    if (category === 'undefined') category = undefined;
    if (search === 'undefined') search = undefined;

    if (status && status !== 'all') {
      query.status = status;
    }

    if (campus && campus !== 'all') {
      query.campus = campus;
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (search && search.trim() !== '') {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { description: regex }, { location: regex }];
    }

    const listings = await Listing.find(query)
      .populate('seller', 'firstName lastName email phone isVerified')
      .populate('campus', 'name shortName')
      .populate('category', 'name slug')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: listings.length,
      data: listings,
    });
  } catch (error) {
    console.error('getAdminListings error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching listings for admin',
    });
  }
};

// @desc    Approve listing
// @route   PATCH /api/admin/listings/:id/approve
// @access  Private/Admin
export const approveListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    listing.status = 'active';
    await listing.save();

    return res.json({
      success: true,
      message: 'Listing approved and published successfully',
      data: listing,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error approving listing',
    });
  }
};

// @desc    Reject listing
// @route   PATCH /api/admin/listings/:id/reject
// @access  Private/Admin
export const rejectListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    listing.status = 'rejected';
    await listing.save();

    return res.json({
      success: true,
      message: 'Listing rejected',
      data: listing,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error rejecting listing',
    });
  }
};

// @desc    Toggle feature listing
// @route   PATCH /api/admin/listings/:id/feature
// @access  Private/Admin
export const toggleFeatureListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    listing.isFeatured = !listing.isFeatured;
    if (listing.isFeatured) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7); // Featured for 7 days
      listing.featuredUntil = expiry;
    } else {
      listing.featuredUntil = null;
    }

    await listing.save();

    return res.json({
      success: true,
      message: listing.isFeatured ? 'Listing marked as featured' : 'Listing unfeatured',
      data: listing,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error featuring listing',
    });
  }
};
