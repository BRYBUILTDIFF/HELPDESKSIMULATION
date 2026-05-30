const prisma = require("../prisma");

const DEFAULT_MODULES = [
  { id: "no-internet", title: "No Internet Connection", category: "Network", difficulty: "Easy", enabled: true, completions: 8, passRate: 92, avgSteps: 4.1 },
  { id: "dns-problem", title: "DNS Problem", category: "Network", difficulty: "Easy", enabled: true, completions: 6, passRate: 83, avgSteps: 5.3 },
  { id: "slow-pc", title: "Slow Computer / High CPU", category: "Performance", difficulty: "Medium", enabled: true, completions: 4, passRate: 78, avgSteps: 5.8 },
  { id: "printer-spooler", title: "Printer Spooler Issue", category: "Peripheral", difficulty: "Medium", enabled: true, completions: 3, passRate: 74, avgSteps: 6.2 },
  { id: "hidden-usb", title: "Recover Hidden USB Files", category: "Files", difficulty: "Medium", enabled: true, completions: 2, passRate: 70, avgSteps: 6.5 },
  { id: "account-locked", title: "User Account Locked", category: "Account", difficulty: "Medium", enabled: true, completions: 5, passRate: 86, avgSteps: 4.8 },
  { id: "server-down", title: "Website/Server Down", category: "Server", difficulty: "Hard", enabled: true, completions: 2, passRate: 50, avgSteps: 8.7 },
  { id: "malware-check", title: "Suspicious Process / Malware Check", category: "Security", difficulty: "Hard", enabled: true, completions: 1, passRate: 40, avgSteps: 10.2 },
  { id: "low-disk", title: "Low Disk Space", category: "Performance", difficulty: "Easy", enabled: true, completions: 3, passRate: 81, avgSteps: 5 },
  { id: "service-not-running", title: "Service Not Running", category: "Software", difficulty: "Medium", enabled: true, completions: 2, passRate: 72, avgSteps: 6.1 }
];

const ALLOWED_DIFFICULTY = new Set(["Easy", "Medium", "Hard"]);
let memoryModules = [];

function sanitizeId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function ensureUniqueMemoryId(baseId) {
  const fallback = `sim-${Date.now().toString(36)}`;
  const base = sanitizeId(baseId) || fallback;
  if (!memoryModules.some((m) => m.id === base)) {
    return base;
  }
  let counter = 2;
  while (counter < 5000) {
    const next = `${base}-${counter}`;
    if (!memoryModules.some((m) => m.id === next)) {
      return next;
    }
    counter += 1;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function normalizeSimulationStep(step, index) {
  const title = String(step?.title || `Step ${index + 1}`).trim();
  const desc = String(step?.desc || "").trim();
  const screen = String(step?.screen || "").trim();
  const action = String(step?.action || "").trim();
  const result = String(step?.result || "").trim();
  return {
    title: title || `Step ${index + 1}`,
    desc,
    screen,
    action,
    result
  };
}

function normalizeSimulation(definition, fallbackTitle = "Simulation Scenario") {
  if (!definition || typeof definition !== "object") {
    return null;
  }
  const terminalType = String(definition.terminalType || "windows-terminal").trim().toLowerCase();
  const safeTerminalType = terminalType === "mac-terminal" ? "mac-terminal" : "windows-terminal";
  const steps = Array.isArray(definition.steps)
    ? definition.steps.map((step, index) => normalizeSimulationStep(step, index)).filter((step) => step.title)
    : [];
  if (steps.length === 0) {
    return null;
  }
  return {
    title: String(definition.title || fallbackTitle).trim() || fallbackTitle,
    scenarioType: String(definition.scenarioType || "general").trim().toLowerCase() || "general",
    terminalType: safeTerminalType,
    steps
  };
}

function mapDbModule(module) {
  return {
    id: module.id,
    title: module.title,
    category: module.category,
    difficulty: module.difficulty,
    enabled: Boolean(module.enabled),
    completions: Number(module.completions || 0),
    passRate: Number(module.passRate || 0),
    avgSteps: Number(module.avgSteps || 0),
    sourcePrompt: module.sourcePrompt || "",
    simulation: normalizeSimulation(module.simulation, module.title),
    createdAt: module.createdAt
  };
}

function buildPayload(payload = {}) {
  const title = String(payload.title || "").trim();
  const category = String(payload.category || "").trim();
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
    sourcePrompt: String(payload.sourcePrompt || "").trim() || null,
    simulation
  };
}

async function ensureSeeded() {
  // Auto-seeding is intentionally disabled so admin deletions persist across restarts.
  // If you need starter modules, create them explicitly via Admin API/UI.
}

async function listModules(options = {}) {
  const onlyEnabled = Boolean(options.onlyEnabled);
  if (prisma?.simulationModule) {
    await ensureSeeded();
    try {
      const modules = await prisma.simulationModule.findMany({
        where: onlyEnabled ? { enabled: true } : undefined,
        orderBy: { createdAt: "desc" }
      });
      return modules.map(mapDbModule);
    } catch (_err) {
      // fallback to memory
    }
  }
  return memoryModules.filter((m) => (onlyEnabled ? m.enabled : true)).map((m) => ({ ...m }));
}

async function createModule(payload = {}) {
  const normalized = buildPayload(payload);
  if (!normalized) {
    return null;
  }
  if (prisma?.simulationModule) {
    await ensureSeeded();
    try {
      const idBase = sanitizeId(payload.id || normalized.title) || `sim-${Date.now().toString(36)}`;
      let id = idBase;
      let attempt = 2;
      while (attempt < 5000) {
        try {
          const created = await prisma.simulationModule.create({
            data: {
              id,
              title: normalized.title,
              category: normalized.category,
              difficulty: normalized.difficulty,
              enabled: normalized.enabled,
              sourcePrompt: normalized.sourcePrompt,
              simulation: normalized.simulation || undefined
            }
          });
          return mapDbModule(created);
        } catch (err) {
          if (err?.code === "P2002") {
            id = `${idBase}-${attempt}`;
            attempt += 1;
            continue;
          }
          throw err;
        }
      }
    } catch (_err) {
      // fallback to memory
    }
  }

  const module = {
    id: ensureUniqueMemoryId(payload.id || normalized.title),
    title: normalized.title,
    category: normalized.category,
    difficulty: normalized.difficulty,
    enabled: normalized.enabled,
    completions: 0,
    passRate: 0,
    avgSteps: 0,
    sourcePrompt: normalized.sourcePrompt || "",
    simulation: normalized.simulation,
    createdAt: new Date().toISOString()
  };
  memoryModules.unshift(module);
  return { ...module };
}

async function updateModule(id, patch = {}) {
  const safeId = String(id || "");
  const nextDifficulty = ALLOWED_DIFFICULTY.has(patch.difficulty) ? patch.difficulty : undefined;
  const nextEnabled = typeof patch.enabled === "boolean" ? patch.enabled : undefined;
  const nextSimulation = Object.prototype.hasOwnProperty.call(patch, "simulation")
    ? normalizeSimulation(patch.simulation, patch.title || "Simulation Scenario")
    : undefined;

  if (prisma?.simulationModule) {
    await ensureSeeded();
    try {
      const updated = await prisma.simulationModule.update({
        where: { id: safeId },
        data: {
          enabled: nextEnabled,
          difficulty: nextDifficulty,
          simulation: nextSimulation
        }
      });
      return mapDbModule(updated);
    } catch (err) {
      if (err?.code !== "P2025") {
        // fallback to memory for schema mismatch/missing table
      } else {
        return null;
      }
    }
  }

  const idx = memoryModules.findIndex((m) => m.id === safeId);
  if (idx === -1) {
    return null;
  }
  memoryModules[idx] = {
    ...memoryModules[idx],
    enabled: typeof nextEnabled === "boolean" ? nextEnabled : memoryModules[idx].enabled,
    difficulty: nextDifficulty || memoryModules[idx].difficulty,
    simulation: nextSimulation === undefined ? memoryModules[idx].simulation : nextSimulation
  };
  return { ...memoryModules[idx] };
}

async function deleteModule(id) {
  const safeId = String(id || "");
  if (prisma?.simulationModule) {
    await ensureSeeded();
    try {
      const deleted = await prisma.simulationModule.delete({
        where: { id: safeId }
      });
      return mapDbModule(deleted);
    } catch (err) {
      if (err?.code === "P2025") {
        return null;
      }
      // fallback to memory
    }
  }

  const idx = memoryModules.findIndex((m) => m.id === safeId);
  if (idx === -1) {
    return null;
  }
  const [removed] = memoryModules.splice(idx, 1);
  return { ...removed };
}

module.exports = {
  listModules,
  createModule,
  updateModule,
  deleteModule
};
