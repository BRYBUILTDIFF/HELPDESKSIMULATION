const prisma = require("../prisma");
const { getModuleById } = require("../store/simulationModuleStore");
const {
  ACTIVE_STATUSES,
  LIVE_STATUSES,
  countLiveWindowsInstances,
  SimulationServiceError,
  createWindowsSimulationSession,
  refreshWindowsSimulationSession,
  pollWindowsSimulationSession,
  terminateWindowsSimulationSession
} = require("../services/windowsSimulationService");
const { createGuacamoleUrl } = require("../services/guacamoleJsonService");

function limit(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function safeSession(session, guacamoleUrl) {
  return {
    id: session.id,
    status: session.status,
    revealAt: session.createdAt ? new Date(new Date(session.createdAt).getTime() + 8 * 60000) : undefined,
    expiresAt: session.expiresAt,
    endedAt: session.endedAt,
    ...(guacamoleUrl ? { guacamoleUrl } : {})
  };
}

async function createSimulationSession(req, res, next) {
  try {
    const moduleId = String(req.body?.moduleId || "").trim();
    const module = await getModuleById(moduleId);
    if (!module || !module.enabled) return res.status(404).json({ message: "Simulation module not found." });
    if (module?.simulation?.surface !== "windows-os") {
      return res.status(400).json({ message: "This module does not use the Windows OS simulation surface." });
    }
    const reservation = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(911)`;
      const activeWhere = { status: { in: LIVE_STATUSES } };
      const existing = await tx.simulationSession.findFirst({
        where: { userId: req.user.id, moduleId: module.id, status: { in: ACTIVE_STATUSES }, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" }
      });
      if (existing) return { session: existing, resumed: true };
      const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0);
      const daily = await tx.simulationSession.count({ where: { userId: req.user.id, createdAt: { gte: midnight } } });
      if (daily >= limit("SIMULATION_DAILY_MAX", 3)) throw new SimulationServiceError("Your daily Windows lab allowance has been reached.", 429);
      const recent = await tx.simulationSession.findFirst({ where: { userId: req.user.id,
        createdAt: { gt: new Date(Date.now() - limit("SIMULATION_COOLDOWN_MINUTES", 5) * 60000) } }, orderBy: { createdAt: "desc" } });
      if (recent) throw new SimulationServiceError("Please wait a few minutes before starting another Windows lab.", 429);
      const perUser = await tx.simulationSession.count({ where: { userId: req.user.id, ...activeWhere } });
      const global = await tx.simulationSession.count({ where: activeWhere });
      if (perUser >= limit("SIMULATION_MAX_PER_USER", 1)) throw new SimulationServiceError("You already have an active Windows simulation.", 409);
      if (global >= limit("SIMULATION_GLOBAL_MAX", 1)) throw new SimulationServiceError("All Windows simulation workspaces are currently in use.", 429);
      // Database rows alone cannot account for interrupted launches or EC2
      // instances that are still shutting down after End Simulation.
      if (await countLiveWindowsInstances() >= limit("SIMULATION_GLOBAL_MAX", 1)) {
        throw new SimulationServiceError("A Windows workspace is still running or shutting down. Wait for it to finish before starting another.", 429);
      }
      const session = await tx.simulationSession.create({ data: {
        userId: req.user.id, moduleId: module.id, surface: "windows-os",
        expiresAt: new Date(Date.now() + (8 + limit("SIMULATION_TTL_MINUTES", 20)) * 60000)
      } });
      return { session, resumed: false };
    });
    const { session } = reservation;
    if (reservation.resumed && (session.ec2InstanceId || session.status !== "PROVISIONING")) {
      return res.status(200).json({ ...safeSession(session), resumed: true });
    }
    // Retry an interrupted/rejected launch with its original idempotency token.
    // Never leave a resumed row polling forever without an EC2 instance ID.
    try {
      await createWindowsSimulationSession(session);
    } catch (error) {
      return res.status(error.status || 503).json({ message: error.message || "Unable to prepare the Windows workspace." });
    }
    return res.status(202).json(safeSession(session));
  } catch (error) {
    if (error instanceof SimulationServiceError) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
}

async function getSimulationSession(req, res, next) {
  try {
    let session = await prisma.simulationSession.findFirst({ where: { id: String(req.params.id || ""), userId: req.user.id } });
    if (!session) return res.status(404).json({ message: "Simulation session not found." });
    if (ACTIVE_STATUSES.includes(session.status) && session.expiresAt < new Date()) {
      await terminateWindowsSimulationSession(session).catch(() => null);
      session = await prisma.simulationSession.findUnique({ where: { id: session.id } });
    } else if (session.status === "PROVISIONING") {
      session = await pollWindowsSimulationSession(session);
    }
    return res.status(200).json(safeSession(session));
  } catch (error) {
    if (error instanceof SimulationServiceError) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
}

async function connectSimulationSession(req, res, next) {
  try {
    let session = await prisma.simulationSession.findFirst({ where: { id: String(req.params.id || ""), userId: req.user.id } });
    if (!session) return res.status(404).json({ message: "Simulation session not found." });
    if (session.expiresAt < new Date()) {
      await terminateWindowsSimulationSession(session).catch(() => null);
      return res.status(409).json({ message: "This Windows workspace has expired. Start a new simulation." });
    }
    if (ACTIVE_STATUSES.includes(session.status)) {
      session = await refreshWindowsSimulationSession(session);
    }
    if (!["READY", "ACTIVE"].includes(session.status) || !session.privateIp) {
      return res.status(409).json({ message: "Windows workspace is not ready to connect yet." });
    }
    const guacamoleUrl = createGuacamoleUrl(session);
    if (session.status === "READY") {
      session = await prisma.simulationSession.update({ where: { id: session.id }, data: { status: "ACTIVE" } });
    }
    console.info("Windows simulation connection URL issued", { sessionId: session.id, userId: req.user.id });
    return res.status(200).json(safeSession(session, guacamoleUrl));
  } catch (error) {
    if (error instanceof SimulationServiceError) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
}

async function endSimulationSession(req, res, next) {
  try {
    const session = await prisma.simulationSession.findFirst({ where: { id: String(req.params.id || ""), userId: req.user.id } });
    if (!session) return res.status(404).json({ message: "Simulation session not found." });
    const ended = await terminateWindowsSimulationSession(session);
    return res.status(200).json(safeSession(ended));
  } catch (error) {
    if (error instanceof SimulationServiceError) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
}

async function listStuckSessions(_req, res, next) {
  try {
    const sessions = await prisma.simulationSession.findMany({ where: { status: "TERMINATING" }, take: 100, orderBy: { updatedAt: "asc" } });
    return res.json({ sessions: sessions.map(session => ({ ...safeSession(session), userId: session.userId, updatedAt: session.updatedAt })) });
  } catch (err) { return next(err); }
}
async function retryTermination(req, res, next) {
  try {
    const session = await prisma.simulationSession.findUnique({ where: { id: req.params.id } });
    if (!session) return res.status(404).json({ message: "Simulation session not found" });
    const ended = await terminateWindowsSimulationSession(session);
    return res.json(safeSession(ended));
  } catch (err) { return next(err); }
}
module.exports = { listStuckSessions, retryTermination, createSimulationSession, getSimulationSession, connectSimulationSession, endSimulationSession };
