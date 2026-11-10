import express from 'express';
import {
  getSellerProfile,
  requestVerification,
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/:id', getSellerProfile);
router.get('/:id/seller-profile', getSellerProfile);
router.post('/verify-request', protect, requestVerification);

export default router;
