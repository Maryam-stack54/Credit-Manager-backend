const express = require("express");

const {
  createCredit, getCredits, getCredit, addPayment, updateCredit,deleteCredit
} = require("../Controllers/creditController");

const authMiddleware = require("../Middlewares/authMiddleware");
const { requireRole } = require("../Middlewares/authMiddleware");

const router = express.Router();

// All credit routes require a valid login token. Owners and staff can
// record credits and payments and view them. Only owners can edit or
// delete a credit, and the admin cannot reach any of them.
router.post("/createCredit", authMiddleware, requireRole("owner", "staff"), createCredit);
router.get("/getCredits", authMiddleware, requireRole("owner", "staff"), getCredits);
router.get("/getCredit/:id", authMiddleware, requireRole("owner", "staff"), getCredit);
router.post("/addPayment/:id", authMiddleware, requireRole("owner", "staff"), addPayment);
router.put("/updateCredit/:id", authMiddleware, requireRole("owner"), updateCredit);
router.delete("/deleteCredit/:id", authMiddleware, requireRole("owner"), deleteCredit);

module.exports = router;
