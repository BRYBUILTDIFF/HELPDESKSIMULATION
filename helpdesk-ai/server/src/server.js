const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");

dotenv.config();
require("./utils/security").validateSecurityConfig();
if (!process.env.NODE_ENV && process.env.npm_lifecycle_event === "dev") process.env.NODE_ENV = "development";
if (!["development", "test", "production"].includes(process.env.NODE_ENV)) throw new Error("Set NODE_ENV to development, test, or production.");

const { requestLimit, emailKey } = require("./middleware/requestLimits");
const { verifyToken } = require("./middleware/authMiddleware");
const errorHandler = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const aiRoutes = require("./routes/ai.routes");
const sessionRoutes = require("./routes/session.routes");
const simulationRoutes = require("./routes/simulation.routes");
const simulationSessionRoutes = require("./routes/simulationSession.routes");
const { cleanupExpiredWindowsSimulationSessions } = require("./services/windowsSimulationService");
const { cleanupRetainedData } = require("./services/retentionService");
const { initializePolicyConfig } = require("./store/policyConfigStore");

const app = express();
// Set only to the number of trusted reverse-proxy hops in this deployment.
if (process.env.TRUST_PROXY_HOPS) {
  const hops = Number(process.env.TRUST_PROXY_HOPS);
  if (!Number.isInteger(hops) || hops < 1) throw new Error("TRUST_PROXY_HOPS must be a positive integer.");
  app.set("trust proxy", hops);
}
const allowedOrigins = [
  ...(process.env.CLIENT_URLS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
  process.env.CLIENT_URL
].filter(Boolean);
const isDevelopment = process.env.NODE_ENV === "development";

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
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

const perUser = req => String(req.user.id);
const authLimiter = requestLimit("password-change", { max: 10, windowMs: 60000, key: perUser });
const aiLimiter = requestLimit("ai", { max: 20, windowMs: 60000, key: perUser });
app.use("/api/auth/login",
  requestLimit("login-account", { max: 20, windowMs: 15 * 60000, key: emailKey }),
  requestLimit("login-pair", { max: 8, windowMs: 15 * 60000, key: req => `${req.ip}:${emailKey(req)}` }));
app.use("/api/auth/refresh", requestLimit("refresh", { max: 120, windowMs: 60000, key: req => req.cookies.refreshToken || req.ip }));
app.use("/api/auth/change-password", verifyToken, authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", verifyToken, aiLimiter, aiRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/simulations", simulationRoutes);
app.use("/api/simulation-sessions", simulationSessionRoutes);

app.get("/api/health", (_req, res) => res.status(200).json({ ok: true }));
app.get("/api/ready", async (_req, res) => {
  try { await require("./prisma").$queryRaw`SELECT 1`; return res.json({ ok: true }); }
  catch (_) { return res.status(503).json({ ok: false }); }
});

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const [role] = await require("./prisma").$queryRaw`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    if (!role || Object.values(role).some(Boolean)) throw new Error("Production runtime requires a non-privileged database role.");
    if (process.env.ADMIN_DATABASE_URL) throw new Error("Do not expose maintenance database credentials to the production API.");
  }
  app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  cleanupRetainedData().catch(() => console.error("Data retention cleanup failed; will retry."));
  setInterval(() => cleanupRetainedData().catch(() => console.error("Data retention cleanup failed; will retry.")), 60 * 60 * 1000).unref();
  initializePolicyConfig().catch((error) => console.error("Policy configuration initialization failed", error?.message));
  cleanupExpiredWindowsSimulationSessions().catch((error) => console.error("Simulation cleanup startup pass failed", error?.message));
  setInterval(() => {
    cleanupExpiredWindowsSimulationSessions().catch((error) => console.error("Simulation cleanup pass failed", error?.message));
  }, 5 * 60 * 1000).unref();
  });
}
startServer().catch(() => { console.error("Backend startup security/database checks failed."); process.exitCode = 1; });
