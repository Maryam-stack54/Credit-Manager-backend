const jwt = require("jsonwebtoken");
const userModel = require("../Models/userModel");

// Protects routes so only logged-in users can reach them
const authMiddleware = async (req, res, next) => {
  let decoded;

  try {
    // The app sends the token as "Bearer <token>", so take the part after the space
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // Check the token was signed with our secret and has not expired
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }

  try {
    // Look the person up on every request, so a turned-off account is
    // blocked straight away even if its token has not expired yet
    const user = await userModel
      .findById(decoded.userId)
      .select("role owner isActive")
      .lean();

    if (!user) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    const role = user.role || "owner";

    // A staff member works for one owner, so they are blocked
    // when either their own account or their owner's is turned off
    let ownerIsActive = true;

    if (role === "staff") {
      const owner = await userModel.findById(user.owner).select("isActive").lean();
      ownerIsActive = Boolean(owner) && owner.isActive !== false;
    }

    if (user.isActive === false || !ownerIsActive) {
      return res.status(403).json({
        message: "Account disabled",
      });
    }

    // userId is the person logged in. shopId is the shop owner whose
    // customers and credits they work on: the owner's own ID for an owner,
    // their employer's ID for staff, and nothing for an admin.
    req.user = {
      userId: String(user._id),
      role,
      shopId:
        role === "owner" ? String(user._id) : role === "staff" ? String(user.owner) : null,
    };

    next();
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
    });
  }
};

// Lets only the listed roles through, e.g. requireRole("owner")
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({
      message: "You do not have permission to do this",
    });
  }

  next();
};

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
