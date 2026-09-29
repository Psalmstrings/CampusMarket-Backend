import express from 'express';
import {
  getAdminStats,
  getAdminUsers,
  updateAdminUser,
  getAdminListings,
  approveListing,
  rejectListing,
  toggleFeatureListing,
} from '../controllers/adminController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes here are admin only
router.use(protect, adminOnly);

router.get('/stats', getAdminStats);
router.get('/users', getAdminUsers);
router.patch('/users/:id', updateAdminUser);
router.get('/listings', getAdminListings);
router.patch('/listings/:id/approve', approveListing);
router.patch('/listings/:id/reject', rejectListing);
router.patch('/listings/:id/feature', toggleFeatureListing);

export default router;
