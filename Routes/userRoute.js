const express = require("express");

const {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  changePassword,
} = require("../Controllers/userController");

const authMiddleware = require("../Middlewares/authMiddleware");
const {
  loginLimiter,
  registerLimiter,
} = require("../Middlewares/rateLimiters");

const router = express.Router();

// Public routes, rate limited to stop abuse and password guessing
router.post("/register", registerLimiter, registerUser);
router.post("/login", loginLimiter, loginUser);

// Profile routes, only for logged-in users
router.get("/me", authMiddleware, getProfile);
router.put("/me", authMiddleware, updateProfile);
router.put("/change-password", authMiddleware, changePassword);

module.exports = router;
