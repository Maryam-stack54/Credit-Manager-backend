const mongoose = require("mongoose");

// Shape of any account in the database: shop owner, staff member or admin
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Login name, stored in lowercase and unique across all users
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    // Only the bcrypt hash is stored, never the real password
    password: {
      type: String,
      required: true,
    },

    // Optional business details shown in the profile and WhatsApp reminders
    businessName: {
      type: String,
      trim: true,
    },

    businessPhone: {
      type: String,
      trim: true,
    },

    businessAddress: {
      type: String,
      trim: true,
    },

    // What this person can do: "owner" runs a shop, "staff" works for one
    // owner, and "admin" manages the whole system. Anyone who registers
    // through the app is always an owner.
    role: {
      type: String,
      enum: ["owner", "staff", "admin"],
      default: "owner",
      index: true,
    },

    // For staff only: the shop owner they work for
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userModel",
      index: true,
    },

    // A turned-off account cannot log in or use the app
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Export the model so controllers can read and write users
module.exports = mongoose.model("userModel", userSchema);