// One-off migration: switch user login from phone number to username.
// Run once with: node scripts/migrateToUsername.js
//
// - Existing users without a username get their old phone number as their
//   username, so they can still log in (using the phone number as username).
// - The old unique index on `phone` is dropped, otherwise new users (who have
//   no phone) would clash with each other on registration.
// - The new unique index on `username` is created.
// The old `phone` value is left on existing documents, nothing is deleted.

require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const userModel = require("../Models/userModel");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = userModel.collection;

  const oldUsers = await users
    .find({ username: { $exists: false }, phone: { $exists: true } })
    .toArray();

  for (const user of oldUsers) {
    const username = String(user.phone).trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");
    await users.updateOne({ _id: user._id }, { $set: { username } });
    console.log(`User "${user.name}" can now log in with username: ${username}`);
  }

  const indexes = await users.indexes();
  if (indexes.some((index) => index.name === "phone_1")) {
    await users.dropIndex("phone_1");
    console.log("Dropped old unique index on phone");
  }

  await userModel.syncIndexes();
  console.log("Username index ready. Migration complete.");

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Migration failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
