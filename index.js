const express = require("express");
// Load secrets such as the database address and JWT key from the .env file
require("dotenv").config();

const dns = require("dns");
// Use Google's DNS so the MongoDB Atlas address resolves reliably
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// Import the database connection and every group of routes
const connectDB = require("./Config/db");
const userRoutes = require("./Routes/userRoute");
const customerRoutes = require("./Routes/customerRoute");
const creditRoutes = require("./Routes/creditRoute");
const dashboardRoutes = require("./Routes/dashboardRoute");
const staffRoutes = require("./Routes/staffRoute");
const adminRoutes = require("./Routes/adminRoute");
const { createCorsMiddleware } = require("./Middlewares/corsMiddleware");

// Create the Express server
const app = express();

// Use the port the host provides, or 5000 when running locally
const PORT = process.env.PORT || 5000;

// Render puts the app behind a proxy. Trusting it lets the login limiter
// see each user's real address instead of the proxy's.
app.set("trust proxy", 1);

// Lets the web version of the app call this backend from a browser
// (see WEB_ORIGINS in Middlewares/corsMiddleware.js)
app.use(createCorsMiddleware());

// Read JSON request bodies sent by the mobile app
app.use(express.json());

// Lets Render and uptime monitors check the server is running
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Register the API routes under their base paths
app.use("/api/users", userRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/credits", creditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/admin", adminRoutes);

// Connect to MongoDB before handling requests
connectDB();

// Start listening for requests
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});