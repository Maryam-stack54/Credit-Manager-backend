const mongoose = require("mongoose");

// Shape of a shop owner's account in the database
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
  },
  {
    timestamps: true,
  }
);

// Export the model so controllers can read and write users
module.exports = mongoose.model("userModel", userSchema);