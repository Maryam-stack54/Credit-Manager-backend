const express = require("express");

const {
  createCredit, getCredits, getCredit, addPayment, updateCredit,deleteCredit
} = require("../Controllers/creditController");

const authMiddleware = require("../Middlewares/authMiddleware");

const router = express.Router();

// All credit routes require a valid login token
router.post("/createCredit", authMiddleware, createCredit);
router.get("/getCredits", authMiddleware, getCredits);
router.get("/getCredit/:id", authMiddleware, getCredit);
router.post("/addPayment/:id", authMiddleware, addPayment);
router.put("/updateCredit/:id", authMiddleware, updateCredit);
router.delete("/deleteCredit/:id", authMiddleware, deleteCredit);

module.exports = router;