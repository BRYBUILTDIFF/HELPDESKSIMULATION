const crypto = require("crypto");
const prisma = require("../prisma");

// Atomic PostgreSQL counters shared by all API processes. Fail closed on DB outage.
function requestLimit(namespace, { max, windowMs, key }) {
  return async (req, res, next) => {
    try {
      const fingerprint = crypto.createHash("sha256").update(String(key(req))).digest("hex");
      const counterKey = `${namespace}:${fingerprint}`;
      const rows = await prisma.$queryRaw`
        INSERT INTO "RequestLimit" ("key", "hits", "resetAt")
        VALUES (${counterKey}, 1, CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond')
        ON CONFLICT ("key") DO UPDATE SET
          "hits" = CASE WHEN "RequestLimit"."resetAt" <= CURRENT_TIMESTAMP THEN 1 ELSE "RequestLimit"."hits" + 1 END,
          "resetAt" = CASE WHEN "RequestLimit"."resetAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond' ELSE "RequestLimit"."resetAt" END
        RETURNING "hits", "resetAt"`;
      const row = rows[0];
      if (row.hits > max) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((new Date(row.resetAt) - Date.now()) / 1000))));
        return res.status(429).json({ message: "Too many requests. Please wait and try again." });
      }
      return next();
    } catch (err) { err.operation = `request-limit:${namespace}`; return next(err); }
  };
}
const emailKey = req => String(req.body?.email || "").trim().toLowerCase().slice(0, 254);
module.exports = { requestLimit, emailKey };
