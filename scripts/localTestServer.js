// Starts the real backend on THIS computer, with its own empty test database,
// so the web (or phone) app can be tried without touching real data.
//
//   node scripts/localTestServer.js
//
// - It listens on http://localhost:5055 (change with PORT).
// - It uses the database "credit_manager_web_test" on MongoDB running on this
//   computer. Change it with MONGO_URI, but only a database on this computer
//   is accepted, so real customers can never be touched by mistake.
// - It does not read the .env file, so no secret is needed.
// - To make an admin for it:
//     MONGO_URI=mongodb://127.0.0.1:27017/credit_manager_web_test node scripts/createAdmin.js admin1 Admin@001

const express = require("express");
const mongoose = require("mongoose");

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/credit_manager_web_test";
const PORT = Number(process.env.PORT || 5055);

// Only a database on this computer
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(MONGO_URI)) {
  console.error(
    "This test server only uses a database on this computer (mongodb://127.0.0.1/...). Refusing to start."
  );
  process.exit(1);
}

// Not a real secret: this server is for trying things out only
process.env.JWT_SECRET = process.env.JWT_SECRET || "local-test-secret-not-the-real-one";

const { createCorsMiddleware } = require("../Middlewares/corsMiddleware");

const app = express();
app.set("trust proxy", 1);
app.use(createCorsMiddleware());
app.use(express.json());

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));
app.use("/api/users", require("../Routes/userRoute"));
app.use("/api/customers", require("../Routes/customerRoute"));
app.use("/api/credits", require("../Routes/creditRoute"));
app.use("/api/dashboard", require("../Routes/dashboardRoute"));
app.use("/api/staff", require("../Routes/staffRoute"));
app.use("/api/admin", require("../Routes/adminRoute"));

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    // Make sure the unique rules (such as one customer code per shop) exist
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

    app.listen(PORT, () => {
      console.log(`Test backend running on http://localhost:${PORT}`);
      console.log(`Database: ${MONGO_URI.replace(/^mongodb:\/\//, "")}`);
    });
  })
  .catch((error) => {
    console.error("Could not connect to MongoDB on this computer:", error.message);
    process.exit(1);
  });
