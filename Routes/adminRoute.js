const express = require("express");

const {
  getOverview,
  getOwners,
  setOwnerStatus,
} = require("../Controllers/adminController");

const authMiddleware = require("../Middlewares/authMiddleware");
const { requireRole } = require("../Middlewares/authMiddleware");

const router = express.Router();

// Only the admin can use these routes
router.get("/overview", authMiddleware, requireRole("admin"), getOverview);
router.get("/owners", authMiddleware, requireRole("admin"), getOwners);
router.patch("/owners/:id/status", authMiddleware, requireRole("admin"), setOwnerStatus);

module.exports = router;
