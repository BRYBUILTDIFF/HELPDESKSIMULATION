const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const issuer = process.env.JWT_ISSUER || "helpdesk-ai";
const audience = process.env.JWT_AUDIENCE || "helpdesk-client";
const verifyOptions = { algorithms: ["HS256"], issuer, audience };
function generateAccessToken(payload) {
  return jwt.sign({ id: payload.id, tokenVersion: payload.tokenVersion || 0 }, process.env.JWT_ACCESS_SECRET, {
    algorithm: "HS256", issuer, audience, expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m"
  });
}
function generateRefreshToken(payload) {
  const familyCreatedAt = payload.familyCreatedAt || Date.now();
  const absoluteExpiry = familyCreatedAt + 30 * 86400000;
  const duration = /^(\d+)(ms|s|m|h|d|w)$/.exec(process.env.JWT_REFRESH_EXPIRES || "7d");
  const configured = duration ? Number(duration[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[duration[2]] : 0;
  if (!configured || configured < 1000) throw new Error("Invalid JWT_REFRESH_EXPIRES");
  const seconds = Math.floor((Math.min(Date.now() + configured, absoluteExpiry) - Date.now()) / 1000);
  if (seconds < 1) throw new Error("Session lifetime exceeded");
  return jwt.sign({ id: payload.id, tokenVersion: payload.tokenVersion || 0, familyCreatedAt,
    familyId: payload.familyId || crypto.randomUUID(), jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET,
    { algorithm: "HS256", issuer, audience, expiresIn: seconds });
}
module.exports = { generateAccessToken, generateRefreshToken, verifyOptions };
