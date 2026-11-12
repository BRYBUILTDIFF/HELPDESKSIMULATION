const { plainDescription } = require("../utils/security");
const prisma = require("../prisma");
const { terminateWindowsSimulationSession } = require("../services/windowsSimulationService");

const ALLOWED_DIFFICULTY = new Set(["Easy", "Medium", "Hard"]);
const ALLOWED_SURFACES = new Set(["windows-terminal", "mac-terminal", "windows-os", "mac-os"]);
const safeText = value => require("../utils/redact").redactSecrets(plainDescription(value)).replace(/(?:https?:\/\/|www\.)[^\s]+/gi, "[link removed]").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").slice(0, 4000);

function sanitizeId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeSimulationStep(step, index) {
  const title = safeText(step?.title) || `Step ${index + 1}`;
  const desc = safeText(step?.instruction ?? step?.desc);
  const screen = safeText(step?.screen);
  const action = safeText(step?.action);
  const result = safeText(step?.result);
  return {
    title: title || `Step ${index + 1}`,
    desc,
    instruction: desc,
    command: safeText(step?.command ?? step?.expectedCommands?.[0] ?? ""),
    expectedOutput: typeof step?.expectedOutput === "string" ? safeText(step.expectedOutput) : undefined,
    type: String(step?.type || "command"),
    actionId: String(step?.actionId || ""),
    expectedCommands: typeof step?.command === "string" ? (step.command.trim() ? [safeText(step.command)] : []) : Array.isArray(step?.expectedCommands) ? step.expectedCommands.slice(0, 12).map(safeText) : [],
    screen,
    action,
    result
  };
}

function normalizeSimulation(definition, fallbackTitle = "Simulation Scenario") {
  if (!definition || typeof definition !== "object") {
    return null;
  }
  const requestedSurface = String(definition.surface || "").trim().toLowerCase();
  const legacyTerminalType = String(definition.terminalType || "").trim().toLowerCase();
  const surface = ALLOWED_SURFACES.has(requestedSurface)
    ? requestedSurface
    : legacyTerminalType === "mac-terminal"
      ? "mac-terminal"
      : "windows-terminal";
  const terminalType = surface === "windows-terminal" || surface === "mac-terminal" ? surface : null;
  const steps = Array.isArray(definition.steps)
    ? definition.steps.slice(0, 12).map((step, index) => normalizeSimulationStep(step, index)).filter((step) => step.title)
    : [];
  if (steps.length === 0) {
    return null;
  }
  const normalized = {
    title: String(definition.title || fallbackTitle).trim() || fallbackTitle,
    scenarioType: String(definition.scenarioType || "general").trim().toLowerCase() || "general",
    surface,
    terminalType,
    steps
  };
  return ["windows-terminal", "mac-terminal"].includes(surface) ? require("../services/terminalRuntime").withExpectedOutputs(normalized) : normalized;
}

function mapDbModule(module) {
  return {
    id: module.id,
    title: module.title,
    category: module.category,
    difficulty: module.difficulty,
    enabled: Boolean(module.enabled),
    completions: Number(module.completions || 0),
    passRate: null, // No failure denominator yet; do not present a fabricated pass rate.
    scoring: "command-sequence or self-reported; not proof of real OS actions",
    avgSteps: Number(module.avgSteps || 0),
    sourcePrompt: module.sourcePrompt || "",
    simulation: normalizeSimulation(module.simulation, module.title),
    validationErrors: ["windows-terminal", "mac-terminal"].includes(module.simulation?.surface) ? require("../services/terminalRuntime").validateDefinition(normalizeSimulation(module.simulation, module.title)) : [],
    createdAt: module.createdAt
  };
}

function buildPayload(payload = {}) {
  const title = safeText(payload.title).trim().slice(0, 160);
  const category = safeText(payload.category).trim().slice(0, 80);
  if (!title || !category) {
    return null;
  }
  const difficulty = ALLOWED_DIFFICULTY.has(payload.difficulty) ? payload.difficulty : "Medium";
  const simulation = normalizeSimulation(payload.simulation, title);
  return {
    title,
    category,
    difficulty,
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : true,
    sourcePrompt: require("../utils/redact").redactSecrets(payload.sourcePrompt).trim().slice(0, 4000) || null,
    simulation
  };
}

async function listModules(options = {}) {
  const modules = await prisma.simulationModule.findMany({ where: options.onlyEnabled ? { enabled: true } : undefined, orderBy: { createdAt: "desc" } });
  return modules.map(mapDbModule);
}
async function getModuleById(id) {
  const module = await prisma.simulationModule.findUnique({ where: { id: String(id || "") } });
  return module ? mapDbModule(module) : null;
}
async function createModule(payload = {}) {
  const normalized = buildPayload(payload);
  if (!normalized) return null;
  if (normalized.enabled && ["windows-terminal", "mac-terminal"].includes(normalized.simulation?.surface)) {
    const r = require("../services/terminalRuntime"); r.assertDefinition(normalized.simulation);
    if (!r.verifyTest(payload.testToken, normalized.simulation, payload.testedById)) { const error = new Error("Complete the interactive admin test before enabling this module."); error.status = 400; throw error; }
  }
  const base = sanitizeId(payload.id || normalized.title) || `sim-${Date.now().toString(36)}`;
  for (let attempt = 1; attempt <= 100; attempt++) {
    try {
      const created = await prisma.simulationModule.create({ data: { ...normalized, id: attempt === 1 ? base : `${base}-${attempt}`, simulation: normalized.simulation || undefined } });
      return mapDbModule(created);
    } catch (err) { if (err.code !== "P2002") throw err; }
  }
  const error = new Error("Too many modules have this title"); error.status = 409; throw error;
}
async function updateModule(id, patch = {}) {
  const data = {
    title: typeof patch.title === "string" ? safeText(patch.title).trim().slice(0, 160) || undefined : undefined,
    category: typeof patch.category === "string" ? safeText(patch.category).trim().slice(0, 80) || undefined : undefined,
    difficulty: ALLOWED_DIFFICULTY.has(patch.difficulty) ? patch.difficulty : undefined,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : undefined,
    simulation: Object.prototype.hasOwnProperty.call(patch, "simulation") ? normalizeSimulation(patch.simulation, patch.title) : undefined
  };
  if (Object.prototype.hasOwnProperty.call(patch, "simulation") && !data.simulation) {
    const error = new Error("A simulation needs at least one valid step"); error.status = 400; throw error;
  }
  const current = await prisma.simulationModule.findUnique({where:{id:String(id || "")}});
  if (!current) return null;
  const target = data.simulation || normalizeSimulation(current.simulation, current.title);
  if ((data.enabled ?? current.enabled) && ["windows-terminal", "mac-terminal"].includes(target?.surface)) {
    const r = require('../services/terminalRuntime'); r.assertDefinition(target);
    if ((data.enabled === true || data.simulation) && !r.verifyTest(patch.testToken,target,patch.testedById)) { const error = new Error('Complete the interactive admin test for this exact definition before publishing.'); error.status=400; throw error; }
  }
  try { return mapDbModule(await prisma.simulationModule.update({ where: { id: String(id || "") }, data })); }
  catch (err) { if (err.code === "P2025") return null; throw err; }
}
async function deleteModule(id) {
  const safeId = String(id || "");
  const sessions = await prisma.simulationSession.findMany({ where: { moduleId: safeId } });
  for (const session of sessions) if (session.status !== "ENDED" || session.ec2InstanceId) await terminateWindowsSimulationSession(session);
  try {
    const removed = await prisma.$transaction(async tx => {
      await tx.simulationSession.deleteMany({ where: { moduleId: safeId } });
      await tx.simulationAttempt.deleteMany({ where: { moduleId: safeId } });
      return tx.simulationModule.delete({ where: { id: safeId } });
    });
    return mapDbModule(removed);
  } catch (err) { if (err.code === "P2025") return null; throw err; }
}

async function recordModuleCompletion({ moduleId, userId, attemptKey, surface, stepsCompleted }) {
  const safeId = String(moduleId || "");
  const safeAttemptKey = String(attemptKey || "").trim();
  const requestedSteps = Math.max(0, Number.parseInt(stepsCompleted, 10) || 0);

  if (!safeId || !safeAttemptKey || !prisma?.simulationModule || !prisma?.simulationCompletion) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${safeId}))`;
    const existing = await tx.simulationCompletion.findUnique({ where: { attemptKey: safeAttemptKey } });
    if (existing) {
      if (existing.userId !== userId || existing.moduleId !== safeId) {
        const error = new Error("This simulation attempt does not belong to the current user.");
        error.status = 403;
        throw error;
      }
      const module = await tx.simulationModule.findUnique({ where: { id: safeId } });
      return module ? { module: mapDbModule(module), recorded: false } : null;
    }

    const module = await tx.simulationModule.findUnique({ where: { id: safeId } });
    if (!module || !module.enabled) return null;
    const expectedSteps = Array.isArray(module.simulation?.steps) ? module.simulation.steps.length : 0;
    const expectedSurface = module.simulation?.surface || module.simulation?.terminalType || "windows-terminal";
    if (surface !== expectedSurface) {
      const error = new Error("Simulation surface does not match this module."); error.status = 400; throw error;
    }
    if (surface === "windows-os") {
      const sessionId = safeAttemptKey.startsWith("windows-os:") ? safeAttemptKey.slice(11) : "";
      const session = await tx.simulationSession.findFirst({ where: { id: sessionId, userId, moduleId: safeId, status: { in: ["READY", "ACTIVE"] }, expiresAt: { gt: new Date() } } });
      if (!session) { const error = new Error("A live workspace belonging to this user and module is required."); error.status = 403; throw error; }
    }

    let verification = "self-reported";
    let completedSteps = expectedSteps > 0 ? Math.min(requestedSteps, expectedSteps) : requestedSteps;
    if (["windows-terminal", "mac-terminal"].includes(surface)) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${safeAttemptKey}))`;
      const attempt = await tx.simulationAttempt.findFirst({ where: { id: safeAttemptKey, userId, moduleId: safeId, surface } });
      if (!attempt || attempt.expiresAt <= new Date() || attempt.expected?.version !== 2 || attempt.expected.status !== "ACTIVE" || require("../services/terminalRuntime").definitionHash(normalizeSimulation(attempt.expected.definition, module.title)) !== require("../services/terminalRuntime").definitionHash(normalizeSimulation(module.simulation, module.title)) || attempt.nextStep !== attempt.expected.definition.steps.length || !attempt.expected.definition.steps.length) {
        const error = new Error("Complete each command step in a server-issued attempt before recording completion."); error.status = 409; throw error;
      }
      completedSteps = attempt.nextStep;
      verification = "simulated-actions";
      await tx.simulationAttempt.update({where:{id:attempt.id},data:{expected:{...attempt.expected,status:"COMPLETED"}}});
    }
    await tx.simulationCompletion.create({
      data: { userId, moduleId: safeId, attemptKey: safeAttemptKey, surface: String(surface || "terminal"), stepsCompleted: completedSteps, verification }
    });
    const stats = await tx.simulationCompletion.aggregate({ where: { moduleId: safeId }, _count: { _all: true }, _avg: { stepsCompleted: true } });
    const updated = await tx.simulationModule.update({
      where: { id: safeId },
      data: { completions: stats._count._all, avgSteps: stats._avg.stepsCompleted || 0, passRate: 0 }
    });
    return { module: mapDbModule(updated), recorded: true, verification };
  });
}

module.exports = {
  normalizeSimulation,
  listModules,
  getModuleById,
  createModule,
  updateModule,
  deleteModule,
  recordModuleCompletion
};
