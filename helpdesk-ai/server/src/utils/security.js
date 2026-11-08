const crypto = require("crypto");

const commonPasswords = new Set(["password123!", "password@123", "admin@1234", "user@1234", "qwerty123!", "password1234!"]);
const PASSWORD_REGEX = { test(value) {
  return typeof value === "string" && value.length >= 12 && Buffer.byteLength(value, "utf8") <= 72 && !commonPasswords.has(value.toLowerCase());
} };
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// Descriptions are plain text throughout the application. React escapes output.
function plainDescription(value) {
  return String(value || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "").trim();
}

function validateSecurityConfig(env = process.env) {
  const access = env.JWT_ACCESS_SECRET || "";
  const refresh = env.JWT_REFRESH_SECRET || "";
  if (access.length < 32 || refresh.length < 32 || access === refresh) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different secrets of at least 32 characters.");
  }
}

module.exports = { PASSWORD_REGEX, hashToken, plainDescription, validateSecurityConfig };
