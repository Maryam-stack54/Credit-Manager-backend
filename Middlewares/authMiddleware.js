const jwt = require("jsonwebtoken");

// Protects routes so only logged-in users can reach them
const authMiddleware = (req, res, next) => {
  try {
    // The app sends the token as "Bearer <token>", so take the part after the space
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // Check the token was signed with our secret and has not expired
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Make the logged-in user's ID available to the next handler
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

module.exports = authMiddleware;