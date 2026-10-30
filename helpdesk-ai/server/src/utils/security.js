const crypto = require("crypto");

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
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
