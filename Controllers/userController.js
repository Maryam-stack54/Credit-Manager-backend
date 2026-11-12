const userModel = require("../Models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Checks a typed password against the stored hash. Phone keyboards
// sometimes add a space at the end, so a trimmed version is also accepted.
const passwordMatches = async (typed, hash) => {
  if (typeof typed !== "string") return false;
  if (await bcrypt.compare(typed, hash)) return true;

  const trimmed = typed.trim();
  return trimmed !== typed && (await bcrypt.compare(trimmed, hash));
};

// Creates a new shop owner account
const registerUser = async (req, res) => {
  try {
    const { name } = req.body;
    // Spaces at either end of a password are never saved
    const password = req.body.password?.trim();
    // Usernames are case-insensitive, so always compare them in lowercase
    const username = req.body.username?.trim().toLowerCase();

    if (!name || !username || !password) {
      return res.status(400).json({
        message: "Name, username, and password are required",
      });
    }

    if (name && name.trim().length < 2) {
       return res.status(400).json({
         message: "Name must be at least 2 characters",
  });
}

    // Only allow 3 to 20 letters, numbers, underscores or dots
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
      return res.status(400).json({
        message:
          "Username must be 3-20 characters and contain only letters, numbers, underscores or dots",
      });
    }

    if (password && password.length < 6) {
       return res.status(400).json({
          message: "Password must be at least 6 characters",
  });
}
    // Usernames must be unique
    const existingUser = await userModel.findOne({ username });

    if (existingUser) {
      return res.status(400).json({
        message: "Username already taken",
      });
    }


    // Hash the password before saving so the real one is never stored
    const hashedPassword = await bcrypt.hash(password, 10);

    // Anyone who registers here is always a shop owner. A role sent in the
    // request is ignored, so nobody can sign themselves up as staff or admin.
    const user = await userModel.create({
      name,
      username,
      password: hashedPassword,
      role: "owner",
    });
    return res.status(201).json({
    message: "User registered successfully",
    user: {
      id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
   },
 });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};


// Checks a username and password and returns a login token
const loginUser = async (req, res) => {
  try {
    const { password } = req.body;
    const username = req.body.username?.trim().toLowerCase();

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    const user = await userModel.findOne({ username });

    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    // Compare the typed password with the stored hash
    const isPasswordMatch = await passwordMatches(password, user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    // A turned-off account cannot log in. Staff are also blocked when the
    // owner they work for has been turned off.
    let ownerIsActive = true;

    if (user.role === "staff") {
      const owner = await userModel.findById(user.owner).select("isActive");
      ownerIsActive = Boolean(owner) && owner.isActive !== false;
    }

    if (user.isActive === false || !ownerIsActive) {
      return res.status(403).json({
        message: "Account disabled",
      });
    }

    // Issue a token the app sends with every request; it expires after 7 days
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role || "owner",
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};


// The profile fields that are safe to send back to the app (no password).
// A staff member has no business details of their own, so they are shown
// their employer's, which the app uses in reminders and messages.
const formatProfile = (user, shopOwner) => {
  const business = shopOwner || user;

  return {
    id: user._id,
    name: user.name,
    username: user.username,
    role: user.role || "owner",
    businessName: business.businessName || "",
    businessPhone: business.businessPhone || "",
    businessAddress: business.businessAddress || "",
    createdAt: user.createdAt,
  };
};


// Returns the logged-in user's profile
const getProfile = async (req, res) => {
  try {
    const user = await userModel.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const shopOwner =
      user.role === "staff" ? await userModel.findById(user.owner) : null;

    return res.status(200).json({
      user: formatProfile(user, shopOwner),
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};


// Updates the owner's name and business details
const updateProfile = async (req, res) => {
  try {
    const { name, businessName, businessPhone, businessAddress } = req.body;

    if (name !== undefined && name.trim().length < 2) {
      return res.status(400).json({
        message: "Name must be at least 2 characters",
      });
    }

    // The business details belong to the shop owner, so only they can edit them
    if (
      req.user.role !== "owner" &&
      (businessName !== undefined ||
        businessPhone !== undefined ||
        businessAddress !== undefined)
    ) {
      return res.status(403).json({
        message: "Only the shop owner can change the business details",
      });
    }

    const updates = {};

    if (name !== undefined) updates.name = name;
    if (businessName !== undefined) updates.businessName = businessName;
    if (businessPhone !== undefined) updates.businessPhone = businessPhone;
    if (businessAddress !== undefined) updates.businessAddress = businessAddress;

    const user = await userModel.findByIdAndUpdate(req.user.userId, updates, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const shopOwner =
      user.role === "staff" ? await userModel.findById(user.owner) : null;

    return res.status(200).json({
      message: "Profile updated successfully",
      user: formatProfile(user, shopOwner),
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};


// Changes the password after confirming the current one
const changePassword = async (req, res) => {
  try {
    const { currentPassword } = req.body;
    // Spaces at either end of the new password are never saved
    const newPassword = req.body.newPassword?.trim();

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters",
      });
    }

    const user = await userModel.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // The current password must be correct before it can be changed
    const isPasswordMatch = await passwordMatches(currentPassword, user.password);

    if (!isPasswordMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    // Store the new password as a hash
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
};


module.exports = {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  changePassword,
};
