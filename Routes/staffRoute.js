const express = require("express");

const {
  createStaff,
  getStaff,
  setStaffStatus,
} = require("../Controllers/staffController");

const authMiddleware = require("../Middlewares/authMiddleware");
const { requireRole } = require("../Middlewares/authMiddleware");

const router = express.Router();

// Only shop owners can manage their staff
router.post("/", authMiddleware, requireRole("owner"), createStaff);
router.get("/", authMiddleware, requireRole("owner"), getStaff);
router.patch("/:id/status", authMiddleware, requireRole("owner"), setStaffStatus);

module.exports = router;
