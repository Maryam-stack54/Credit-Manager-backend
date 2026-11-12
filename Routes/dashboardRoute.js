const express = require("express");

const {
  getDashboardOverview,
} = require("../Controllers/dashboardController");

const authMiddleware = require("../Middlewares/authMiddleware");
const { requireRole } = require("../Middlewares/authMiddleware");

const router = express.Router();

// Returns every figure shown on the Home screen in one request.
// Only shop owners see the dashboard totals.
router.get("/overview", authMiddleware, requireRole("owner"), getDashboardOverview);

module.exports = router;
