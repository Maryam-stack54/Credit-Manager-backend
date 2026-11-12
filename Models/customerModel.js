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

    // The customer's own code, like CUS-0001. It is made by the server when
    // the customer is added and can never be changed afterwards.
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// No two customers in the same shop can share a code. The database enforces
// this itself. The index skips customers that have no code yet, so it can
// be built before the one-time update has given the old customers theirs.
customerSchema.index(
  { user: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } }
);

// Reuse the model if it was already compiled, otherwise create it
module.exports =
  mongoose.models.Customer || mongoose.model("Customer", customerSchema);