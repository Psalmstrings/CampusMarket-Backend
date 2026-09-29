import express from 'express';
import {
  getListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
  markListingSold,
  recordWhatsappClick,
  recordPhoneClick,
  toggleFavorite,
  getMyListings,
  getMyFavorites,
} from '../controllers/listingController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getListings)
  .post(protect, createListing);

// User-specific listing endpoints
router.get('/user/my-listings', protect, getMyListings);
router.get('/user/favorites', protect, getMyFavorites);

// Single listing & interaction endpoints
router.route('/:id')
  .get(optionalAuth, getListingById)
  .put(protect, updateListing)
  .delete(protect, deleteListing);

router.route('/:id/sold')
  .patch(protect, markListingSold)
  .post(protect, markListingSold);

router.route('/:id/favorite')
  .patch(protect, toggleFavorite)
  .post(protect, toggleFavorite);

router.route('/:id/whatsapp-click')
  .patch(recordWhatsappClick)
  .post(recordWhatsappClick);

router.route('/:id/phone-click')
  .patch(recordPhoneClick)
  .post(recordPhoneClick);

export default router;
