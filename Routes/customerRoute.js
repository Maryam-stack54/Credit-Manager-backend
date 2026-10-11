const express = require("express");

const {
  createCustomer, getCustomers, getCustomer, updateCustomer, deleteCustomer
} = require("../Controllers/customerController");

const authMiddleware = require("../Middlewares/authMiddleware");

const router = express.Router();

// All customer routes require a valid login token
router.post("/createCustomer", authMiddleware, createCustomer);

router.get("/getCustomers", authMiddleware, getCustomers);

router.get("/getCustomer/:id", authMiddleware, getCustomer);

router.put("/updateCustomer/:id", authMiddleware, updateCustomer);

router.delete("/deleteCustomer/:id", authMiddleware, deleteCustomer);


module.exports = router;