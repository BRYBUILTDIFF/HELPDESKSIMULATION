const jwt = require("jsonwebtoken");
const prisma = require("../prisma");
const { generateAccessToken, generateRefreshToken } = require("../utils/jwt");
const { hashPassword, comparePassword } = require("../utils/password");

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function getRefreshExpiryDate() {
  const token = generateRefreshToken({ probe: "expiry" });
  const decoded = jwt.decode(token);
  return new Date(decoded.exp * 1000);
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

async function register(req, res, next) {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        errors: [
          {
            field: "password",
            message:
              "Password must be at least 8 characters and include uppercase, number, and special character."
          }
        ]
      });
    }

    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: "USER"
      }
    });

    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: getRefreshExpiryDate()
      }
    });

    res.cookie("refreshToken", refreshToken, getCookieOptions());
    return res.status(201).json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: "Account inactive" });
    }

    const validPassword = await comparePassword(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: getRefreshExpiryDate()
      }
    });

    res.cookie("refreshToken", refreshToken, getCookieOptions());
    return res.status(200).json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const dbToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true
          }
        }
      }
    });

    if (!dbToken || dbToken.expiresAt < new Date() || !dbToken.user || !dbToken.user.isActive) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const newAccessToken = generateAccessToken({
      id: payload.id,
      email: payload.email,
      role: payload.role
    });

    return res.status(200).json({ accessToken: newAccessToken });
  } catch (err) {
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies.refreshToken;

    if (token) {
      await prisma.refreshToken.deleteMany({
        where: { token }
      });
    }

    res.clearCookie("refreshToken", getCookieOptions());
    return res.status(200).json({ message: "Logged out" });
  } catch (err) {
    return next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe
};
