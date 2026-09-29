import mongoose from 'mongoose';

const listingSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Seller is required'],
    },
    title: {
      type: String,
      required: [true, 'Listing title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    campus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campus',
      required: [true, 'Campus is required'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price must be positive'],
    },
    condition: {
      type: String,
      enum: ['New', 'Like New', 'Good', 'Fair'],
      required: [true, 'Condition is required'],
    },
    location: {
      type: String,
      required: [true, 'Location on campus is required'],
      trim: true,
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'At least one image is required',
      },
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'rejected', 'sold', 'removed'],
      default: 'pending',
    },
    views: {
      type: Number,
      default: 0,
    },
    whatsappClicks: {
      type: Number,
      default: 0,
    },
    phoneClicks: {
      type: Number,
      default: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    featuredUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast searching and filtering
listingSchema.index({ title: 'text', description: 'text', location: 'text' });
listingSchema.index({ campus: 1, category: 1, status: 1, price: 1, createdAt: -1 });

const Listing = mongoose.model('Listing', listingSchema);
export default Listing;
