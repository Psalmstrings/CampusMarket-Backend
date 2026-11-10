import jwt from 'jsonwebtoken';

/**
 * Generate HMAC SHA-256 JWT token with user ID and token version for instant revocation
 */
export const generateToken = (id, version = 0) => {
  return jwt.sign(
    { id, version },
    process.env.JWT_SECRET || 'campusmarket_super_secret_jwt_key_2026',
    {
      expiresIn: '30d',
    }
  );
};
