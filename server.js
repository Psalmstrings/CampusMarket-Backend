import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from server directory first, fallback to root
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

import app from './app.js';
import connectDB from './config/db.js';
import { autoSeedData } from './seed.js';

const PORT = process.env.PORT || 5006;

const startServer = async () => {
  try {
    await connectDB();
    
    // Automatically seed base campuses, categories, admin user, and sample listings if empty
    await autoSeedData();

    app.listen(PORT, () => {
      console.log(`🚀 CampusMarket Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
