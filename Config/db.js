const mongoose = require("mongoose");

// Connects to MongoDB using the address stored in MONGO_URI
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    // Stop the server if the database cannot be reached
    process.exit(1);
  }
};

module.exports = connectDB;