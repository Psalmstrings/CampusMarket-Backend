import Campus from '../models/Campus.js';
import Listing from '../models/Listing.js';

// @desc    Get all campuses
// @route   GET /api/campuses
// @access  Public
export const getCampuses = async (req, res) => {
  try {
    const { all } = req.query;
    const filter = all === 'true' ? {} : { isActive: true };
    const campuses = await Campus.find(filter).sort({ name: 1 });
    return res.json({
      success: true,
      count: campuses.length,
      data: campuses,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching campuses',
    });
  }
};

// @desc    Get single campus
// @route   GET /api/campuses/:id
// @access  Public
export const getCampusById = async (req, res) => {
  try {
    const campus = await Campus.findById(req.params.id);
    if (!campus) {
      return res.status(404).json({
        success: false,
        message: 'Campus not found',
      });
    }
    return res.json({
      success: true,
      data: campus,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching campus',
    });
  }
};

// @desc    Create new campus
// @route   POST /api/campuses
// @access  Private/Admin
export const createCampus = async (req, res) => {
  try {
    const { name, shortName, location, description, logo, isActive } = req.body;
    if (!name || !shortName || !location) {
      return res.status(400).json({
        success: false,
        message: 'Name, short name, and location are required',
      });
    }

    const exists = await Campus.findOne({
      $or: [{ name: name.trim() }, { shortName: shortName.trim().toUpperCase() }],
    });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'A campus with this name or short code already exists',
      });
    }

    const campus = await Campus.create({
      name: name.trim(),
      shortName: shortName.trim().toUpperCase(),
      location: location.trim(),
      description: description || '',
      logo: logo || '',
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      success: true,
      message: 'Campus created successfully',
      data: campus,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error creating campus',
    });
  }
};

// @desc    Update campus
// @route   PUT /api/campuses/:id
// @access  Private/Admin
export const updateCampus = async (req, res) => {
  try {
    const campus = await Campus.findById(req.params.id);
    if (!campus) {
      return res.status(404).json({
        success: false,
        message: 'Campus not found',
      });
    }

    const { name, shortName, location, description, logo, isActive } = req.body;
    if (name) campus.name = name.trim();
    if (shortName) campus.shortName = shortName.trim().toUpperCase();
    if (location) campus.location = location.trim();
    if (description !== undefined) campus.description = description;
    if (logo !== undefined) campus.logo = logo;
    if (isActive !== undefined) campus.isActive = isActive;

    const updated = await campus.save();
    return res.json({
      success: true,
      message: 'Campus updated successfully',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error updating campus',
    });
  }
};

// @desc    Delete campus
// @route   DELETE /api/campuses/:id
// @access  Private/Admin
export const deleteCampus = async (req, res) => {
  try {
    const campus = await Campus.findById(req.params.id);
    if (!campus) {
      return res.status(404).json({
        success: false,
        message: 'Campus not found',
      });
    }

    // Check if any listings use this campus
    const listingCount = await Listing.countDocuments({ campus: req.params.id });
    if (listingCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete campus with ${listingCount} active listings. You can deactivate it instead.`,
      });
    }

    await campus.deleteOne();
    return res.json({
      success: true,
      message: 'Campus deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error deleting campus',
    });
  }
};
