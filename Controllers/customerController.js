const mongoose = require("mongoose");
const customerModel = require("../Models/customerModel");
const creditModel = require("../Models/creditModel");

// Adds a customer for the logged-in shop owner
const createCustomer = async (req, res) => {
  try {
    const { name, phone, address } = req.body;

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

    // Link the customer to the logged-in user
    const customer = await customerModel.create({
      name,
      phone,
      address,
      user: req.user.userId,
    });

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
      user: req.user.userId,
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
      user: req.user.userId,
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
        user: req.user.userId,
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
      user: req.user.userId,
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
      user: req.user.userId,
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
      user: req.user.userId,
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
