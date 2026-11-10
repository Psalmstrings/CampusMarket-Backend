import mongoose from 'mongoose';
import User from './models/User.js';
import Campus from './models/Campus.js';
import Category from './models/Category.js';
import Listing from './models/Listing.js';

export const autoSeedData = async () => {
  try {
    const campusCount = await Campus.countDocuments();
    if (campusCount > 0) {
      console.log('🌱 Database already populated. Skipping auto-seed.');
      return;
    }

    console.log('🌱 Seeding initial CampusMarket database...');

    // 1. Seed Campuses
    const campuses = await Campus.insertMany([
      {
        name: 'University of Lagos',
        shortName: 'UNILAG',
        location: 'Akoka, Lagos',
        description: 'First Choice and the Nations Pride',
        isActive: true,
      },
      {
        name: 'Yaba College of Technology',
        shortName: 'YABATECH',
        location: 'Yaba, Lagos',
        description: 'First higher educational institution in Nigeria',
        isActive: true,
      },
      {
        name: 'Lagos State University',
        shortName: 'LASU',
        location: 'Ojo, Lagos',
        description: 'Per Excellentia - For Excellence',
        isActive: true,
      },
    ]);

    const unilag = campuses.find((c) => c.shortName === 'UNILAG');
    const yabatech = campuses.find((c) => c.shortName === 'YABATECH');
    const lasu = campuses.find((c) => c.shortName === 'LASU');

    // 2. Seed Categories
    const categoriesData = [
      { name: 'Electronics', slug: 'electronics', icon: 'Tv', description: 'Gadgets, appliances, and audio gear' },
      { name: 'Phones & Accessories', slug: 'phones-accessories', icon: 'Smartphone', description: 'Smartphones, chargers, cases, and earbuds' },
      { name: 'Computers', slug: 'computers', icon: 'Laptop', description: 'Laptops, desktops, monitors, and computer accessories' },
      { name: 'Books & Academics', slug: 'books-academics', icon: 'BookOpen', description: 'Textbooks, handouts, past questions, and stationery' },
      { name: 'Fashion', slug: 'fashion', icon: 'Shirt', description: 'Clothes, jerseys, vintage wear, and accessories' },
      { name: 'Shoes & Bags', slug: 'shoes-bags', icon: 'ShoppingBag', description: 'Sneakers, sandals, heels, backpacks, and totes' },
      { name: 'Hostel & Home', slug: 'hostel-home', icon: 'Home', description: 'Mattresses, fans, hotplates, reading tables, and decors' },
      { name: 'Food', slug: 'food', icon: 'UtensilsCrossed', description: 'Campus snacks, meals, meal plans, and pastries' },
      { name: 'Beauty', slug: 'beauty', icon: 'Sparkles', description: 'Skincare, hair care, perfumes, and cosmetics' },
      { name: 'Services', slug: 'services', icon: 'Wrench', description: 'Graphics, coding, laundry, hair styling, tutorials' },
      { name: 'Jobs & Gigs', slug: 'jobs-gigs', icon: 'Briefcase', description: 'Campus ambassador gigs, tutoring, and part-time tasks' },
      { name: 'Sports & Fitness', slug: 'sports-fitness', icon: 'Trophy', description: 'Gym equipment, sports wears, and footballs' },
      { name: 'Vehicles', slug: 'vehicles', icon: 'Car', description: 'Bicycles, power bikes, scooters, and parts' },
      { name: 'Others', slug: 'others', icon: 'Package', description: 'Miscellaneous student items' },
    ];

    const categories = await Category.insertMany(categoriesData);

    const getCat = (slug) => categories.find((c) => c.slug === slug)._id;

    // 3. Seed Users
    const adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'CampusMarket',
      email: 'admin@campusmarket.ng',
      phone: '08012345678',
      password: 'AdminPassword123!',
      campus: unilag._id,
      department: 'Management Information Systems',
      level: 'Staff',
      role: 'admin',
      isVerified: true,
      mustChangePassword: true,
      profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
    });

    const studentUnilag = await User.create({
      firstName: 'Babatunde',
      lastName: 'Adeyemi',
      email: 'tunde@unilag.edu.ng',
      phone: '08031234567',
      password: 'Password123!',
      campus: unilag._id,
      department: 'Computer Sciences',
      level: '400L',
      role: 'student',
      isVerified: true,
      profileImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=300&auto=format&fit=crop&q=80',
    });

    const studentYabatech = await User.create({
      firstName: 'Chioma',
      lastName: 'Okonkwo',
      email: 'chioma@yabatech.edu.ng',
      phone: '08098765432',
      password: 'Password123!',
      campus: yabatech._id,
      department: 'Civil Engineering',
      level: 'ND II',
      role: 'student',
      isVerified: true,
      profileImage: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
    });

    const vendorLasu = await User.create({
      firstName: 'Khalid',
      lastName: 'Ibrahim',
      email: 'khalid@lasu.edu.ng',
      phone: '08123456789',
      password: 'Password123!',
      campus: lasu._id,
      department: 'Business Administration',
      level: '300L',
      role: 'vendor',
      isVerified: true,
      profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    });

    // 4. Seed Listings
    const listingsData = [
      // UNILAG
      {
        seller: studentUnilag._id,
        campus: unilag._id,
        category: getCat('computers'),
        title: 'HP EliteBook 840 G5 (Core i5, 16GB RAM, 256GB SSD)',
        description: 'Clean UK used HP EliteBook 840 G5 with backlit keyboard, crisp FHD display, fast fingerprint scanner, and 5-hour battery life. Ideal for coding and engineering software. Includes original HP charger.',
        price: 280000,
        condition: 'Like New',
        location: 'Moremi Hall, UNILAG',
        images: [
          'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: true,
        views: 142,
        whatsappClicks: 18,
        phoneClicks: 5,
      },
      {
        seller: studentUnilag._id,
        campus: unilag._id,
        category: getCat('books-academics'),
        title: "Thomas' Calculus (14th Edition) Hardcover",
        description: 'Complete calculus textbook with all exercise solutions. In great condition without missing pages. Must-have for 100L/200L engineering and math students.',
        price: 6500,
        condition: 'Good',
        location: 'Faculty of Engineering, UNILAG',
        images: [
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: false,
        views: 65,
        whatsappClicks: 7,
        phoneClicks: 2,
      },
      {
        seller: studentUnilag._id,
        campus: unilag._id,
        category: getCat('shoes-bags'),
        title: 'Nike Air Jordan 1 Retro High (Size 43 EU)',
        description: 'Brand new Jordan 1 high tops in royal blue colorway. Never worn outside, includes spare laces and original box.',
        price: 38000,
        condition: 'New',
        location: 'New Hall, UNILAG',
        images: [
          'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: true,
        views: 98,
        whatsappClicks: 14,
        phoneClicks: 3,
      },
      {
        seller: studentUnilag._id,
        campus: unilag._id,
        category: getCat('services'),
        title: 'Professional Graphic Design & Flyer Branding',
        description: 'Need fast, creative flyers, business cards, event banners, or brand identity for your campus business or event? 24-hour turnaround with unlimited revisions.',
        price: 15000,
        condition: 'New',
        location: 'Mariere Hall, UNILAG',
        images: [
          'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: false,
        views: 47,
        whatsappClicks: 9,
        phoneClicks: 1,
      },

      // YABATECH
      {
        seller: studentYabatech._id,
        campus: yabatech._id,
        category: getCat('books-academics'),
        title: 'Higher Engineering Mathematics by B.S. Grewal',
        description: 'Standard textbook for National Diploma and Higher National Diploma engineering courses at YABATECH. Clean pages with minimal highlighting.',
        price: 8000,
        condition: 'Good',
        location: 'School of Engineering, YABATECH',
        images: [
          'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: false,
        views: 52,
        whatsappClicks: 6,
        phoneClicks: 2,
      },
      {
        seller: studentYabatech._id,
        campus: yabatech._id,
        category: getCat('computers'),
        title: 'Used Dell Latitude 7490 (Core i7, 16GB RAM, 512GB SSD)',
        description: 'Workstation laptop in mint condition. Touchscreen display, powerful performance for rendering and multi-tasking. Excellent battery health.',
        price: 220000,
        condition: 'Good',
        location: 'Moshood Abiola Hall, YABATECH',
        images: [
          'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: true,
        views: 110,
        whatsappClicks: 21,
        phoneClicks: 6,
      },
      {
        seller: studentYabatech._id,
        campus: yabatech._id,
        category: getCat('phones-accessories'),
        title: 'Original Apple 20W Fast USB-C Charger & Cable',
        description: 'Authentic 20W USB-C power adapter and heavy duty braided cable. Fast charges iPhone 11 to 16 models in 30 minutes. Tested and working 100%.',
        price: 12500,
        condition: 'New',
        location: 'Bakassi Hall, YABATECH',
        images: [
          'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: false,
        views: 74,
        whatsappClicks: 11,
        phoneClicks: 4,
      },
      {
        seller: studentYabatech._id,
        campus: yabatech._id,
        category: getCat('fashion'),
        title: 'Men Vintage Oversized Corduroy Shirt (Large)',
        description: 'Thrifted heavyweight quality corduroy casual shirt in olive green. Stylish and perfect for campus lectures and hangouts.',
        price: 14000,
        condition: 'Like New',
        location: 'Sports Complex, YABATECH',
        images: [
          'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: false,
        views: 39,
        whatsappClicks: 5,
        phoneClicks: 1,
      },

      // LASU
      {
        seller: vendorLasu._id,
        campus: lasu._id,
        category: getCat('shoes-bags'),
        title: 'Waterproof Anti-Theft College Laptop Backpack with USB Port',
        description: 'Multi-compartment 15.6 inch waterproof backpack with built-in USB charging port and anti-theft back pocket. Heavy duty zippers and ergonomic padded straps.',
        price: 18500,
        condition: 'New',
        location: 'Faculty of Management Sciences, LASU',
        images: [
          'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: true,
        views: 89,
        whatsappClicks: 16,
        phoneClicks: 3,
      },
      {
        seller: vendorLasu._id,
        campus: lasu._id,
        category: getCat('books-academics'),
        title: 'LASU General Studies (GST) & Law Past Questions Compendium',
        description: 'Comprehensive 5-year past question bank with verified solutions for all 100L and 200L GST courses plus intro law modules. High pass rate booster.',
        price: 3500,
        condition: 'Good',
        location: 'Eco Library, LASU',
        images: [
          'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: false,
        views: 43,
        whatsappClicks: 8,
        phoneClicks: 2,
      },
      {
        seller: vendorLasu._id,
        campus: lasu._id,
        category: getCat('food'),
        title: 'Campus Chow Box: Smoky Party Jollof Rice with Fried Chicken',
        description: 'Freshly prepared hot smokey Jollof rice served with spiced fried chicken and plantain dodo. Fast delivery to any faculty or hostel on LASU Ojo campus.',
        price: 3000,
        condition: 'New',
        location: 'Student Union Building (SUB), LASU',
        images: [
          'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: true,
        views: 120,
        whatsappClicks: 35,
        phoneClicks: 8,
      },
      {
        seller: vendorLasu._id,
        campus: lasu._id,
        category: getCat('services'),
        title: 'Campus Convocation & Portrait Studio Photography Session',
        description: 'High-definition digital portrait package including 5 retouched soft copies, customized digital backdrop, and instant mobile transfer. Book ahead of your event.',
        price: 25000,
        condition: 'New',
        location: 'Badagry Gate, LASU',
        images: [
          'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'active',
        isFeatured: false,
        views: 61,
        whatsappClicks: 12,
        phoneClicks: 3,
      },

      // Sample Pending Listing for Admin Demo
      {
        seller: studentUnilag._id,
        campus: unilag._id,
        category: getCat('electronics'),
        title: 'Sony PlayStation 4 Slim (500GB) with 2 Wireless Controllers',
        description: 'Clean PS4 Slim in top working order. Comes with FIFA 23, God of War, HDMI cable, power chord, and two original DualShock 4 controllers. Ready for pickup in Jaja.',
        price: 175000,
        condition: 'Good',
        location: 'Jaja Hall, UNILAG',
        images: [
          'https://images.unsplash.com/photo-1507457379470-08b800bebc67?w=800&auto=format&fit=crop&q=80',
        ],
        status: 'pending',
        isFeatured: false,
        views: 0,
        whatsappClicks: 0,
        phoneClicks: 0,
      },
    ];

    await Listing.insertMany(listingsData);

    console.log('✅ CampusMarket database successfully seeded with initial campuses, categories, users, and listings!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
  }
};
