const jwt = require("jsonwebtoken");
const prisma = require("../prisma");
const { generateAccessToken, generateRefreshToken } = require("../utils/jwt");
const { hashPassword, comparePassword } = require("../utils/password");

const { PASSWORD_REGEX, hashToken } = require("../utils/security");
const dummyHash = require("bcryptjs").hashSync("invalid-account-password", 12);

function getRefreshExpiryDate(token) {
  const decoded = jwt.decode(token);
  return new Date(decoded.exp * 1000);
}

function tokenKey(token) {
  const payload = jwt.decode(token);
  return `${payload?.familyId || "legacy"}:${hashToken(token)}`;
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
        token: tokenKey(refreshToken),
        userId: user.id,
        expiresAt: getRefreshExpiryDate(refreshToken)
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
        mustChangePassword: user.mustChangePassword,
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
    const validPassword = await comparePassword(password, user?.passwordHash || dummyHash);
    if (!user || !user.isActive || !validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: tokenKey(refreshToken),
        userId: user.id,
        expiresAt: getRefreshExpiryDate(refreshToken)
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
        mustChangePassword: user.mustChangePassword,
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

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payload.familyId || String(payload.id)}))`;
      const dbToken = await tx.refreshToken.findUnique({
        where: { token: tokenKey(token) }, include: { user: true }
      });
      if (!dbToken) {
        if (payload.familyId) await tx.refreshToken.deleteMany({ where: { userId: payload.id, token: { startsWith: payload.familyId + ":" } } });
        return null;
      }
      if (dbToken.expiresAt <= new Date() || !dbToken.user?.isActive) return null;
      const consumed = await tx.refreshToken.deleteMany({ where: { id: dbToken.id } });
      if (!consumed.count) return null;
      const user = dbToken.user;
      const currentPayload = { id: user.id, email: user.email, role: user.role, familyId: payload.familyId };
      const refreshToken = generateRefreshToken(currentPayload);
      await tx.refreshToken.create({ data: { token: tokenKey(refreshToken), userId: user.id, expiresAt: getRefreshExpiryDate(refreshToken) } });
      return { accessToken: generateAccessToken({ id: user.id, email: user.email, role: user.role }), refreshToken };
    });
    if (!result) {
      res.clearCookie("refreshToken", getCookieOptions());
      return res.status(401).json({ message: "Unauthenticated" });
    }
    res.cookie("refreshToken", result.refreshToken, getCookieOptions());
    return res.status(200).json({ accessToken: result.accessToken });
  } catch (err) {
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies.refreshToken;

    if (token) {
      await prisma.refreshToken.deleteMany({
        where: { token: tokenKey(token) }
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
        mustChangePassword: true,
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

async function changePassword(req, res, next) {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({
        message: "New password must be at least 8 characters and include uppercase, number, and special character."
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const validCurrentPassword = await comparePassword(currentPassword, user.passwordHash);
    if (!validCurrentPassword) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from your current password." });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } })
    ]);

    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await prisma.refreshToken.create({
      data: { token: tokenKey(refreshToken), userId: user.id, expiresAt: getRefreshExpiryDate(refreshToken) }
    });

    res.cookie("refreshToken", refreshToken, getCookieOptions());
    return res.status(200).json({ accessToken, message: "Password changed successfully." });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  changePassword
};
