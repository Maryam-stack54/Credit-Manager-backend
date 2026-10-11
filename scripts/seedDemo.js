// Creates (or resets) a demo account with realistic data for presentations.
// Run with: node scripts/seedDemo.js
//
// Log in with   username: demo_store   password: demo1234
//
// Only the demo account's own customers and credits are replaced.
// No other account is touched.

require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userModel = require("../Models/userModel");
const customerModel = require("../Models/customerModel");
const creditModel = require("../Models/creditModel");

const DEMO_USERNAME = "demo_store";
const DEMO_PASSWORD = "demo1234";

// A date relative to today, e.g. daysFromToday(-3) is three days ago
const daysFromToday = (days, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const CUSTOMERS = [
  { name: "Amina Bello", phone: "08031234567", address: "12 Market Road, Kaduna" },
  { name: "Tunde Adeyemi", phone: "08127654321", address: "5 Allen Avenue, Ikeja" },
  { name: "Chinedu Okafor", phone: "07065432198", address: "Shop 14, Ariaria Market, Aba" },
  { name: "Fatima Yusuf", phone: "09087654312", address: "Kano Road, Zaria" },
  { name: "Ngozi Eze", phone: "08154326789", address: "" },
  { name: "Ibrahim Sani", phone: "08098761234", address: "Wuse Zone 3, Abuja" },
  { name: "Blessing Okon", phone: "07012349876", address: "Calabar Road, Uyo" },
];

// Each credit: customer index, items, days ago it was given, days until due,
// and payments as [amount, method, days ago, note]
const CREDITS = [
  {
    customer: 0,
    items: [["Bag of rice (50kg)", 1, 62000], ["Groundnut oil (5L)", 2, 9500]],
    givenDaysAgo: 30,
    dueInDays: -5,
    payments: [[50000, "Bank Transfer", 20, "First instalment"], [31000, "Cash", 3, "Balance cleared"]],
  },
  {
    customer: 1,
    items: [["Indomie (carton)", 3, 7800], ["Peak milk (tin)", 12, 650]],
    givenDaysAgo: 10,
    dueInDays: 1,
    payments: [[12000, "POS", 2, ""]],
  },
  {
    customer: 2,
    items: [["Cement (bag)", 10, 9800], ["Nails (kg)", 4, 1500]],
    givenDaysAgo: 25,
    dueInDays: -6,
    payments: [],
  },
  {
    customer: 3,
    items: [["Sugar (bag)", 1, 48000], ["Semovita (10kg)", 2, 11000]],
    givenDaysAgo: 40,
    dueInDays: -12,
    payments: [[30000, "Cash", 15, "Will pay rest at month end"]],
  },
  {
    customer: 4,
    items: [["Detergent (carton)", 1, 18500]],
    givenDaysAgo: 4,
    dueInDays: 5,
    payments: [],
  },
  {
    customer: 5,
    items: [["Palm oil (25L)", 1, 42000], ["Maggi (pack)", 5, 1200]],
    givenDaysAgo: 6,
    dueInDays: 20,
    payments: [[20000, "Bank Transfer", 1, ""]],
  },
  {
    customer: 6,
    items: [["Beans (paint bucket)", 4, 6500]],
    givenDaysAgo: 18,
    dueInDays: -2,
    payments: [[26000, "Cash", 4, ""]],
  },
  {
    customer: 6,
    items: [["Garri (paint bucket)", 3, 4200], ["Tomato paste (carton)", 1, 15600]],
    givenDaysAgo: 3,
    dueInDays: 10,
    payments: [],
  },
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // Create the demo user, or reuse it and clear its old data
  let user = await userModel.findOne({ username: DEMO_USERNAME });

  if (user) {
    const oldCustomers = await customerModel.find({ user: user._id });
    await creditModel.deleteMany({
      customer: { $in: oldCustomers.map((customer) => customer._id) },
    });
    await customerModel.deleteMany({ user: user._id });
  } else {
    user = await userModel.create({
      name: "Maryam Musa",
      username: DEMO_USERNAME,
      password: await bcrypt.hash(DEMO_PASSWORD, 10),
    });
  }

  user.name = "Maryam Musa";
  user.businessName = "Musa Provisions Store";
  user.businessPhone = "08012345678";
  user.businessAddress = "Shop 7, Central Market, Kaduna";
  user.password = await bcrypt.hash(DEMO_PASSWORD, 10);
  await user.save();

  const customers = [];
  for (const details of CUSTOMERS) {
    customers.push(await customerModel.create({ ...details, user: user._id }));
  }

  for (const credit of CREDITS) {
    const items = credit.items.map(([name, quantity, price]) => ({
      name,
      quantity,
      price,
      total: quantity * price,
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

    const payments = credit.payments.map(([amount, method, daysAgo, note]) => ({
      amount,
      method,
      note,
      date: daysFromToday(-daysAgo, 14),
    }));
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const balance = totalAmount - totalPaid;

    await creditModel.create({
      customer: customers[credit.customer]._id,
      user: user._id,
      items,
      totalAmount,
      payments,
      balance,
      status: balance === 0 ? "Paid" : totalPaid > 0 ? "Partially Paid" : "Pending",
      creditDate: daysFromToday(-credit.givenDaysAgo),
      dueDate: daysFromToday(credit.dueInDays, 12),
    });
  }

  console.log(`Demo account ready: ${customers.length} customers, ${CREDITS.length} credits.`);
  console.log(`Log in with username "${DEMO_USERNAME}" and password "${DEMO_PASSWORD}".`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Could not create the demo account:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
