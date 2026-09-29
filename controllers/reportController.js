import Report from '../models/Report.js';
import Listing from '../models/Listing.js';
import User from '../models/User.js';

// @desc    Submit a report for a listing
// @route   POST /api/reports
// @access  Private
export const createReport = async (req, res) => {
  try {
    const { listingId, reason, description } = req.body;

    if (!listingId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Listing ID and report reason are required',
      });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    // Check if user already reported this listing
    const existing = await Report.findOne({
      listing: listingId,
      reportedBy: req.user._id,
      status: { $in: ['pending', 'reviewed'] },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this listing. Our team is reviewing it.',
      });
    }

    const report = await Report.create({
      listing: listingId,
      reportedBy: req.user._id,
      reason,
      description: description || '',
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Thank you for keeping CampusMarket safe.',
      data: report,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error submitting report',
    });
  }
};

// @desc    Get all reports (Admin only)
// @route   GET /api/reports
// @access  Private/Admin
export const getReports = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status && status !== 'all' ? { status } : {};

    const reports = await Report.find(filter)
      .populate({
        path: 'listing',
        populate: [
          { path: 'seller', select: 'firstName lastName email phone isVerified isActive' },
          { path: 'campus', select: 'name shortName' },
        ],
      })
      .populate('reportedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching reports',
    });
  }
};

// @desc    Update report status and optionally take action
// @route   PATCH /api/reports/:id
// @access  Private/Admin
export const updateReportStatus = async (req, res) => {
  try {
    const { status, action } = req.body;
    const report = await Report.findById(req.params.id).populate('listing');
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    if (status) {
      report.status = status;
    }

    // Optional admin actions attached to resolving report
    if (action === 'remove_listing' && report.listing) {
      await Listing.findByIdAndUpdate(report.listing._id, { status: 'removed' });
      report.status = 'resolved';
    } else if (action === 'suspend_seller' && report.listing) {
      await User.findByIdAndUpdate(report.listing.seller, { isActive: false });
      await Listing.findByIdAndUpdate(report.listing._id, { status: 'removed' });
      report.status = 'resolved';
    }

    await report.save();

    return res.json({
      success: true,
      message: 'Report updated successfully',
      data: report,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error updating report',
    });
  }
};
