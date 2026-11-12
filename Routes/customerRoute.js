const express = require("express");

const {
  createCustomer, getCustomers, getCustomer, updateCustomer, deleteCustomer
} = require("../Controllers/customerController");

const authMiddleware = require("../Middlewares/authMiddleware");
const { requireRole } = require("../Middlewares/authMiddleware");

const router = express.Router();

// All customer routes require a valid login token. Owners and staff can
// add and view customers. Only owners can edit or delete them, and the
// admin cannot reach any of them.
router.post("/createCustomer", authMiddleware, requireRole("owner", "staff"), createCustomer);

router.get("/getCustomers", authMiddleware, requireRole("owner", "staff"), getCustomers);

router.get("/getCustomer/:id", authMiddleware, requireRole("owner", "staff"), getCustomer);

router.put("/updateCustomer/:id", authMiddleware, requireRole("owner"), updateCustomer);

router.delete("/deleteCustomer/:id", authMiddleware, requireRole("owner"), deleteCustomer);


module.exports = router;
