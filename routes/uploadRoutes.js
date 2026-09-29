import express from 'express';
import { upload } from '../middleware/uploadMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Helper: wraps a multer middleware so its errors return clean JSON (not 500)
const runMulter = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err) {
      // MulterError (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE, etc.) or our custom fileFilter error
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image size cannot exceed 5MB per file'
          : err.message || 'File upload failed';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
};

// @desc    Upload multiple listing images (up to 5)
// @route   POST /api/upload
// @access  Private
router.post('/', protect, runMulter(upload.array('images', 5)), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No image files uploaded',
    });
  }

  const host = req.get('host');
  const protocol = req.protocol;
  const fileUrls = req.files.map(
    (file) => `${protocol}://${host}/uploads/${file.filename}`
  );

  return res.json({
    success: true,
    message: 'Images uploaded successfully',
    urls: fileUrls,
  });
});

// @desc    Upload single image (e.g. profile picture)
// @route   POST /api/upload/single
// @access  Private
router.post('/single', protect, runMulter(upload.single('image')), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No image file uploaded',
    });
  }

  const host = req.get('host');
  const protocol = req.protocol;
  const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

  return res.json({
    success: true,
    message: 'Image uploaded successfully',
    url: fileUrl,
  });
});

export default router;
