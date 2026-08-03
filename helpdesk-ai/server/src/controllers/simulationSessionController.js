const prisma = require("../prisma");
const { getModuleById } = require("../store/simulationModuleStore");
const {
  ACTIVE_STATUSES,
  SimulationServiceError,
  createWindowsSimulationSession,
  refreshWindowsSimulationSession,
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
    const activeWhere = { status: { in: ACTIVE_STATUSES } };
    const existingUserSession = await prisma.simulationSession.findFirst({
      where: { userId: req.user.id, moduleId: module.id, ...activeWhere, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }
    });
    if (existingUserSession) {
      return res.status(200).json({ ...safeSession(existingUserSession), resumed: true });
    }
    const [perUser, global] = await Promise.all([
      prisma.simulationSession.count({ where: { userId: req.user.id, ...activeWhere } }),
      prisma.simulationSession.count({ where: activeWhere })
    ]);
    if (perUser >= limit("SIMULATION_MAX_PER_USER", 1)) {
      return res.status(409).json({ message: "You already have an active Windows simulation." });
    }
    if (global >= limit("SIMULATION_GLOBAL_MAX", 1)) {
      return res.status(429).json({ message: "All Windows simulation workspaces are currently in use. Please try again shortly." });
    }
    const ttl = limit("SIMULATION_TTL_MINUTES", 20);
    const session = await prisma.simulationSession.create({
      data: { userId: req.user.id, moduleId: module.id, surface: "windows-os", expiresAt: new Date(Date.now() + ttl * 60 * 1000) }
    });
    try {
      await createWindowsSimulationSession(session);
    } catch (error) {
      return res.status(error.status || 503).json({ message: error.message || "Unable to prepare the Windows workspace." });
    }
    return res.status(202).json(safeSession(session));
  } catch (error) {
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
      session = await refreshWindowsSimulationSession(session);
    }
    return res.status(200).json(safeSession(session));
  } catch (error) {
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
    if (session.status === "PROVISIONING") {
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

module.exports = { createSimulationSession, getSimulationSession, connectSimulationSession, endSimulationSession };
