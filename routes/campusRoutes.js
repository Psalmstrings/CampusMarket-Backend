import express from 'express';
import {
  getCampuses,
  getCampusById,
  createCampus,
  updateCampus,
  deleteCampus,
} from '../controllers/campusController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getCampuses)
  .post(protect, adminOnly, createCampus);

router.route('/:id')
  .get(getCampusById)
  .put(protect, adminOnly, updateCampus)
  .delete(protect, adminOnly, deleteCampus);

export default router;
