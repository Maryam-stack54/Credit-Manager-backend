// One-time update for the roles and customer codes feature.
// Run with:  node scripts/migrateRolesAndCodes.js [--dry-run]
//
// What it does:
//  1. Gives every existing user the role "owner" and marks them active.
//  2. Marks the owner as the person who recorded each existing credit and
//     payment (before this feature, only owners could record anything).
//  3. Gives every existing customer a code (CUS-0001, CUS-0002, ...) in the
//     order they were added, continuing from the shop's counter.
//  4. Makes sure the unique code index exists.
//
// Safe to run twice: anything already done is skipped, and a customer who
// already has a code is never given a new one.
//
// --dry-run shows what would change and writes nothing.
//
// A database that is not on this computer is only touched when you add
// --i-have-a-backup, so a real database is never changed by accident.

const dns = require("dns");
const mongoose = require("mongoose");

// Use the address already set in the environment, otherwise read .env
if (!process.env.MONGO_URI) {
  require("dotenv").config();
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

const userModel = require("../Models/userModel");
const customerModel = require("../Models/customerModel");
const creditModel = require("../Models/creditModel");
const counterModel = require("../Models/counterModel");

const DRY_RUN = process.argv.includes("--dry-run");
const HAS_BACKUP = process.argv.includes("--i-have-a-backup");

// Describes where the script is connected without showing any password
const describeTarget = (uri) => {
  try {
    const url = new URL(uri);
    return { host: url.host, database: url.pathname.replace("/", "") || "(default)" };
  } catch (error) {
    return { host: "unknown", database: "unknown" };
  }
};

const isLocal = (host) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

const codeFor = (number) => `CUS-${String(number).padStart(4, "0")}`;

const run = async () => {
  const target = describeTarget(process.env.MONGO_URI);
  console.log(`Database: ${target.database} on ${target.host}`);
  console.log(DRY_RUN ? "Mode: DRY RUN (nothing will be written)\n" : "Mode: LIVE\n");

  if (!DRY_RUN && !isLocal(target.host) && !HAS_BACKUP) {
    console.error(
      "This is not a local database. Back it up first, then run again with --i-have-a-backup."
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  // 1. Users: everyone who exists today is a shop owner
  const usersNeedingRole = { $or: [{ role: { $exists: false } }, { isActive: { $exists: false } }] };
  const userCount = await userModel.collection.countDocuments(usersNeedingRole);

  if (!DRY_RUN && userCount > 0) {
    await userModel.collection.updateMany(
      { role: { $exists: false } },
      { $set: { role: "owner" } }
    );
    await userModel.collection.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );
  }
  console.log(`Users given a role / active flag: ${userCount}`);

  // 2. Credits and payments: the owner recorded them
  const creditsNeedingWho = {
    $or: [
      { createdBy: { $exists: false } },
      { payments: { $elemMatch: { recordedBy: { $exists: false } } } },
    ],
  };
  const creditCount = await creditModel.collection.countDocuments(creditsNeedingWho);

  if (!DRY_RUN && creditCount > 0) {
    await creditModel.collection.updateMany(creditsNeedingWho, [
      {
        $set: {
          createdBy: { $ifNull: ["$createdBy", "$user"] },
          payments: {
            $map: {
              input: { $ifNull: ["$payments", []] },
              as: "payment",
              in: {
                $mergeObjects: [
                  "$$payment",
                  { recordedBy: { $ifNull: ["$$payment.recordedBy", "$user"] } },
                ],
              },
            },
          },
        },
      },
    ]);
  }
  console.log(`Credits updated with who recorded them: ${creditCount}`);

  // 3. Customers: give each one a code, shop by shop, oldest first
  const shops = await customerModel.collection.distinct("user", {
    code: { $exists: false },
  });
  let coded = 0;

  for (const shopId of shops) {
    const customers = await customerModel.collection
      .find({ user: shopId, code: { $exists: false } })
      .sort({ createdAt: 1, _id: 1 })
      .project({ _id: 1 })
      .toArray();

    if (customers.length === 0) continue;

    if (DRY_RUN) {
      coded += customers.length;
      continue;
    }

    // Never go backwards: start after the highest code the shop already has
    const withCodes = await customerModel.collection
      .find({ user: shopId, code: { $type: "string" } })
      .project({ code: 1 })
      .toArray();
    const highest = withCodes.reduce((max, customer) => {
      const number = parseInt(String(customer.code).replace(/\D/g, ""), 10);
      return Number.isFinite(number) && number > max ? number : max;
    }, 0);

    const counterId = `customer:${shopId}`;
    await counterModel.collection.updateOne(
      { _id: counterId },
      { $max: { seq: highest } },
      { upsert: true }
    );

    // Reserve one block of numbers for this shop in a single step
    const reserved = await counterModel.collection.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: customers.length } },
      { returnDocument: "after" }
    );
    const first = reserved.seq - customers.length + 1;

    await customerModel.collection.bulkWrite(
      customers.map((customer, index) => ({
        updateOne: {
          // Only if it still has no code, so a code is never overwritten
          filter: { _id: customer._id, code: { $exists: false } },
          update: { $set: { code: codeFor(first + index) } },
        },
      }))
    );

    coded += customers.length;
  }
  console.log(`Customers given a code: ${coded}`);

  // 4. The unique index that makes the database refuse a repeated code
  if (!DRY_RUN) {
    await customerModel.createIndexes();
    await userModel.createIndexes();
    console.log("Indexes ready.");
  }

  console.log(DRY_RUN ? "\nDry run finished. Nothing was changed." : "\nUpdate complete.");
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Update failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
