import Listing from '../models/Listing.js';
import Favorite from '../models/Favorite.js';
import Category from '../models/Category.js';
import Campus from '../models/Campus.js';
import { escapeRegex } from '../middleware/securityMiddleware.js';

// @desc    Get all listings with filtering, search, pagination, and sorting
// @route   GET /api/listings
// @access  Public
export const getListings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const {
      search,
      campus,
      category,
      condition,
      minPrice,
      maxPrice,
      sort,
      status,
      seller,
      featured,
    } = req.query;

    const query = {};

    // By default, public only sees active listings unless seller/admin specifically filters
    if (status) {
      query.status = status;
    } else {
      query.status = 'active';
    }

    if (seller) {
      query.seller = seller;
    }

    if (featured === 'true') {
      query.isFeatured = true;
    }

    // Campus filter (can be ID or shortName)
    if (campus && campus !== 'all') {
      if (campus.match(/^[0-9a-fA-F]{24}$/)) {
        query.campus = campus;
      } else {
        const escapedCampus = escapeRegex(campus);
        const campusObj = await Campus.findOne({
          $or: [
            { shortName: campus.toUpperCase() },
            { name: new RegExp(escapedCampus, 'i') },
          ],
        });
        if (campusObj) {
          query.campus = campusObj._id;
        }
      }
    }

    // Category filter (can be ID or slug)
    if (category && category !== 'all') {
      if (category.match(/^[0-9a-fA-F]{24}$/)) {
        query.category = category;
      } else {
        const catObj = await Category.findOne({ slug: category.toLowerCase() });
        if (catObj) {
          query.category = catObj._id;
        }
      }
    }

    // Condition filter
    if (condition && condition !== 'all') {
      query.condition = condition;
    }

    // Price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Search query across title, description, and location
    if (search && search.trim() !== '') {
      const escaped = escapeRegex(search.trim());
      const regex = new RegExp(escaped, 'i');
      query.$or = [{ title: regex }, { description: regex }, { location: regex }];
    }

    // Sort order
    let sortOptions = { isFeatured: -1, createdAt: -1 }; // featured listings first by default
    if (sort === 'newest') {
      sortOptions = { createdAt: -1 };
    } else if (sort === 'price-asc') {
      sortOptions = { price: 1 };
    } else if (sort === 'price-desc') {
      sortOptions = { price: -1 };
    } else if (sort === 'views') {
      sortOptions = { views: -1 };
    }

    const totalListings = await Listing.countDocuments(query);
    const listings = await Listing.find(query)
      .populate('seller', 'firstName lastName profileImage isVerified phone')
      .populate('campus', 'name shortName location')
      .populate('category', 'name slug icon')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalListings / limit) || 1;

    return res.json({
      success: true,
      data: {
        listings,
        currentPage: page,
        totalPages,
        totalListings,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    console.error('Get listings error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching listings',
    });
  }
};

// @desc    Get single listing by ID
// @route   GET /api/listings/:id
// @access  Public (Optional Auth for favorite check)
export const getListingById = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate('seller', 'firstName lastName email phone profileImage isVerified createdAt campus department level')
      .populate('campus', 'name shortName location')
      .populate('category', 'name slug icon');

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    // Increment view count asynchronously
    listing.views += 1;
    await listing.save();

    let isFavorite = false;
    if (req.user) {
      const fav = await Favorite.findOne({
        user: req.user._id,
        listing: listing._id,
      });
      isFavorite = !!fav;
    }

    return res.json({
      success: true,
      data: {
        ...listing.toObject(),
        isFavorite,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching listing details',
    });
  }
};

// @desc    Create new listing
// @route   POST /api/listings
// @access  Private (Student/Vendor/Admin)
export const createListing = async (req, res) => {
  try {
    // Unverified students cannot create listings until email is verified
    if (req.user.role === 'student' && !req.user.isVerified) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Please verify your student email address before publishing listings.',
      });
    }

    const {
      title,
      description,
      category,
      campus,
      price,
      condition,
      location,
      images,
    } = req.body;

    if (!title || !description || !category || !campus || price === undefined || !condition || !location) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a valid positive amount in Naira',
      });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one product image',
      });
    }

    // New listing starts with pending status
    const listing = await Listing.create({
      seller: req.user._id,
      title: title.trim(),
      description: description.trim(),
      category,
      campus,
      price: parsedPrice,
      condition,
      location: location.trim(),
      images,
      status: 'pending',
    });

    const populatedListing = await Listing.findById(listing._id)
      .populate('category', 'name slug')
      .populate('campus', 'name shortName');

    return res.status(201).json({
      success: true,
      message: 'Your listing has been submitted and is awaiting approval.',
      data: populatedListing,
    });
  } catch (error) {
    console.error('Create listing error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error creating listing',
    });
  }
};

// @desc    Update listing
// @route   PUT /api/listings/:id
// @access  Private (Owner or Admin)
export const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    // Check ownership or admin
    if (listing.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this listing',
      });
    }

    const {
      title,
      description,
      category,
      campus,
      price,
      condition,
      location,
      images,
    } = req.body;

    if (title) listing.title = title.trim();
    if (description) listing.description = description.trim();
    if (category) listing.category = category;
    if (campus) listing.campus = campus;
    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a valid positive amount in Naira',
        });
      }
      listing.price = parsedPrice;
    }
    if (condition) listing.condition = condition;
    if (location) listing.location = location.trim();
    if (images && Array.isArray(images) && images.length > 0) listing.images = images;

    const updated = await listing.save();
    const populated = await Listing.findById(updated._id)
      .populate('category', 'name slug')
      .populate('campus', 'name shortName');

    return res.json({
      success: true,
      message: 'Listing updated successfully',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error updating listing',
    });
  }
};

// @desc    Delete listing
// @route   DELETE /api/listings/:id
// @access  Private (Owner or Admin)
export const deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    // Check ownership or admin
    if (listing.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this listing',
      });
    }

    // Remove favorites pointing to this listing
    await Favorite.deleteMany({ listing: listing._id });
    await listing.deleteOne();

    return res.json({
      success: true,
      message: 'Listing deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error deleting listing',
    });
  }
};

// @desc    Mark listing as sold
// @route   PATCH /api/listings/:id/sold
// @access  Private (Owner or Admin)
export const markListingSold = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    if (listing.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to change status of this listing',
      });
    }

    listing.status = 'sold';
    await listing.save();

    return res.json({
      success: true,
      message: 'Item marked as sold',
      data: listing,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error marking item as sold',
    });
  }
};

// @desc    Record WhatsApp click & redirect URL info
// @route   PATCH /api/listings/:id/whatsapp-click
// @access  Public
export const recordWhatsappClick = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id).populate('seller', 'phone firstName');
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    listing.whatsappClicks += 1;
    await listing.save();

    // Construct WhatsApp message and clean phone number (e.g. Nigerian format +234)
    let phone = listing.seller?.phone || '';
    phone = phone.replace(/\D/g, ''); // remove non-digits
    if (phone.startsWith('0')) {
      phone = '234' + phone.substring(1);
    } else if (phone.startsWith('234')) {
      // already in international format
    } else if (!phone.startsWith('234')) {
      phone = '234' + phone;
    }

    const prefilledText = encodeURIComponent(
      `Hi, I found your "${listing.title}" on CampusMarket. Is it still available?`
    );
    const whatsappUrl = `https://wa.me/${phone}?text=${prefilledText}`;

    return res.json({
      success: true,
      data: {
        whatsappClicks: listing.whatsappClicks,
        whatsappUrl,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error recording WhatsApp click',
    });
  }
};

// @desc    Record Phone click
// @route   PATCH /api/listings/:id/phone-click
// @access  Public
export const recordPhoneClick = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id).populate('seller', 'phone');
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
      });
    }

    listing.phoneClicks += 1;
    await listing.save();

    return res.json({
      success: true,
      data: {
        phoneClicks: listing.phoneClicks,
        phone: listing.seller?.phone,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error recording phone click',
    });
  }
};

// @desc    Toggle favorite on a listing
// @route   PATCH /api/listings/:id/favorite
// @access  Private
export const toggleFavorite = async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.user._id;

    const existingFav = await Favorite.findOne({ user: userId, listing: listingId });
    if (existingFav) {
      await existingFav.deleteOne();
      return res.json({
        success: true,
        isFavorite: false,
        message: 'Listing removed from favorites',
      });
    } else {
      await Favorite.create({ user: userId, listing: listingId });
      return res.json({
        success: true,
        isFavorite: true,
        message: 'Listing saved to favorites',
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error updating favorite',
    });
  }
};

// @desc    Get current user's listings and stats for seller dashboard
// @route   GET /api/listings/user/my-listings
// @access  Private
export const getMyListings = async (req, res) => {
  try {
    const userId = req.user._id;
    const listings = await Listing.find({ seller: userId })
      .populate('category', 'name slug')
      .populate('campus', 'name shortName')
      .sort({ createdAt: -1 });

    const activeCount = listings.filter((l) => l.status === 'active').length;
    const pendingCount = listings.filter((l) => l.status === 'pending').length;
    const soldCount = listings.filter((l) => l.status === 'sold').length;
    const totalViews = listings.reduce((acc, curr) => acc + (curr.views || 0), 0);
    const totalWhatsappClicks = listings.reduce(
      (acc, curr) => acc + (curr.whatsappClicks || 0),
      0
    );

    return res.json({
      success: true,
      data: {
        listings,
        stats: {
          activeCount,
          pendingCount,
          soldCount,
          totalViews,
          totalWhatsappClicks,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching user listings',
    });
  }
};

// @desc    Get user's favorites
// @route   GET /api/listings/user/favorites
// @access  Private
export const getMyFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user._id })
      .populate({
        path: 'listing',
        populate: [
          { path: 'campus', select: 'name shortName' },
          { path: 'category', select: 'name slug' },
          { path: 'seller', select: 'firstName lastName isVerified' },
        ],
      })
      .sort({ createdAt: -1 });

    // Filter out any favorites whose listing was deleted
    const validListings = favorites
      .filter((fav) => fav.listing)
      .map((fav) => fav.listing);

    return res.json({
      success: true,
      count: validListings.length,
      data: validListings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching favorites',
    });
  }
};
