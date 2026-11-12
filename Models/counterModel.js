const mongoose = require("mongoose");

// A simple counter that only ever goes up. Each shop has one for its
// customer codes, so a code is never handed out twice, even after the
// customer who had it is deleted.
const counterSchema = new mongoose.Schema({
  // Names the counter, e.g. "customer:<shop owner id>"
  _id: {
    type: String,
    required: true,
  },

  // The last number handed out
  seq: {
    type: Number,
    default: 0,
  },
});

module.exports =
  mongoose.models.Counter || mongoose.model("Counter", counterSchema);
