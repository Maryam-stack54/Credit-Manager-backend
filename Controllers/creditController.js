const mongoose = require("mongoose");
const creditModel = require("../Models/creditModel");
const customerModel = require("../Models/customerModel");

// Records goods a customer has taken on credit
const createCredit = async (req, res) => {
  try {
    const { customer, items, dueDate } = req.body;

    if (!customer || !items || items.length === 0 || !dueDate) {
      return res.status(400).json({
        message: "Customer, items, and due date are required"
      });
    }

    // A new credit cannot be due in the past
    if (new Date(dueDate) < new Date()) {
    return res.status(400).json({
    message: "Due date cannot be in the past",
  });
}

    // Make sure the customer belongs to the logged-in user
    const customerExists = await customerModel.findOne({
      _id: customer,
      user: req.user.userId,
    });

    if (!customerExists) {
      return res.status(404).json({
        message: "Customer not found",
      });
    }

    // Every item needs a name, a quantity above zero and a price that is not negative
    for (const item of items) {
  if (
    !item.name ||
    item.quantity <= 0 ||
    item.price < 0
  ) {
    return res.status(400).json({
      message: "Each item must have a name, valid quantity, and valid price",
    });
  }
}

    // Work out each item's total on the server instead of trusting the app
    const processedItems = items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    total: item.quantity * item.price,
}));
    // The credit total is the sum of its item totals
    const totalAmount = processedItems.reduce(
      (sum, item) => sum + item.total,
      0
    );

    // A new credit starts unpaid, so its balance equals its total
    const credit = await creditModel.create({
      customer,
      user: req.user.userId,
      items: processedItems,
      totalAmount,
      balance: totalAmount,
      status: "Pending",
      dueDate,
    });

    return res.status(201).json({
      message: "Credit created successfully",
      credit,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

// Lists the logged-in user's credits with each customer's details
const getCredits = async (req, res) => {
  try {
    const credits = await creditModel
      .find({ user: req.user.userId })
      .populate({
        path: "customer",
        match: { user: req.user.userId },
        select: "name phone address",
      });

    // Leave out credits whose customer has been deleted
    const userCredits = credits.filter((credit) => credit.customer);

    return res.status(200).json({
      credits: userCredits,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

// Returns one credit, only if it belongs to the logged-in user
const getCredit = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid credit ID",
  });
}
    const credit = await creditModel
      .findOne({ _id: req.params.id, user: req.user.userId })
      .populate({
        path: "customer",
        match: { user: req.user.userId },
        select: "name phone address",
      });

    if (!credit || !credit.customer) {
      return res.status(404).json({
        message: "Credit not found",
      });
    }

    return res.status(200).json({
      credit,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};


// Records a payment and updates the balance and status
const addPayment = async (req, res) => {
  try {
    const { amount, method, note } = req.body;

    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        message: "A valid payment amount is required",
  });
}
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
         message: "Invalid credit ID",
  });
}
    const credit = await creditModel
      .findOne({ _id: req.params.id, user: req.user.userId })
      .populate({
        path: "customer",
        match: { user: req.user.userId },
      });

    if (!credit || !credit.customer) {
      return res.status(404).json({
        message: "Credit not found",
      });
    }

    // A payment cannot be more than what is still owed
    if (amount > credit.balance) {
      return res.status(400).json({
        message: "Payment cannot be greater than the outstanding balance",
      });
    }

    credit.payments.push({
      amount,
      method,
      note,
    });

    // Add up every payment made so far
    const totalPaid = credit.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );

    // The balance is always the total minus everything paid
    credit.balance = credit.totalAmount - totalPaid;

    // Paid when nothing is left, Partially Paid once anything has been paid
    if (credit.balance === 0) {
      credit.status = "Paid";
    } else if (totalPaid > 0) {
      credit.status = "Partially Paid";
    }

    await credit.save();

    return res.status(200).json({
      message: "Payment added successfully",
      credit,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};


// Edits a credit's items or due date while keeping its payments
const updateCredit = async (req, res) => { 
  try {
    const { items, dueDate } = req.body;
    console.log("Received dueDate:", dueDate);

    if (!items || items.length === 0 || !dueDate) {
      return res.status(400).json({
        message: "Items and due date are required",
      });
    }

    if (new Date(dueDate) < new Date()) {
      return res.status(400).json({
        message: "Due date cannot be in the past",
  });
}

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid credit ID",
  });
}
    const credit = await creditModel
      .findOne({ _id: req.params.id, user: req.user.userId })
      .populate({
        path: "customer",
        match: { user: req.user.userId },
      });

    if (!credit || !credit.customer) {
      return res.status(404).json({
        message: "Credit not found",
      });
    }

    for (const item of items) {
  if (
    !item.name ||
    item.quantity <= 0 ||
    item.price < 0
  ) {
    return res.status(400).json({
      message: "Each item must have a name, valid quantity, and valid price",
    });
  }
}

    const processedItems = items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    total: item.quantity * item.price,
}));
    const totalAmount = processedItems.reduce(
      (sum, item) => sum + item.total,
      0
    );

    const totalPaid = credit.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );

    // The new total cannot be less than what the customer has already paid
    if (totalAmount < totalPaid) {
      return res.status(400).json({
        message: "Credit total cannot be less than the amount already paid",
      });
    }

    credit.items = processedItems;
    credit.totalAmount = totalAmount;
    // Recalculate the balance from the new total
    credit.balance = totalAmount - totalPaid;
    credit.dueDate = dueDate;

    // Recalculate the status from the new balance
    if (credit.balance === 0) {
      credit.status = "Paid";
    } else if (totalPaid > 0) {
      credit.status = "Partially Paid";
    } else {
      credit.status = "Pending";
    }

    await credit.save();

    return res.status(200).json({
      message: "Credit updated successfully",
      credit,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
}


;
// Deletes a credit, but only if no payments have been recorded on it
const deleteCredit = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
         message: "Invalid credit ID",
  });
}
    const credit = await creditModel
      .findOne({ _id: req.params.id, user: req.user.userId })
      .populate({
        path: "customer",
        match: { user: req.user.userId },
      });

    if (!credit || !credit.customer) {
      return res.status(404).json({
        message: "Credit not found",
      });
    }

    if (credit.payments.length > 0) {
      return res.status(400).json({
        message: "Cannot delete a credit that has payments",
      });
    }

    await creditModel.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      message: "Credit deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};


module.exports = {
  createCredit,
  getCredits,
  getCredit,
  addPayment,
  updateCredit,
  deleteCredit
};