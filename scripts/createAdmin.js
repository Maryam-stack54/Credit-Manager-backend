// One-time way to create the admin account. The Register screen can never
// make an admin, so this is the only way to get one.
//
// Run with:  node scripts/createAdmin.js <username> <password> ["Full Name"]
// or set ADMIN_USERNAME, ADMIN_PASSWORD (and optionally ADMIN_NAME) first.
//
// Safe to run twice: if that admin already exists, nothing is changed.
// If the username belongs to an owner or a staff member, it refuses.

const dns = require("dns");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Use the address already set in the environment, otherwise read .env
if (!process.env.MONGO_URI) {
  require("dotenv").config();
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

const userModel = require("../Models/userModel");

const run = async () => {
  const username = (process.argv[2] || process.env.ADMIN_USERNAME || "")
    .trim()
    .toLowerCase();
  const password = (process.argv[3] || process.env.ADMIN_PASSWORD || "").trim();
  const name = (process.argv[4] || process.env.ADMIN_NAME || "Administrator").trim();

  if (!username || !password) {
    console.error(
      'Usage: node scripts/createAdmin.js <username> <password> ["Full Name"]'
    );
    process.exit(1);
  }

  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    console.error(
      "Username must be 3-20 characters and contain only letters, numbers, underscores or dots"
    );
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Password must be at least 6 characters");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await userModel.findOne({ username });

  if (existing && existing.role === "admin") {
    console.log(`Admin "${username}" already exists. Nothing was changed.`);
  } else if (existing) {
    console.error(
      `"${username}" is already used by a ${existing.role || "owner"} account. Choose another username.`
    );
    process.exitCode = 1;
  } else {
    await userModel.create({
      name,
      username,
      password: await bcrypt.hash(password, 10),
      role: "admin",
    });
    console.log(`Admin "${username}" created. You can now log in with it.`);
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Could not create the admin:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
