function errorHandler(err, _req, res, _next) {
  if (err.message === "Not allowed by CORS") return res.status(403).json({ message: "CORS origin forbidden" });
  const candidate = Number(err.status || err.statusCode);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500;
  if (status < 500) return res.status(status).json({ message: err.type === "entity.too.large" ? "Request too large" : err.publicMessage || "Bad request" });
  // Never log parser bodies, provider headers, database URLs or request contents.
  console.error("Request failed", { name: err.name || "Error", code: err.code || "INTERNAL_ERROR" });
  return res.status(status).json({ message: "Service temporarily unavailable" });
}
module.exports = errorHandler;
