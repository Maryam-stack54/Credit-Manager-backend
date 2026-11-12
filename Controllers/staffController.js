const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userModel = require("../Models/userModel");

// The staff fields that are safe to send back to the app (no password)
const formatStaff = (staff) => ({
  id: staff._id,
  name: staff.name,
  username: staff.username,
  isActive: staff.isActive !== false,
  createdAt: staff.createdAt,
});

// Adds a staff member who works for the logged-in shop owner
const createStaff = async (req, res) => {
  try {
    const { name } = req.body;
    // Spaces at either end of a password are never saved
    const password = req.body.password?.trim();
    // Usernames are case-insensitive, so always compare them in lowercase
    const username = req.body.username?.trim().toLowerCase();

    if (!name || !username || !password) {
      return res.status(400).json({
        message: "Name, username, and password are required",
      });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({
        message: "Name must be at least 2 characters",
      });
    }

    // Only allow 3 to 20 letters, numbers, underscores or dots
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
      return res.status(400).json({
        message:
          "Username must be 3-20 characters and contain only letters, numbers, underscores or dots",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    // Usernames are unique across owners, staff and admins
    const existingUser = await userModel.findOne({ username });

    if (existingUser) {
      return res.status(400).json({
        message: "Username already taken",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const staff = await userModel.create({
      name,
      username,
      password: hashedPassword,
      role: "staff",
      owner: req.user.userId,
    });

    return res.status(201).json({
      message: "Staff member added successfully",
      staff: formatStaff(staff),
    });
  } catch (error) {
    // Two people picking the same username at the same moment
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Username already taken",
      });
    }

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Lists only the logged-in owner's staff
const getStaff = async (req, res) => {
  try {
    const staff = await userModel
      .find({ role: "staff", owner: req.user.userId })
      .sort({ createdAt: 1 });

    return res.status(200).json({
      staff: staff.map(formatStaff),
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

// Turns a staff member's access on or off
const setStaffStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid staff ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be true or false",
      });
    }

    // Only this owner's own staff can be changed
    const staff = await userModel.findOneAndUpdate(
      { _id: req.params.id, role: "staff", owner: req.user.userId },
      { isActive },
      { returnDocument: "after" }
    );

    if (!staff) {
      return res.status(404).json({
        message: "Staff member not found",
      });
    }

    return res.status(200).json({
      message: isActive ? "Staff access turned on" : "Staff access turned off",
      staff: formatStaff(staff),
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  createStaff,
  getStaff,
  setStaffStatus,
};
