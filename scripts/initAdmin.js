import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Campus from '../models/Campus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const initAdmin = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@campusmarket.ng').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@CampusMarket2026!';

    let unilag = await Campus.findOne({ shortName: 'UNILAG' });
    if (!unilag) {
      unilag = await Campus.findOne();
    }

    if (!unilag) {
      unilag = await Campus.create({
        name: 'University of Lagos',
        shortName: 'UNILAG',
        location: 'Akoka, Lagos',
        description: 'First Choice and the Nations Pride',
        isActive: true,
      });
    }

    // 1. Ensure primary admin account (admin@campusmarket.ng)
    let admin = await User.findOne({ email: adminEmail }).select('+password');
    if (!admin) {
      admin = await User.create({
        firstName: 'Campus',
        lastName: 'Admin',
        email: adminEmail,
        phone: '08000000000',
        password: adminPassword,
        campus: unilag._id,
        department: 'Administration',
        level: 'Staff',
        role: 'admin',
        isVerified: true,
        isActive: true,
        mustChangePassword: false,
      });
      console.log(`🎉 Created platform administrator account: ${adminEmail}`);
    } else {
      admin.role = 'admin';
      admin.isVerified = true;
      admin.isActive = true;
      admin.mustChangePassword = false;
      admin.password = adminPassword; // Triggers bcrypt pre('save') hash
      await admin.save();
      console.log(`🎉 Updated platform administrator account credentials for: ${adminEmail}`);
    }

    // 2. Also ensure owner email (psalmstringss@gmail.com) has admin rights
    const ownerEmail = 'psalmstringss@gmail.com';
    const owner = await User.findOne({ email: ownerEmail });
    if (owner) {
      owner.role = 'admin';
      owner.isVerified = true;
      owner.isActive = true;
      await owner.save();
      console.log(`🎉 Granted platform administrator role to owner account: ${ownerEmail}`);
    }

    // 3. Remove any lingering demo accounts with Password123! or mock students if they exist
    const demoEmails = ['tunde@unilag.edu.ng', 'chioma@yabatech.edu.ng', 'khalid@lasu.edu.ng'];
    const deleteResult = await User.deleteMany({ email: { $in: demoEmails } });
    if (deleteResult.deletedCount > 0) {
      console.log(`🧹 Removed ${deleteResult.deletedCount} legacy demo student/vendor account(s).`);
    } else {
      console.log('✨ No demo student/vendor accounts found in database.');
    }

    console.log('✅ Admin initialization complete!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during initAdmin:', err);
    process.exit(1);
  }
};

initAdmin();
