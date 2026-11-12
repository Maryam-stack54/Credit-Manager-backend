const mongoose = require("mongoose");
const customerModel = require("../Models/customerModel");
const creditModel = require("../Models/creditModel");
const counterModel = require("../Models/counterModel");

// Hands out the shop's next customer code: CUS-0001, CUS-0002, and so on.
// The counter only goes up and is increased in one step by the database,
// so two people adding customers at the same moment never get the same
// number, and a deleted customer's number is never given out again.
const nextCustomerCode = async (shopId) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const counter = await counterModel.findOneAndUpdate(
        { _id: `customer:${shopId}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" }
      );

      return `CUS-${String(counter.seq).padStart(4, "0")}`;
    } catch (error) {
      // Two first-ever requests can race to create the counter, so try again
      if (error.code !== 11000) throw error;
    }
  }

  throw new Error("Could not generate a customer code");
};

// Reduces a phone number to digits so "0803 123 4567" and "+234 803 123 4567"
// count as the same number
const normalizePhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.startsWith("234") && digits.length >= 13) {
    return `0${digits.slice(3)}`;
  }

  return digits;
};

// Adds a customer to the logged-in person's shop
const createCustomer = async (req, res) => {
  try {
    const { name, phone, address, confirmDuplicate } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        message: "Name and phone are required",
      });
    }

    if (name && name.trim().length < 2) {
       return res.status(400).json({
          message: "Name must be at least 2 characters",
  });
}

    // If this shop already has a customer with the same phone number, ask
    // first. The app sends confirmDuplicate: true when the user says yes.
    if (confirmDuplicate !== true) {
      const wanted = normalizePhone(phone);

      if (wanted) {
        const shopCustomers = await customerModel
          .find({ user: req.user.shopId })
          .select("name phone code");

        const existing = shopCustomers.find(
          (customer) => normalizePhone(customer.phone) === wanted
        );

        if (existing) {
          return res.status(409).json({
            message:
              "A customer with this phone number already exists. Add anyway?",
            duplicatePhone: true,
            existingCustomer: {
              id: existing._id,
              name: existing.name,
              phone: existing.phone,
              code: existing.code,
            },
          });
        }
      }
    }

    // Link the customer to the shop. The server makes the code itself,
    // and the database rejects a repeat if one ever slipped through.
    let customer;

    for (let attempt = 0; attempt < 5 && !customer; attempt++) {
      try {
        customer = await customerModel.create({
          name,
          phone,
          address,
          user: req.user.shopId,
          code: await nextCustomerCode(req.user.shopId),
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }

    if (!customer) {
      return res.status(500).json({
        message: "Server error",
      });
    }

    return res.status(201).json({
      message: "Customer created successfully",
      customer,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};
// Lists only the logged-in user's customers
const getCustomers = async (req, res) => {
  try {
    const customers = await customerModel.find({
      user: req.user.shopId,
    });

    return res.status(200).json({
      customers,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

// Returns one customer, only if it belongs to the logged-in user
const getCustomer = async (req, res) => {
  try {
    // Reject IDs that are not valid MongoDB IDs
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid customer ID",
  });
}
    const customer = await customerModel.findOne({
      _id: req.params.id,
      user: req.user.shopId,
    });

    if (!customer) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      customer,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

// Edits a customer's name, phone or address
const updateCustomer = async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       return res.status(400).json({
         message: "Invalid customer ID",
  });
}
    // Update only if the customer belongs to the logged-in user
    const customer = await customerModel.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.shopId,
      },
      {
        name,
        phone,
        address,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!customer) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      message: "Customer updated successfully",
      customer,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

// Deletes a customer, but never one who still owes money
const deleteCustomer = async (req, res) => {
  try {

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid customer ID",
  });
}
    const customer = await customerModel.findOne({
      _id: req.params.id,
      user: req.user.shopId,
    });

    if (!customer) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    // A customer who still owes money cannot be deleted, otherwise that
    // debt would silently disappear from the records
    const credits = await creditModel.find({
      customer: customer._id,
      user: req.user.shopId,
    });

    // Total still owed across all their credits
    const outstanding = credits.reduce(
      (sum, credit) => sum + credit.balance,
      0
    );

    if (outstanding > 0) {
      return res.status(400).json({
        message: `${customer.name} still owes ₦${outstanding.toLocaleString()}. Record their payments before deleting them.`,
      });
    }

    // Their credits are all paid, so remove them together with the customer
    await creditModel.deleteMany({
      customer: customer._id,
      user: req.user.shopId,
    });

    await customer.deleteOne();

    return res.status(200).json({
      message: "Customer deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};
module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
};
