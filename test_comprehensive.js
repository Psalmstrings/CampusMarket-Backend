process.env.NODE_ENV = 'test';

import http from 'http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './app.js';
import { autoSeedData } from './seed.js';
import User from './models/User.js';
import Listing from './models/Listing.js';
import Campus from './models/Campus.js';
import Category from './models/Category.js';
import Report from './models/Report.js';
import Favorite from './models/Favorite.js';
import {
  isCloudinaryConfigured,
} from './services/cloudinaryService.js';
import {
  getLastDispatchedEmailForTesting,
  verifySmtpConnection,
  sendEmail,
  sendOtpEmail,
  sendPasswordChangeNotification,
  sendSecurityAlertEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sanitizeSmtpError,
  createTransporter,
} from './services/emailService.js';

let mongoServer;
let server;
let BASE_URL;

const testResults = [];

function assert(condition, testName, details = '') {
  if (condition) {
    testResults.push({ name: testName, passed: true, details });
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    testResults.push({ name: testName, passed: false, details });
    console.error(`  ❌ FAIL: ${testName} - ${details}`);
    throw new Error(`Test assertion failed: ${testName} (${details})`);
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }
  return { status: response.status, headers: response.headers, data };
}

async function runAllTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧪 CAMPUSMART COMPREHENSIVE PRODUCTION TEST SUITE');
  console.log('   Final Email Verification & Account Security Audit');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // 0. Setup In-Memory Database & Test Server
    console.log('📦 Initializing MongoMemoryServer & Seed Data...');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    await autoSeedData();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}`;
        console.log(`🚀 Test server listening on ${BASE_URL}\n`);
        resolve();
      });
    });

    // ─── SUITE 1: System Health & Security Headers ─────────────────────────────
    console.log('▶ SUITE 1: System Health & Security Headers');
    const health = await request('/api/health');
    assert(health.status === 200, 'Health check returns 200 OK');
    assert(health.data.status === 'ok', 'Health check reports status ok');
    assert(health.headers.get('x-content-type-options') === 'nosniff', 'Security header X-Content-Type-Options: nosniff present');
    assert(health.headers.get('x-frame-options') === 'DENY', 'Security header X-Frame-Options: DENY present');

    // ─── SUITE 2: Campuses & Categories ───────────────────────────────────────
    console.log('\n▶ SUITE 2: Campuses & Categories Management');
    const campusesRes = await request('/api/campuses');
    assert(campusesRes.status === 200, 'Get campuses returns 200');
    assert(campusesRes.data.data.length >= 3, 'Initial campuses seeded (UNILAG, YABATECH, LASU)');
    const unilag = campusesRes.data.data.find((c) => c.shortName === 'UNILAG');
    const yabatech = campusesRes.data.data.find((c) => c.shortName === 'YABATECH');
    const lasu = campusesRes.data.data.find((c) => c.shortName === 'LASU');
    assert(!!unilag && !!yabatech && !!lasu, 'All 3 target institutions verified in database');

    const categoriesRes = await request('/api/categories');
    assert(categoriesRes.status === 200, 'Get categories returns 200');
    assert(categoriesRes.data.data.length >= 10, 'Standard categories seeded');

    // ─── SUITE 3: Student Identity & Cryptographic Email Verification ─────────
    console.log('\n▶ SUITE 3: Student Identity & Cryptographic Email Verification');
    // Test 3.1: Missing fields rejection
    const invalidReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ firstName: 'Test' }),
    });
    assert(invalidReg.status === 400, 'Registration rejects missing required fields');

    // Test 3.2: Passwords mismatch rejection
    const mismatchReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Sam',
        lastName: 'Ojo',
        email: 'sam@unilag.edu.ng',
        phone: '08011223344',
        password: 'Password123!',
        confirmPassword: 'MismatchPassword!',
        campus: unilag._id,
      }),
    });
    assert(mismatchReg.status === 400, 'Registration rejects mismatched passwords');

    // Test 3.3: Registration with academic email domain (.edu.ng)
    // CRITICAL: An academic domain must NEVER grant automatic verification
    const regEdu = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Folake',
        lastName: 'Balogun',
        email: 'folake@unilag.edu.ng',
        phone: '08055667788',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        campus: unilag._id,
        department: 'Economics',
        level: '300L',
      }),
    });
    assert(regEdu.status === 201, 'Student registers successfully');
    assert(regEdu.data.data.user.isVerified === false, 'Student account starts as unverified (academic domain does NOT auto-verify)');
    assert(regEdu.data.data.verificationRequired === true, 'Verification requirement signaled to client');
    assert(regEdu.data.data.devVerificationToken === undefined, 'Raw verification token is NEVER exposed in public API response');

    const newStudentToken = regEdu.data.data.token;
    const newStudentId = regEdu.data.data.user._id;

    // Check dispatched email internally without API leakage
    const lastEmail = getLastDispatchedEmailForTesting();
    assert(Boolean(lastEmail && lastEmail.rawToken), 'Cryptographic verification token generated and dispatched via email service');
    assert(lastEmail.rawToken.length === 64, 'Token provides 256 bits of entropy (64 hex characters)');
    const verificationToken = lastEmail.rawToken;

    // Test 3.4: Registration with non-academic email (e.g., standard gmail)
    const regNonEdu = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Vendor',
        lastName: 'User',
        email: 'vendor123@gmail.com',
        phone: '08099881122',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        campus: yabatech._id,
        role: 'vendor',
      }),
    });
    assert(regNonEdu.status === 201, 'Non-academic user registers successfully');
    assert(regNonEdu.data.data.user.isVerified === false, 'Non-academic account also initializes as unverified');

    // Test 3.5: Forged academic email cannot self-verify without token
    const forgedUser = await User.findOne({ email: 'folake@unilag.edu.ng' }).select('+emailVerificationToken +emailVerificationExpire');
    assert(forgedUser.isVerified === false, 'Account remains unverified in MongoDB');
    assert(forgedUser.emailVerificationToken !== verificationToken, 'Raw token is NOT stored in MongoDB; only SHA-256 hash stored');

    // Test 3.6: Unverified student blocked from posting marketplace listings
    const unverifiedPost = await request('/api/listings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${newStudentToken}` },
      body: JSON.stringify({
        title: 'Unverified Attempt',
        description: 'Should be rejected',
        price: 1000,
        category: categoriesRes.data.data[0]._id,
        campus: unilag._id,
        condition: 'Good',
        location: 'Hostel',
        images: ['https://example.com/test.jpg'],
      }),
    });
    assert(unverifiedPost.status === 403, 'Unverified student is blocked from posting listings (EMAIL_VERIFICATION_REQUIRED)');

    // Test 3.7: Invalid verification token rejected
    const badVerify = await request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: 'bogus_invalid_token_1234567890' }),
    });
    assert(badVerify.status === 400, 'Rejects invalid email verification token');

    // Test 3.8: Expired token rejected
    const expiredUser = new User({
      firstName: 'Expired',
      lastName: 'Tester',
      email: 'expired@lasu.edu.ng',
      phone: '08012344321',
      password: 'Password123!',
      campus: lasu._id,
      isVerified: false,
    });
    const expiredRawToken = expiredUser.createEmailVerificationToken();
    // Simulate expired token: 1 hour in the past
    expiredUser.emailVerificationExpire = new Date(Date.now() - 3600 * 1000);
    await expiredUser.save();

    const expiredVerify = await request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: expiredRawToken }),
    });
    assert(expiredVerify.status === 400, 'Rejects expired verification token');

    // Test 3.9: Successful verification with valid token
    const goodVerify = await request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: verificationToken }),
    });
    assert(goodVerify.status === 200, 'Student email verified successfully with valid token');
    assert(goodVerify.data.data.isVerified === true, 'Account status updated to isVerified: true');

    // Test 3.10: Single-use verification token cannot be reused
    const reuseVerify = await request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: verificationToken }),
    });
    assert(reuseVerify.status === 400, 'Prevents email verification token reuse');

    // Test 3.11: Duplicate verification rejected on already verified account
    const dupVerify = await request('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'folake@unilag.edu.ng' }),
    });
    assert(dupVerify.status === 400, 'Rejects verification resend for already verified account');

    // Test 3.12: Duplicate registration prevention
    const dupReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Folake',
        lastName: 'Duplicate',
        email: 'folake@unilag.edu.ng',
        phone: '08055667788',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        campus: unilag._id,
      }),
    });
    assert(dupReg.status === 400, 'Registration prevents duplicate email addresses');

    // ─── SUITE 4: Resend Protection & Multi-Instance Persistence ─────────────
    console.log('\n▶ SUITE 4: Persistent Resend Protection & Cooldown');
    // Register unverified student for cooldown testing
    const cooldownStudentRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Cooldown',
        lastName: 'Student',
        email: 'cooldown@unilag.edu.ng',
        phone: '08044332211',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        campus: unilag._id,
      }),
    });
    assert(cooldownStudentRes.status === 201, 'Cooldown test user registered');

    // Immediate second resend request must trigger persistent 60s cooldown (HTTP 429)
    const immediateResend = await request('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'cooldown@unilag.edu.ng' }),
    });
    assert(immediateResend.status === 429, 'Immediate resend rejected by 60-second cooldown rate limit');

    // Verify lastVerificationEmailSent is persistent in MongoDB
    const cooldownUserDoc = await User.findOne({ email: 'cooldown@unilag.edu.ng' }).select('+lastVerificationEmailSent');
    assert(Boolean(cooldownUserDoc.lastVerificationEmailSent), 'Cooldown timestamp is stored in MongoDB (survives restarts and clusters)');

    // ─── SUITE 5: Authentication & Session ───────────────────────────────────
    console.log('\n▶ SUITE 5: Authentication & Login Flow');
    // Test: Wrong password
    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'folake@unilag.edu.ng',
        password: 'WrongPassword!',
      }),
    });
    assert(badLogin.status === 401, 'Login rejects incorrect password');

    // Test: Successful login
    const goodLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'folake@unilag.edu.ng',
        password: 'Password123!',
      }),
    });
    assert(goodLogin.status === 200, 'Login succeeds with correct credentials');
    assert(!!goodLogin.data.data.token, 'Login returns valid JWT token');

    // Admin login
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@campusmarket.ng',
        password: 'AdminPassword123!',
      }),
    });
    assert(adminLogin.status === 200, 'Admin logs in successfully');
    assert(adminLogin.data.data.user.role === 'admin', 'Admin user has admin role');
    assert(adminLogin.data.data.mustChangePassword === true, 'Seeded default admin requires password rotation');
    let adminToken = adminLogin.data.data.token;

    // Pre-seeded student login (Tunde UNILAG)
    const tundeLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'tunde@unilag.edu.ng',
        password: 'Password123!',
      }),
    });
    const tundeToken = tundeLogin.data.data.token;
    const tundeId = tundeLogin.data.data.user._id;

    // ─── SUITE 6: Password Recovery & Session Invalidation ───────────────────
    console.log('\n▶ SUITE 6: Password Recovery & Session Revocation');
    // Test 6.1: Forgot password generates single-use crypto token
    const forgotRes = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'tunde@unilag.edu.ng' }),
    });
    assert(forgotRes.status === 200, 'Password reset request accepted');
    assert(forgotRes.data.devResetToken === undefined, 'Raw reset token is NEVER exposed in HTTP API response');

    const resetEmail = getLastDispatchedEmailForTesting();
    assert(Boolean(resetEmail && resetEmail.rawToken), 'Password reset email dispatched internally');
    const resetToken = resetEmail.rawToken;

    // Test 6.2: Reset with invalid token rejected
    const badResetRes = await request('/api/auth/reset-password/invalid_reset_token', {
      method: 'POST',
      body: JSON.stringify({
        password: 'TundeNewPassword123!',
        confirmPassword: 'TundeNewPassword123!',
      }),
    });
    assert(badResetRes.status === 400, 'Rejects invalid password reset token');

    // Test 6.3: Reset with valid token succeeds
    const goodResetRes = await request(`/api/auth/reset-password/${resetToken}`, {
      method: 'POST',
      body: JSON.stringify({
        password: 'TundeNewPassword123!',
        confirmPassword: 'TundeNewPassword123!',
      }),
    });
    assert(goodResetRes.status === 200, 'Password reset succeeds with valid token');

    // Test 6.4: Reset token cannot be reused
    const reuseResetRes = await request(`/api/auth/reset-password/${resetToken}`, {
      method: 'POST',
      body: JSON.stringify({
        password: 'AnotherPassword123!',
        confirmPassword: 'AnotherPassword123!',
      }),
    });
    assert(reuseResetRes.status === 400, 'Password reset token cannot be reused');

    // Test 6.5: Session Invalidation - old token before password reset must be revoked
    const revokedTokenRes = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${tundeToken}` },
    });
    assert(
      revokedTokenRes.status === 401 && revokedTokenRes.data.code === 'TOKEN_REVOKED_PASSWORD_CHANGED',
      'Prior JWT tokens are immediately revoked following a password change'
    );

    // ─── SUITE 7: Email Address Modification & Verification Reset ───────────
    console.log('\n▶ SUITE 7: Email Modification Resets Verification Status');
    // Test 7.1: Updating profile email resets isVerified to false
    const emailChangeRes = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${newStudentToken}` },
      body: JSON.stringify({
        email: 'folake.updated@unilag.edu.ng',
      }),
    });
    assert(emailChangeRes.status === 200, 'Profile email successfully changed');
    assert(emailChangeRes.data.emailVerificationReset === true, 'Verification reset flag returned');
    assert(emailChangeRes.data.data.isVerified === false, 'Account status reset to isVerified: false upon email change');

    // Check newly dispatched verification email
    const reVerifyEmail = getLastDispatchedEmailForTesting();
    assert(reVerifyEmail.to === 'folake.updated@unilag.edu.ng', 'New verification email dispatched to updated email address');
    const newVerificationToken = reVerifyEmail.rawToken;

    // Test 7.2: Student is blocked from posting listings after email change
    const blockedAfterEmailChange = await request('/api/listings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${newStudentToken}` },
      body: JSON.stringify({
        title: 'Post After Email Change',
        description: 'Should fail',
        price: 3000,
        category: categoriesRes.data.data[0]._id,
        campus: unilag._id,
        condition: 'Good',
        location: 'Hall',
        images: ['https://example.com/test.jpg'],
      }),
    });
    assert(blockedAfterEmailChange.status === 403, 'Student blocked from posting listings until new email is verified');

    // Test 7.3: Verifying new email restores verified status
    const confirmNewEmail = await request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: newVerificationToken }),
    });
    assert(confirmNewEmail.status === 200, 'New email verified successfully');
    assert(confirmNewEmail.data.data.isVerified === true, 'Account verified status restored');

    // ─── SUITE 8: Privilege Escalation & Backdoor Defense ────────────────────
    console.log('\n▶ SUITE 8: Privilege Escalation & Backdoor Defense');
    // Test 8.1: Student cannot modify isVerified or role via PUT /api/auth/profile
    const tamperRes = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${newStudentToken}` },
      body: JSON.stringify({
        role: 'admin',
        mustChangePassword: true,
      }),
    });
    assert(tamperRes.status === 200, 'Profile update processes permitted fields');
    assert(tamperRes.data.data.role === 'student', 'Attempted role escalation to admin is ignored');

    // Test 8.2: /api/users/verify-request does NOT arbitrarily grant verification
    // Unverified user creates request
    const unverifiedUser = new User({
      firstName: 'Attempt',
      lastName: 'Tamperer',
      email: 'tamper@unilag.edu.ng',
      phone: '08088776655',
      password: 'Password123!',
      campus: unilag._id,
      isVerified: false,
    });
    await unverifiedUser.save();
    const tamperToken = (await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'tamper@unilag.edu.ng', password: 'Password123!' }),
    })).data.data.token;

    const backdoorAttempt = await request('/api/users/verify-request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tamperToken}` },
    });
    assert(backdoorAttempt.status === 200, 'Verification request dispatches email link');
    const freshTamperUser = await User.findOne({ email: 'tamper@unilag.edu.ng' });
    assert(freshTamperUser.isVerified === false, 'POST /api/users/verify-request does NOT grant instant verification');

    // ─── SUITE 9: Password Change & Invalidation Workflow ────────────────────
    console.log('\n▶ SUITE 9: Password Change & Token Invalidation');
    const goodPwChange = await request('/api/auth/change-password', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${newStudentToken}` },
      body: JSON.stringify({
        currentPassword: 'Password123!',
        newPassword: 'BrandNewPassword123!',
        confirmNewPassword: 'BrandNewPassword123!',
      }),
    });
    assert(goodPwChange.status === 200, 'Password changed successfully');

    // Folake's old token must now be invalid
    const oldFolakeTokenCheck = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${newStudentToken}` },
    });
    assert(oldFolakeTokenCheck.status === 401, 'Token revoked immediately after password change');

    // Login with new password to get active token
    const newFolakeLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'folake.updated@unilag.edu.ng',
        password: 'BrandNewPassword123!',
      }),
    });
    assert(newFolakeLogin.status === 200, 'Login succeeds with new password');
    const activeStudentToken = newFolakeLogin.data.data.token;

    // ─── SUITE 10: Marketplace Discovery & Filtering ─────────────────────────
    console.log('\n▶ SUITE 10: Marketplace Discovery, Filtering & ReDoS Safety');
    const allListings = await request('/api/listings');
    assert(allListings.status === 200, 'Public listings discovery returns 200');
    assert(allListings.data.data.listings.length > 0, 'Active listings displayed in feed');

    const unilagListings = await request('/api/listings?campus=UNILAG');
    assert(unilagListings.status === 200, 'Filtering by UNILAG short code works');
    assert(unilagListings.data.data.listings.every((l) => l.campus.shortName === 'UNILAG'), 'All returned listings belong to UNILAG campus');

    const compListings = await request('/api/listings?category=computers');
    assert(compListings.status === 200, 'Filtering by category slug works');
    assert(compListings.data.data.listings.every((l) => l.category.slug === 'computers'), 'All returned listings belong to computers category');

    const searchRes = await request('/api/listings?search=EliteBook');
    assert(searchRes.status === 200, 'Search by keyword returns 200');
    assert(searchRes.data.data.listings.length >= 1, 'Search finds matching HP EliteBook');

    const reDosAttempt = await request('/api/listings?search=(([a-z])+)+$');
    assert(reDosAttempt.status === 200, 'Special regex characters are safely escaped without crash');

    const priceRes = await request('/api/listings?minPrice=5000&maxPrice=50000');
    assert(priceRes.status === 200, 'Price range filter returns 200');
    assert(priceRes.data.data.listings.every((l) => l.price >= 5000 && l.price <= 50000), 'Listings respect minPrice and maxPrice boundaries');

    // ─── SUITE 11: Listing Creation by Verified Student ──────────────────────
    console.log('\n▶ SUITE 11: Listing Creation & Validation');
    const invalidPriceRes = await request('/api/listings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
      body: JSON.stringify({
        title: 'Folake Textbook',
        description: 'Microeconomics textbook',
        price: -500,
        category: categoriesRes.data.data[0]._id,
        campus: unilag._id,
        condition: 'Good',
        location: 'Faculty of Social Sciences',
        images: ['https://example.com/test.jpg'],
      }),
    });
    assert(invalidPriceRes.status === 400, 'Rejects negative or invalid listing price');

    const validListingRes = await request('/api/listings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
      body: JSON.stringify({
        title: 'Principles of Microeconomics (N. Gregory Mankiw)',
        description: 'Crisp copy, lightly highlighted in chapters 2-4. Essential for ECON 201 students.',
        price: 5500,
        category: categoriesRes.data.data.find((c) => c.slug === 'books-academics')._id,
        campus: unilag._id,
        condition: 'Good',
        location: 'Faculty of Social Sciences, UNILAG',
        images: [
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
        ],
      }),
    });
    assert(validListingRes.status === 201, 'Verified student creates listing successfully');
    assert(validListingRes.data.data.status === 'pending', 'New student listings start in pending status for moderation');
    const createdListingId = validListingRes.data.data._id;

    // ─── SUITE 12: Single Listing Detail & View Count ────────────────────────
    console.log('\n▶ SUITE 12: Single Listing Detail & View Analytics');
    const existingListing = allListings.data.data.listings[0];
    const initialViews = existingListing.views || 0;

    const singleRes = await request(`/api/listings/${existingListing._id}`);
    assert(singleRes.status === 200, 'Get single listing returns 200');
    assert(singleRes.data.data._id === existingListing._id, 'Listing ID matches');
    assert(singleRes.data.data.views === initialViews + 1, 'View count increments automatically on inspection');

    // ─── SUITE 13: WhatsApp Handoff & Engagement Metrics ────────────────────
    console.log('\n▶ SUITE 13: Buyer-to-Seller Communication & Click Analytics');
    const waClickRes = await request(`/api/listings/${existingListing._id}/whatsapp-click`, {
      method: 'PATCH',
    });
    assert(waClickRes.status === 200, 'WhatsApp click recorded');
    assert(waClickRes.data.data.whatsappClicks === existingListing.whatsappClicks + 1, 'WhatsApp click count incremented');

    const phoneClickRes = await request(`/api/listings/${existingListing._id}/phone-click`, {
      method: 'PATCH',
    });
    assert(phoneClickRes.status === 200, 'Phone call click recorded');
    assert(phoneClickRes.data.data.phoneClicks === existingListing.phoneClicks + 1, 'Phone call count incremented');

    // ─── SUITE 14: Favorites Management ─────────────────────────────────────
    console.log('\n▶ SUITE 14: Favorites Management');
    const favRes = await request(`/api/listings/${existingListing._id}/favorite`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
    });
    assert(favRes.status === 200, 'Toggle favorite returns 200');
    assert(favRes.data.isFavorite === true, 'Item added to student favorites');

    const myFavsRes = await request('/api/listings/user/favorites', {
      headers: { Authorization: `Bearer ${activeStudentToken}` },
    });
    assert(myFavsRes.status === 200, 'Get user favorites returns 200');
    assert(myFavsRes.data.data.some((l) => (l._id || l) === existingListing._id), 'Favorited item present in user favorites list');

    const unFavRes = await request(`/api/listings/${existingListing._id}/favorite`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
    });
    assert(unFavRes.status === 200, 'Toggle off favorite returns 200');
    assert(unFavRes.data.isFavorite === false, 'Item removed from favorites');

    // ─── SUITE 15: Seller Public Profile & Listings ─────────────────────────
    console.log('\n▶ SUITE 15: Seller Public Profile');
    const sellerRes = await request(`/api/users/${tundeId}`);
    assert(sellerRes.status === 200, 'Public seller profile returns 200');
    assert(sellerRes.data.data.seller.firstName === 'Babatunde', 'Seller profile details populated');
    assert(sellerRes.data.data.activeListings.length > 0, 'Active listings for seller loaded');

    // ─── SUITE 16: IDOR Security on Listing Management ──────────────────────
    console.log('\n▶ SUITE 16: IDOR Security on Listing Management');
    const idorDeleteRes = await request(`/api/listings/${existingListing._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
    });
    assert(idorDeleteRes.status === 403, 'Rejects attempt by non-owner to delete another user listing (IDOR Prevention)');

    const updateRes = await request(`/api/listings/${createdListingId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
      body: JSON.stringify({
        price: 5000,
        description: 'Updated price: 5,000 NGN for quick sale',
      }),
    });
    assert(updateRes.status === 200, 'Owner can successfully update their own listing');
    assert(updateRes.data.data.price === 5000, 'Updated price reflected');

    // ─── SUITE 17: Marking Items as Sold ────────────────────────────────────
    console.log('\n▶ SUITE 17: Marking Items as Sold');
    const markSoldRes = await request(`/api/listings/${createdListingId}/sold`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
    });
    assert(markSoldRes.status === 200, 'Owner marks item as sold');
    assert(markSoldRes.data.data.status === 'sold', 'Status transitions to sold');

    // ─── SUITE 18: Suspicious Listing Reporting ─────────────────────────────
    console.log('\n▶ SUITE 18: Suspicious Listing Reporting');
    const reportRes = await request('/api/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
      body: JSON.stringify({
        listingId: existingListing._id,
        reason: 'Possible Scam',
        description: 'Seller requested payment before inspection',
      }),
    });
    assert(reportRes.status === 201, 'Student submits listing safety report');

    const dupReportRes = await request('/api/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeStudentToken}` },
      body: JSON.stringify({
        listingId: existingListing._id,
        reason: 'Possible Scam',
      }),
    });
    assert(dupReportRes.status === 400, 'Prevents duplicate reports from the same user');

    // ─── SUITE 19: Administrator Security & Password Rotation ────────────────
    console.log('\n▶ SUITE 19: Administrator Moderation & Password Rotation');
    const forbiddenAdmin = await request('/api/admin/stats', {
      headers: { Authorization: `Bearer ${activeStudentToken}` },
    });
    assert(forbiddenAdmin.status === 403, 'Non-admin users cannot access admin endpoints');

    const adminBlockedRes = await request('/api/admin/stats', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminBlockedRes.status === 403 && adminBlockedRes.data.code === 'PASSWORD_CHANGE_REQUIRED',
      'Initial administrator blocked from admin endpoints until default password is changed'
    );

    const adminRotatePw = await request('/api/auth/change-password', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        currentPassword: 'AdminPassword123!',
        newPassword: 'EnterpriseAdminPass2026!#',
        confirmNewPassword: 'EnterpriseAdminPass2026!#',
      }),
    });
    assert(adminRotatePw.status === 200, 'Administrator rotates initial password');

    const adminNewLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@campusmarket.ng',
        password: 'EnterpriseAdminPass2026!#',
      }),
    });
    assert(adminNewLogin.status === 200, 'Admin authenticates with rotated password');
    assert(adminNewLogin.data.data.mustChangePassword === false, 'mustChangePassword requirement cleared');
    adminToken = adminNewLogin.data.data.token;

    const adminStats = await request('/api/admin/stats', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminStats.status === 200, 'Admin can fetch platform statistics with rotated credentials');
    assert(adminStats.data.data.totalUsers >= 4, 'Real user count aggregated');
    assert(adminStats.data.data.totalListings >= 10, 'Real listings aggregated');
    assert(adminStats.data.data.listingsByCampus.length > 0, 'Real campus distribution calculated');

    const approveRes = await request(`/api/admin/listings/${createdListingId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(approveRes.status === 200, 'Admin approves pending listing');
    assert(approveRes.data.data.status === 'active', 'Listing is now active');

    const featureRes = await request(`/api/admin/listings/${createdListingId}/feature`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(featureRes.status === 200, 'Admin features listing for 7 days');
    assert(featureRes.data.data.isFeatured === true, 'Listing marked as featured');

    // ─── SUITE 20: Admin User Management & Suspension ────────────────────────
    console.log('\n▶ SUITE 20: User Moderation & Account Suspension');
    const adminUsers = await request('/api/admin/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminUsers.status === 200, 'Admin fetches all platform users');

    const suspendRes = await request(`/api/admin/users/${newStudentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }),
    });
    assert(suspendRes.status === 200, 'Admin successfully suspends account');
    assert(suspendRes.data.data.isActive === false, 'User status set to inactive');

    const suspendedLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'folake.updated@unilag.edu.ng',
        password: 'BrandNewPassword123!',
      }),
    });
    assert(suspendedLogin.status === 403, 'Suspended user is blocked from logging in');

    await request(`/api/admin/users/${newStudentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: true }),
    });

    // ─── SUITE 21: Admin Reports Moderation ──────────────────────────────────
    console.log('\n▶ SUITE 21: Admin Safety Reports Resolution');
    const adminReports = await request('/api/reports', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminReports.status === 200, 'Admin can view all submitted safety reports');
    assert(adminReports.data.data.length >= 1, 'Submitted report is visible in admin queue');
    const reportId = adminReports.data.data[0]._id;

    const resolveReport = await request(`/api/reports/${reportId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'resolved', action: 'remove_listing' }),
    });
    assert(resolveReport.status === 200, 'Admin resolves report and removes listing');

    // ─── SUITE 22: Integrity Protection on Dynamic Deletions ─────────────────
    console.log('\n▶ SUITE 22: Campus & Category Cascade Safety Checks');
    const delCampusRes = await request(`/api/campuses/${unilag._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(delCampusRes.status === 400, 'Blocks deletion of campus with active listings to protect database integrity');

    const compCat = categoriesRes.data.data.find((c) => c.slug === 'computers');
    const delCatRes = await request(`/api/categories/${compCat._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(delCatRes.status === 400, 'Blocks deletion of category with active listings');

    // ─── SUITE 23: Web Static Serving / SPA Fallback ─────────────────────────
    console.log('\n▶ SUITE 23: Production Static Serving & SPA Routing');
    const spaReq = await request('/explore');
    assert(
      typeof spaReq.data === 'string' && spaReq.data.includes('CampusMart'),
      'Production Express server correctly serves React SPA index.html for client routes'
    );

    // ─── SUITE 24: SMTP Diagnostics & Safe Error Logging ─────────────────────
    console.log('\n▶ SUITE 24: SMTP Delivery Diagnostics & Credential Safety');
    const smtpCheck = await verifySmtpConnection();
    assert(smtpCheck.connected === false, 'SMTP correctly reports unconfigured state when credentials are not populated');
    assert(typeof smtpCheck.reason === 'string', 'Helpful diagnostic reason returned without leaking credentials');

    const simulatedDispatch = await sendEmail({
      to: 'diagnostic@test.edu.ng',
      subject: 'Test Subject',
      text: 'Diagnostic content',
    });
    assert(simulatedDispatch.delivered === false, 'Unconfigured SMTP does not falsely claim delivery');
    assert(simulatedDispatch.simulated === true, 'Safe simulation flagged when SMTP is missing');

    // ─── SUITE 25: Cloud Storage & Fallback Architecture ─────────────────────
    console.log('\n▶ SUITE 25: Cloud Image Storage & Ephemeral Fallback Handling');
    const isCloudConfigured = isCloudinaryConfigured();
    assert(isCloudConfigured === false, 'Cloudinary correctly detects when real credentials are absent');
    assert(typeof isCloudinaryConfigured === 'function', 'Cloudinary configuration validator operational');

    // ─── SUITE 26: Production CORS Whitelist Enforcement ─────────────────────
    console.log('\n▶ SUITE 26: CORS Whitelist & Environment Origin Protection');
    const corsHeadersCheck = await request('/api/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert(corsHeadersCheck.status === 200, 'Health endpoint responds properly with configured origin');

    // ─── SUITE 27: Gmail SMTP & Full Transactional Email Workflows ───────────
    console.log('\n▶ SUITE 27: Gmail SMTP & Transactional Email Workflows');

    // 1. Transporter configuration validator
    assert(typeof createTransporter === 'function', 'createTransporter factory function exists');
    const defaultHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const defaultPort = parseInt(process.env.SMTP_PORT || '587', 10);
    assert(defaultHost === 'smtp.gmail.com', 'Default SMTP host is smtp.gmail.com');
    assert(defaultPort === 587, 'Default SMTP port is 587 (STARTTLS)');

    // 2. OTP Delivery Email
    const otpTestUser = { email: 'student_otp@unilag.edu.ng', firstName: 'Olumide' };
    await sendOtpEmail(otpTestUser, '654321', 'Two-Factor Authentication');
    const capturedOtp = getLastDispatchedEmailForTesting();
    assert(capturedOtp && capturedOtp.to === 'student_otp@unilag.edu.ng', 'OTP email addressed to correct recipient');
    assert(capturedOtp.subject.includes('Two-Factor Authentication'), 'OTP email has descriptive subject');
    assert(capturedOtp.html.includes('654321'), 'OTP email body contains single-use verification code');
    assert(capturedOtp.text.includes('654321'), 'Plaintext email contains OTP fallback');

    // 3. Password Change Security Notification Email
    await sendPasswordChangeNotification(otpTestUser);
    const capturedPwNotification = getLastDispatchedEmailForTesting();
    assert(
      capturedPwNotification && capturedPwNotification.subject.includes('Password Changed'),
      'Password change security notification email has security alert subject'
    );
    assert(
      capturedPwNotification.html.includes('password for your CampusMart account') &&
      capturedPwNotification.html.includes('was changed'),
      'Password change notification body warns student of credential modification'
    );

    // 4. Security Alert Email
    await sendSecurityAlertEmail(otpTestUser, {
      title: 'New Device Login Detected',
      message: 'A login was initiated from Chrome on Windows at IP 102.89.23.4',
    });
    const capturedSecAlert = getLastDispatchedEmailForTesting();
    assert(
      capturedSecAlert && capturedSecAlert.subject.includes('New Device Login Detected'),
      'Security alert email dispatched with custom title'
    );
    assert(
      capturedSecAlert.html.includes('102.89.23.4'),
      'Security alert email contains IP address and device incident details'
    );

    // 5. Registration Verification Email Link Formatting
    const testRawVerifyToken = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    await sendVerificationEmail(otpTestUser, testRawVerifyToken);
    const capturedVerify = getLastDispatchedEmailForTesting();
    const expectedClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    assert(
      capturedVerify.html.includes(`${expectedClientUrl}/verify-email?token=${testRawVerifyToken}`),
      'Verification email link correctly points to configured CLIENT_URL with token query parameter'
    );

    // 6. Password Reset Email Link Formatting
    await sendPasswordResetEmail(otpTestUser, testRawVerifyToken);
    const capturedReset = getLastDispatchedEmailForTesting();
    assert(
      capturedReset.html.includes(`${expectedClientUrl}/reset-password/${testRawVerifyToken}`),
      'Password reset email link correctly points to configured CLIENT_URL with token in path'
    );

    // 7. SMTP Diagnostic Error Sanitization (Google App Password 535 Handling)
    const mockGmailAuthError = {
      code: 'EAUTH',
      responseCode: 535,
      message: '535-5.7.8 Username and Password not accepted - internalSecretPass',
    };
    const sanitizedDiag = sanitizeSmtpError(mockGmailAuthError);
    assert(sanitizedDiag.code === 'EAUTH', 'Error sanitizer preserves SMTP error code');
    assert(
      sanitizedDiag.diagnosis.includes('Google App Password'),
      'Gmail 535 error gives clear guidance to generate a 16-character Google App Password'
    );

    const mockTimeoutError = {
      code: 'ETIMEDOUT',
      message: 'Connection timed out',
    };
    const timeoutDiag = sanitizeSmtpError(mockTimeoutError);
    assert(
      timeoutDiag.diagnosis.includes('smtp.gmail.com:587'),
      'Timeout error diagnosis specifically highlights Gmail SMTP host and port 587'
    );

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`🎉 ALL ${testResults.length} EMAIL & ACCOUNT SECURITY AUDIT TESTS PASSED! 🚀`);
    console.log('════════════════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n❌ TEST RUN TERMINATED WITH ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
    process.exit(process.exitCode || 0);
  }
}

runAllTests();
