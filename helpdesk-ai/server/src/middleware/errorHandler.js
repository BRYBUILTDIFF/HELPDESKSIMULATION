function errorHandler(err, _req, res, _next) {
  if (err.message === "Not allowed by CORS") return res.status(403).json({ message: "CORS origin forbidden" });
  const candidate = Number(err.status || err.statusCode);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500;
  if (status < 500) return res.status(status).json({ message: err.type === "entity.too.large" ? "Request too large" : err.publicMessage || "Bad request" });
  // Never log parser bodies, provider headers, database URLs or request contents.
  const isDatabaseError = String(err.name || "").startsWith("PrismaClient");
  const detail = String(err.message || "");
  const postgresCode = /(?:code|SQLSTATE)[:=]\s*["']?([0-9A-Z]{5})\b/.exec(detail)?.[1];
  const category = postgresCode === "42P10" ? "MISSING_UPSERT_UNIQUE_INDEX"
    : /does not exist|unknown (?:column|field)|inconsistent column|type mismatch/i.test(detail) ? "SCHEMA_MISMATCH"
    : /permission denied/i.test(detail) ? "DATABASE_PERMISSION"
    : /prepared statement|cached plan/i.test(detail) ? "DATABASE_STATEMENT_CACHE"
    : /connect|connection|timeout/i.test(detail) ? "DATABASE_CONNECTION"
    : "DATABASE_QUERY_FAILED";
  console.error("Request failed", { name: err.name || "Error", code: err.code || "INTERNAL_ERROR",
    ...(isDatabaseError ? { operation: err.operation || "unspecified", databaseCategory: category, postgresCode, clientVersion: err.clientVersion } : {}) });
  return res.status(status).json({ message: isDatabaseError ? "Database operation failed. Please contact the administrator." : "Service temporarily unavailable",
    ...(isDatabaseError ? { code: "DATABASE_UNAVAILABLE" } : {}) });
}
module.exports = errorHandler;
