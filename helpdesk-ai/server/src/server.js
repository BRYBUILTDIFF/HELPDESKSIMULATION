const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");

dotenv.config();

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const aiRoutes = require("./routes/ai.routes");
const sessionRoutes = require("./routes/session.routes");
const simulationRoutes = require("./routes/simulation.routes");
const simulationSessionRoutes = require("./routes/simulationSession.routes");
const { cleanupExpiredWindowsSimulationSessions } = require("./services/windowsSimulationService");

const app = express();
const allowedOrigins = [
  ...(process.env.CLIENT_URLS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
  process.env.CLIENT_URL
].filter(Boolean);
const isDevelopment = process.env.NODE_ENV !== "production";

function isPrivateLanOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    const isDefaultDevPort = parsed.port === "5173";
    const hostname = parsed.hostname;

    if (!isHttp || !isDefaultDevPort) {
      return false;
    }

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch (_err) {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      if (isDevelopment && isPrivateLanOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many AI requests, please try again later." }
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiLimiter, aiRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/simulations", simulationRoutes);
app.use("/api/simulation-sessions", simulationSessionRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "CORS origin forbidden" });
  }

  const isProd = process.env.NODE_ENV === "production";
  res.status(500).json({
    message: "Internal server error",
    ...(isProd ? {} : { error: err.message, stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  cleanupExpiredWindowsSimulationSessions().catch((error) => console.error("Simulation cleanup startup pass failed", error?.message));
  setInterval(() => {
    cleanupExpiredWindowsSimulationSessions().catch((error) => console.error("Simulation cleanup pass failed", error?.message));
  }, 5 * 60 * 1000).unref();
});
