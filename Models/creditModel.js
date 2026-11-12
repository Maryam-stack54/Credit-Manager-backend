const mongoose = require("mongoose");

// Shape of one credit: what a customer took and what they have paid back
const creditSchema = new mongoose.Schema(
  {
    // The customer who took the goods
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    // The shop owner, indexed so each user's credits can be fetched directly
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userModel",
      required: true,
      index: true,
    },

    // The person (owner or staff) who recorded this credit
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userModel",
    },

    // Goods taken on credit, each with its own quantity, price and total
    items: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },

        quantity: {
          type: Number,
          required: true,
          min: 1,
        },

        price: {
          type: Number,
          required: true,
          min: 0,
        },

        total: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],

    // Sum of all item totals
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Every payment made towards this credit
    payments: [
      {
        amount: {
          type: Number,
          required: true,
          min: 0,
        },

        method: {
          type: String,
          enum: ["Cash", "POS", "Bank Transfer", "Other"],
          default: "Cash",
        },

        note: {
          type: String,
          trim: true,
        },

        date: {
          type: Date,
          default: Date.now,
        },

        // The person (owner or staff) who recorded this payment
        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "userModel",
        },
      },
    ],

    // What is still owed: total amount minus all payments
    balance: {
      type: Number,
      required: true,
      min: 0,
    },

    // Worked out from the balance after every change
    status: {
      type: String,
      enum: ["Pending", "Partially Paid", "Paid"],
      default: "Pending",
    },

    creditDate: {
      type: Date,
      default: Date.now,
    },

    // The date the customer promised to pay by
    dueDate: {
    type: Date,
    required: true,
},

  },
  {
    timestamps: true,
  }
);

// Export the model so controllers can read and write credits
module.exports = mongoose.model("Credit", creditSchema);