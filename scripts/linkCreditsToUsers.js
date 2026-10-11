// One-off migration: give every existing credit a `user` field, copied from
// the customer it belongs to. Credits are now looked up by user directly,
// so credits created before this change need it to keep showing.
// Run once with: node scripts/linkCreditsToUsers.js
// Nothing is deleted. Safe to run more than once.

require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const creditModel = require("../Models/creditModel");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const credits = creditModel.collection;
  const customers = mongoose.connection.db.collection("customers");

  const unlinked = await credits.find({ user: { $exists: false } }).toArray();
  let linked = 0;
  let skipped = 0;

  for (const credit of unlinked) {
    const customer = await customers.findOne({ _id: credit.customer });

    if (!customer?.user) {
      // The customer was deleted, so this credit already belonged to no one
      skipped++;
      continue;
    }

    await credits.updateOne(
      { _id: credit._id },
      { $set: { user: customer.user } }
    );
    linked++;
  }

  await creditModel.syncIndexes();

  console.log(`Linked ${linked} credit(s) to their users.`);
  if (skipped) {
    console.log(`Skipped ${skipped} credit(s) whose customer no longer exists.`);
  }
  console.log("Migration complete.");

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Migration failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
