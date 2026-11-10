import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

/**
 * Check whether Cloudinary environment variables are available and populated
 */
export const isCloudinaryConfigured = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  return Boolean(
    cloudName &&
    apiKey &&
    apiSecret &&
    !cloudName.includes('your_') &&
    !apiKey.includes('your_') &&
    !apiSecret.includes('your_')
  );
};

// Initialize Cloudinary if credentials exist
if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Upload a local file to Cloudinary and optionally remove local temporary file
 * @param {string} filePath - Absolute path to local file on disk
 * @param {string} folder - Destination folder on Cloudinary
 * @returns {Promise<{ url: string, public_id: string } | null>}
 */
export const uploadToCloudinary = async (filePath, folder = 'campusmarket/listings') => {
  if (!isCloudinaryConfigured()) {
    return null;
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' },
      ],
    });

    // Remove local temp file once successfully uploaded to cloud
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupErr) {
      console.warn('Could not remove temporary local file:', cleanupErr.message);
    }

    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

/**
 * Delete image from Cloudinary by public ID or URL
 * @param {string} publicIdOrUrl
 */
export const deleteFromCloudinary = async (publicIdOrUrl) => {
  if (!isCloudinaryConfigured() || !publicIdOrUrl) {
    return false;
  }

  try {
    // If a full Cloudinary URL is provided, extract public_id
    let publicId = publicIdOrUrl;
    if (publicIdOrUrl.includes('cloudinary.com')) {
      const parts = publicIdOrUrl.split('/');
      const filename = parts.pop();
      const folder = parts.slice(parts.indexOf('campusmarket')).join('/');
      const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
      publicId = folder ? `${folder}/${nameWithoutExt}` : nameWithoutExt;
    }

    const res = await cloudinary.uploader.destroy(publicId);
    return res.result === 'ok';
  } catch (error) {
    console.warn('Cloudinary delete warning:', error.message);
    return false;
  }
};
