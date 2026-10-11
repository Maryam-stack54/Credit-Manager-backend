const express = require("express");

const {
  getDashboardOverview,
} = require("../Controllers/dashboardController");

const authMiddleware = require("../Middlewares/authMiddleware");

const router = express.Router();

// Returns every figure shown on the Home screen in one request
router.get("/overview", authMiddleware, getDashboardOverview);

module.exports = router;