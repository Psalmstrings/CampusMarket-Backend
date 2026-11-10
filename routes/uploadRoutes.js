import express from 'express';
import { upload } from '../middleware/uploadMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';
import { isCloudinaryConfigured, uploadToCloudinary } from '../services/cloudinaryService.js';

const router = express.Router();

// Helper: wraps a multer middleware so its errors return clean JSON (not 500)
const runMulter = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err) {
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
router.post('/', protect, runMulter(upload.array('images', 5)), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files uploaded',
      });
    }

    const cloudinaryActive = isCloudinaryConfigured();
    const fileUrls = [];

    if (cloudinaryActive) {
      for (const file of req.files) {
        const uploadResult = await uploadToCloudinary(file.path, 'campusmarket/listings');
        if (uploadResult && uploadResult.url) {
          fileUrls.push(uploadResult.url);
        } else {
          // Fallback to local if single upload failed
          const host = req.get('host');
          const protocol = req.protocol;
          fileUrls.push(`${protocol}://${host}/uploads/${file.filename}`);
        }
      }
    } else {
      console.warn(
        '⚠️ [STORAGE NOTICE] Cloudinary credentials not configured. Saving uploaded listing images to local disk storage.'
      );
      const host = req.get('host');
      const protocol = req.protocol;
      for (const file of req.files) {
        fileUrls.push(`${protocol}://${host}/uploads/${file.filename}`);
      }
    }

    return res.json({
      success: true,
      message: 'Images uploaded successfully',
      urls: fileUrls,
      storage: cloudinaryActive ? 'cloudinary' : 'local',
    });
  } catch (error) {
    console.error('Upload handler error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing uploaded images',
      error: error.message,
    });
  }
});

// @desc    Upload single image (e.g. profile picture)
// @route   POST /api/upload/single
// @access  Private
router.post('/single', protect, runMulter(upload.single('image')), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded',
      });
    }

    const cloudinaryActive = isCloudinaryConfigured();
    let fileUrl = '';

    if (cloudinaryActive) {
      const uploadResult = await uploadToCloudinary(req.file.path, 'campusmarket/profiles');
      fileUrl = uploadResult ? uploadResult.url : '';
    }

    if (!fileUrl) {
      if (!cloudinaryActive) {
        console.warn(
          '⚠️ [STORAGE NOTICE] Cloudinary credentials not configured. Saving uploaded profile image to local disk storage.'
        );
      }
      const host = req.get('host');
      const protocol = req.protocol;
      fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    }

    return res.json({
      success: true,
      message: 'Image uploaded successfully',
      url: fileUrl,
      storage: cloudinaryActive ? 'cloudinary' : 'local',
    });
  } catch (error) {
    console.error('Single upload handler error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing uploaded image',
      error: error.message,
    });
  }
});

export default router;
