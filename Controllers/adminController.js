const mongoose = require("mongoose");
const userModel = require("../Models/userModel");
const customerModel = require("../Models/customerModel");
const creditModel = require("../Models/creditModel");

// The admin manages the system, not the shops. Everything here works with
// counts only. It never returns a customer, a credit, or any money amount,
// so the admin cannot see who owes what.

// Turns a list of { _id, n } counts into a lookup by owner ID
const toCountMap = (rows) => {
  const map = {};
  rows.forEach((row) => {
    map[String(row._id)] = row.n;
  });
  return map;
};

// Overall totals for the whole system
const getOverview = async (req, res) => {
  try {
    const [owners, activeOwners, staff, activeStaff, customers, credits] =
      await Promise.all([
        userModel.countDocuments({ role: "owner" }),
        userModel.countDocuments({ role: "owner", isActive: { $ne: false } }),
        userModel.countDocuments({ role: "staff" }),
        userModel.countDocuments({ role: "staff", isActive: { $ne: false } }),
        customerModel.countDocuments({}),
        creditModel.countDocuments({}),
      ]);

    return res.status(200).json({
      totals: {
        owners,
        activeOwners,
        disabledOwners: owners - activeOwners,
        staff,
        activeStaff,
        customers,
        credits,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

// Lists every shop owner with how many staff, customers and credits they have
const getOwners = async (req, res) => {
  try {
    const owners = await userModel
      .find({ role: "owner" })
      .select("name username businessName isActive createdAt")
      .sort({ createdAt: 1 })
      .lean();

    const [staffCounts, customerCounts, creditCounts] = await Promise.all([
      userModel.aggregate([
        { $match: { role: "staff" } },
        { $group: { _id: "$owner", n: { $sum: 1 } } },
      ]),
      customerModel.aggregate([{ $group: { _id: "$user", n: { $sum: 1 } } }]),
      creditModel.aggregate([{ $group: { _id: "$user", n: { $sum: 1 } } }]),
    ]);

    const staffByOwner = toCountMap(staffCounts);
    const customersByOwner = toCountMap(customerCounts);
    const creditsByOwner = toCountMap(creditCounts);

    return res.status(200).json({
      owners: owners.map((owner) => ({
        id: owner._id,
        name: owner.name,
        username: owner.username,
        businessName: owner.businessName || "",
        isActive: owner.isActive !== false,
        createdAt: owner.createdAt,
        staffCount: staffByOwner[String(owner._id)] || 0,
        customerCount: customersByOwner[String(owner._id)] || 0,
        creditCount: creditsByOwner[String(owner._id)] || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

// Turns a shop owner's account on or off. While it is off, the owner and
// all of their staff are unable to log in.
const setOwnerStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid owner ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be true or false",
      });
    }

    const owner = await userModel.findOneAndUpdate(
      { _id: req.params.id, role: "owner" },
      { isActive },
      { returnDocument: "after" }
    );

    if (!owner) {
      return res.status(404).json({
        message: "Shop owner not found",
      });
    }

    return res.status(200).json({
      message: isActive ? "Account turned on" : "Account turned off",
      owner: {
        id: owner._id,
        name: owner.name,
        username: owner.username,
        isActive: owner.isActive !== false,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  getOverview,
  getOwners,
  setOwnerStatus,
};
