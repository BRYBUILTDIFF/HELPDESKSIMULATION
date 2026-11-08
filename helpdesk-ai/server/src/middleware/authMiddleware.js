const { verifyOptions } = require("../utils/jwt");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma");

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Unauthenticated" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, verifyOptions);
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        role: true,
        mustChangePassword: true,
        isActive: true,
        tokenVersion: true
      }
    });

    if (!user || !user.isActive || payload.tokenVersion !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    if (user.mustChangePassword && !["/api/auth/me", "/api/auth/change-password", "/api/auth/logout-all"].includes(req.originalUrl.split("?")[0])) {
      return res.status(403).json({ message: "Change your password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" });
    }
    req.user = user;
    next();
  } catch (err) {
    if (!["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(err?.name)) return next(err);
    return res.status(401).json({ message: "Unauthenticated" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

module.exports = {
  verifyToken,
  requireAdmin
};
