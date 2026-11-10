import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import authRoutes from './routes/authRoutes.js';
import campusRoutes from './routes/campusRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import listingRoutes from './routes/listingRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import {
  securityHeaders,
  apiLimiter,
  authLimiter,
  uploadLimiter,
} from './middleware/securityMiddleware.js';

const app = express();

// Trust reverse proxy (e.g. Render, Vercel, Nginx, Railway)
app.set('trust proxy', 1);

// Security Headers
app.use(securityHeaders);

// ─── Request Logger (dev) ────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400) {
      console.error(`❌ ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`, body?.message || '');
    } else {
      console.log(`✅ ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    }
    return originalJson(body);
  };
  next();
});

// Configure CORS for local dev and production
const isProduction = process.env.NODE_ENV === 'production';

// Production origins include configured client domain, www variant, and known deploy domains
const prodOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_URL ? [
    process.env.CLIENT_URL.replace('://', '://www.'),
    process.env.CLIENT_URL.replace('://www.', '://'),
  ] : []),
  'https://campusmarket.ng',
  'https://www.campusmarket.ng',
  ...(process.env.ADDITIONAL_ORIGINS ? process.env.ADDITIONAL_ORIGINS.split(',') : []),
].filter(Boolean);

// Development origins allow local Vite and dev servers
const devOrigins = [
  'http://localhost:5173',
  'http://localhost:5006',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5006',
];

const allowedOrigins = isProduction ? prodOrigins : [...prodOrigins, ...devOrigins];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, or server-to-server tests)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow preview and staging deployments on Render and Vercel
      const isAllowedDeployPlatform = /^https:\/\/[a-z0-9-_]+\.(onrender\.com|vercel\.app)$/i.test(origin);
      if (isAllowedDeployPlatform) {
        return callback(null, true);
      }

      // In non-production, be permissive for local development convenience
      if (!isProduction) {
        return callback(null, true);
      }

      // Reject unauthorized origins in production
      return callback(new Error(`Origin ${origin} not permitted by CORS policy`), false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads folder
app.use('/uploads', express.static(path.resolve('uploads')));

// Health check endpoint (bypasses rate limiting)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'CampusMarket API',
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// Apply rate limiters to API routes
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Production Static Serving
const clientDist = path.resolve('client/dist');
const altClientDist = path.resolve('../client/dist');
const distPath = fs.existsSync(clientDist)
  ? clientDist
  : fs.existsSync(altClientDist)
  ? altClientDist
  : null;

if (distPath) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handlers
app.use(notFound);
app.use(errorHandler);

export default app;
