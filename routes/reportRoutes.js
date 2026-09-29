import express from 'express';
import {
  createReport,
  getReports,
  updateReportStatus,
} from '../controllers/reportController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .post(protect, createReport)
  .get(protect, adminOnly, getReports);

router.route('/:id')
  .patch(protect, adminOnly, updateReportStatus);

export default router;
