const mongoose = require("mongoose");

// Shape of a customer who buys goods on credit
const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    // The shop owner this customer belongs to, so users only see their own customers
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userModel",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Reuse the model if it was already compiled, otherwise create it
module.exports =
  mongoose.models.Customer || mongoose.model("Customer", customerSchema);