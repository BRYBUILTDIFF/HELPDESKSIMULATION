const prisma = require("../prisma");
const { listPolicyEvents, getPolicySummary } = require("../store/policyEventStore");
const { listModules, createModule, updateModule, deleteModule } = require("../store/simulationModuleStore");
const { hashPassword } = require("../utils/password");
const { getAIProvider, getDefaultModel, getOpenAIClient } = require("../utils/openai");
const {
  getPolicyConfig,
  replacePolicyConfig,
  addPolicyListEntry,
  updatePolicyListEntry,
  deletePolicyListEntry,
  resetPolicyConfig
} = require("../store/policyConfigStore");

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const DEFAULT_USER_PASSWORD = "password123";
const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"];
const CATEGORY_KEYWORDS = [
  { category: "Network", words: ["internet", "wifi", "network", "dns", "vpn", "lan", "ip", "router"] },
  { category: "Account", words: ["password", "account", "login", "locked", "sign in", "signin"] },
  { category: "Email", words: ["outlook", "email", "mailbox", "mail"] },
  { category: "Peripheral", words: ["printer", "scanner", "usb", "mouse", "keyboard", "webcam"] },
  { category: "Performance", words: ["slow", "lag", "freeze", "cpu", "memory", "disk"] },
  { category: "Security", words: ["virus", "malware", "phishing", "security", "hack"] },
  { category: "Software", words: ["app", "software", "install", "update", "crash", "error"] }
];
const UNSUPPORTED_PLATFORM_PATTERN = /\b(android|ios|iphone|ipad|linux|ubuntu|debian|fedora|redhat|centos|chromebook)\b/;
const PHYSICAL_DAMAGE_PATTERN =
  /\b(broken|cracked|shattered|physically damaged|physical damage|water damage|spilled|burnt|burned|replace|replacement|dead pixel|flicker|flickering|no display|black screen)\b/;
const PHYSICAL_DEVICE_PATTERN = /\b(monitor|screen|display|hinge|lcd|panel|keyboard|touchpad|chassis|power button|charger|battery|port)\b/;
const SIMULATION_INTENT_PATTERN =
  /\b(reset|unlock|troubleshoot|diagnose|fix|resolve|recover|restore|configure|setup|install|update|investigate|check|verify|repair|guide|step by step|walk me through|how to)\b/;
const SIMULATION_DOMAIN_PATTERN =
  /\b(password|account|admin|login|signin|sign in|active directory|ad user|dns|vpn|network|internet|ip|gateway|service|process|event log|error|not working|failed|cannot|outlook|email|mailbox|printer|spooler|cpu|memory|disk|storage|malware|virus|permissions?)\b/;
const SIMULATION_ELIGIBLE_POLICY_CODES = new Set(["ALLOWED", "ALLOWED_RULE_MATCH"]);
const disregardedPromptInsightKeys = new Set();

function isAllowedAdminUserPassword(password) {
  const candidate = String(password || "");
  return candidate === DEFAULT_USER_PASSWORD || PASSWORD_REGEX.test(candidate);
}

function normalizePrompt(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function titleFromPrompt(prompt) {
  const clean = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    return "General IT Support Scenario";
  }
  const clipped = clean.slice(0, 80);
  const base = clipped.charAt(0).toUpperCase() + clipped.slice(1);
  return base.length > 70 ? `${base.slice(0, 67)}...` : base;
}

function inferCategory(prompt) {
  const normalized = normalizePrompt(prompt);
  for (const item of CATEGORY_KEYWORDS) {
    if (item.words.some((word) => normalized.includes(word))) {
      return item.category;
    }
  }
  return "General";
}

function inferDifficulty(prompt, occurrences = 1) {
  const normalized = normalizePrompt(prompt);
  if (/(server|dns|vpn|network adapter|profile|registry|policy)/.test(normalized)) {
    return "Hard";
  }
  if (occurrences >= 5 || /(error|cannot|failed|issue|problem|not working)/.test(normalized)) {
    return "Medium";
  }
  return "Easy";
}

function inferScenarioType(category = "", prompt = "") {
  const source = `${category} ${prompt}`.toLowerCase();
  if (/(network|wifi|internet|dns|vpn|router)/.test(source)) return "network";
  if (/(email|outlook|mailbox|exchange)/.test(source)) return "email";
  if (/(printer|spooler|print queue)/.test(source)) return "printer";
  return "general";
}

function mapSurfaceToTerminalType(surface = "") {
  const normalized = String(surface || "").trim().toLowerCase();
  if (normalized === "mac-terminal") return "mac-terminal";
  if (normalized === "windows-terminal") return "windows-terminal";
  return null;
}

function toSimulationSurfaceLabel(surface = "") {
  const normalized = String(surface || "").trim().toLowerCase();
  if (normalized === "mac-terminal") return "Mac Terminal";
  if (normalized === "windows-os") return "Windows OS";
  if (normalized === "mac-os") return "Mac OS";
  return "Windows Terminal";
}

function inferPromptSimulationSurface(prompt = "") {
  const source = String(prompt || "").toLowerCase();
  const mentionsWindows = /\bwindows\b|\bwin(?:10|11)?\b|powershell|command prompt|\bcmd\b/.test(source);
  const mentionsMac = /\bmac\s?os\b|\bmacbook\b|\bmac\b|\bos x\b|finder|keychain/.test(source);
  const terminalHint = /\bterminal\b|powershell|command prompt|\bcmd\b|\bbash\b|\bzsh\b|\bshell\b|\bsudo\b/.test(source);
  const guiHint = /\bsettings\b|\bcontrol panel\b|\bsystem settings\b|\bdevice manager\b|\bfinder\b|\bclick\b/.test(source);

  if (mentionsWindows && !mentionsMac) {
    if (terminalHint) return "windows-terminal";
    if (guiHint) return "windows-os";
    return "windows-terminal";
  }

  if (mentionsMac && !mentionsWindows) {
    if (terminalHint) return "mac-terminal";
    if (guiHint) return "mac-os";
    return "mac-terminal";
  }

  if (terminalHint) {
    if (/\bbash\b|\bzsh\b|\bbrew\b/.test(source)) return "mac-terminal";
    return "windows-terminal";
  }

  if (guiHint) {
    return "windows-os";
  }

  return null;
}

function evaluateSimulationPromptAlignment(prompt = "") {
  const raw = String(prompt || "").trim();
  const normalized = normalizePrompt(raw);
  if (!normalized || normalized.length < 8) {
    return { allowed: false, reason: "Prompt is too short for simulation alignment." };
  }

  if (UNSUPPORTED_PLATFORM_PATTERN.test(normalized)) {
    return { allowed: false, reason: "Prompt targets an unsupported platform." };
  }

  if (PHYSICAL_DAMAGE_PATTERN.test(normalized) && PHYSICAL_DEVICE_PATTERN.test(normalized)) {
    return { allowed: false, reason: "Prompt describes physical hardware repair outside simulation surfaces." };
  }

  const hasIntent = SIMULATION_INTENT_PATTERN.test(normalized);
  const hasDomain = SIMULATION_DOMAIN_PATTERN.test(normalized);
  if (!hasDomain) {
    return {
      allowed: false,
      reason: hasIntent
        ? "Prompt has troubleshooting intent but no supported IT troubleshooting domain."
        : "Prompt does not map to a supported IT troubleshooting domain."
    };
  }

  const inferredSurface = inferPromptSimulationSurface(raw) || "windows-terminal";
  return {
    allowed: true,
    surface: inferredSurface,
    surfaceLabel: toSimulationSurfaceLabel(inferredSurface)
  };
}

function buildFallbackSimulationDefinition({ title, category, prompt, surface }) {
  const safeTitle = String(title || "Simulation Scenario").trim();
  const safeCategory = String(category || "General").trim();
  const scenarioType = inferScenarioType(safeCategory, prompt);
  const promptContext = String(prompt || safeTitle).trim();
  return {
    title: safeTitle,
    scenarioType,
    surface,
    terminalType: mapSurfaceToTerminalType(surface),
    steps: [
      {
        title: "Collect Ticket Context",
        desc: `Capture user symptoms and impact for <b>${safeTitle}</b>.`,
        screen: `> Ticket opened\n> Category: ${safeCategory}\n> User prompt: ${promptContext}`,
        action: "Confirm affected systems, time started, and business impact.",
        result: "Incident context documented."
      },
      {
        title: "Run Initial Diagnostics",
        desc: "Perform baseline health checks for the affected area.",
        screen: "> Running baseline checks...\n> Connectivity / service / logs captured",
        action: "Use safe read-only checks to isolate probable fault domain.",
        result: "Initial diagnostics completed."
      },
      {
        title: "Apply Corrective Action",
        desc: "Execute approved remediation steps aligned with support policy.",
        screen: "> Remediation commands executed\n> Evidence captured in ticket notes",
        action: "Apply one change at a time and monitor immediate behavior.",
        result: "Corrective action applied."
      },
      {
        title: "Validate Recovery",
        desc: "Verify technical recovery and user-facing service restoration.",
        screen: "> Validation tests passed\n> User confirmation received",
        action: "Confirm no regression before closing the incident.",
        result: "Recovery validated."
      },
      {
        title: "Document and Close",
        desc: "Record root cause, actions taken, and preventive guidance.",
        screen: "> Ticket notes updated\n> Resolution and lessons learned saved",
        action: "Attach proof, summarize resolution, and close the ticket.",
        result: "Simulation completed."
      }
    ]
  };
}

function sanitizeSimulationDefinition(definition, fallback) {
  const source = definition && typeof definition === "object" ? definition : {};
  const surface = ["windows-terminal", "mac-terminal", "windows-os", "mac-os"].includes(String(source.surface || "").trim().toLowerCase())
    ? String(source.surface).trim().toLowerCase()
    : fallback.surface || (String(source.terminalType || "").trim().toLowerCase() === "mac-terminal" ? "mac-terminal" : "windows-terminal");
  const safeTerminalType = surface === "windows-terminal" || surface === "mac-terminal" ? surface : null;
  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  const steps = rawSteps
    .map((step, index) => ({
      title: String(step?.title || `Step ${index + 1}`).trim(),
      desc: String(step?.desc || "").trim(),
      screen: String(step?.screen || "").trim(),
      action: String(step?.action || "").trim(),
      result: String(step?.result || "").trim()
    }))
    .filter((step) => step.title)
    .slice(0, 12);

  if (steps.length === 0) {
    return fallback;
  }
  return {
    title: String(source.title || fallback.title).trim() || fallback.title,
    scenarioType: String(source.scenarioType || fallback.scenarioType || "general").trim().toLowerCase() || "general",
    surface,
    terminalType: safeTerminalType,
    steps
  };
}

async function generateSimulationDraftFromPrompt(prompt, occurrences = 1, options = {}) {
  const alignment =
    options?.alignment && options.alignment.allowed
      ? options.alignment
      : evaluateSimulationPromptAlignment(prompt);
  if (!alignment.allowed) {
    return null;
  }

  const fallback = {
    title: titleFromPrompt(prompt),
    category: inferCategory(prompt),
    difficulty: inferDifficulty(prompt, occurrences)
  };
  const fallbackSimulation = buildFallbackSimulationDefinition({
    title: fallback.title,
    category: fallback.category,
    prompt,
    surface: alignment.surface
  });

  const client = getOpenAIClient();
  if (!client) {
    return {
      ...fallback,
      simulation: fallbackSimulation,
      recommendedSurface: alignment.surface,
      recommendedSurfaceLabel: alignment.surfaceLabel
    };
  }

  try {
    const provider = getAIProvider();
    const preferredTerminalType = mapSurfaceToTerminalType(alignment.surface);
    const completion = await client.chat.completions.create({
      model: getDefaultModel(provider),
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `Create an IT support simulation module from a frequent user prompt. The required simulation surface is ${alignment.surfaceLabel}. Return JSON only with this schema: {"title": string, "category": string, "difficulty": "Easy"|"Medium"|"Hard", "simulation": {"title": string, "scenarioType": "general"|"network"|"email"|"printer", "surface": "windows-terminal"|"mac-terminal"|"windows-os"|"mac-os", "terminalType": "windows-terminal"|"mac-terminal"|null, "steps": [{"title": string, "desc": string, "screen": string, "action": string, "result": string}]}}. Include 5 to 7 practical steps.`
        },
        {
          role: "user",
          content: `Prompt: ${String(prompt || "").slice(0, 500)}\nFrequency: ${Number(occurrences) || 1}`
        }
      ]
    });
    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw);
    const title = String(parsed?.title || "").trim() || fallback.title;
    const category = String(parsed?.category || "").trim() || fallback.category;
    const difficulty = DIFFICULTY_LEVELS.includes(parsed?.difficulty) ? parsed.difficulty : fallback.difficulty;
    const fallbackForTitle = buildFallbackSimulationDefinition({ title, category, prompt, surface: alignment.surface });
    const simulation = sanitizeSimulationDefinition(parsed?.simulation, fallbackForTitle);
    simulation.surface = alignment.surface;
    simulation.terminalType = preferredTerminalType;
    return {
      title,
      category,
      difficulty,
      simulation,
      recommendedSurface: alignment.surface,
      recommendedSurfaceLabel: alignment.surfaceLabel
    };
  } catch (_err) {
    return {
      ...fallback,
      simulation: fallbackSimulation,
      recommendedSurface: alignment.surface,
      recommendedSurfaceLabel: alignment.surfaceLabel
    };
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    return res.status(200).json({ users });
  } catch (err) {
    return next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { firstName, lastName, email, password, role, isActive } = req.body;

    if (!isAllowedAdminUserPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include uppercase, number, and special character, or be password123."
      });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const created = await prisma.user.create({
      data: {
        firstName: String(firstName || "").trim(),
        lastName: String(lastName || "").trim(),
        email: normalizedEmail,
        passwordHash,
        role: role || "USER",
        isActive: typeof isActive === "boolean" ? isActive : true
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    return res.status(201).json({ user: created });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const { firstName, lastName, email, password, role, isActive } = req.body;

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.id === userId && isActive === false) {
      return res.status(400).json({ message: "Admin cannot deactivate their own account" });
    }
    if (req.user.id === userId && role === "USER") {
      return res.status(400).json({ message: "Admin cannot demote their own account" });
    }

    if (password && !isAllowedAdminUserPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include uppercase, number, and special character, or be password123."
      });
    }

    const nextEmail = typeof email === "string" ? email.trim().toLowerCase() : undefined;
    if (nextEmail && nextEmail !== existing.email) {
      const emailConflict = await prisma.user.findUnique({ where: { email: nextEmail } });
      if (emailConflict && emailConflict.id !== userId) {
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    const passwordHash = password ? await hashPassword(password) : undefined;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: typeof firstName === "string" ? firstName.trim() : undefined,
        lastName: typeof lastName === "string" ? lastName.trim() : undefined,
        email: nextEmail,
        passwordHash,
        role: role ?? undefined,
        isActive: typeof isActive === "boolean" ? isActive : undefined
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    return res.status(200).json({ user: updated });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return next(err);
  }
}

async function hardDeleteUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) {
      return res.status(400).json({ message: "Admin cannot delete their own account" });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function getPolicyEvents(req, res, next) {
  try {
    const limit = Number(req.query.limit || 100);
    const events = await listPolicyEvents(limit);
    return res.status(200).json({ events });
  } catch (err) {
    return next(err);
  }
}

async function getPolicySummaryAdmin(_req, res, next) {
  try {
    const summary = await getPolicySummary();
    return res.status(200).json({ summary });
  } catch (err) {
    return next(err);
  }
}

async function getPolicyConfigAdmin(_req, res, next) {
  try {
    const config = getPolicyConfig();
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function replacePolicyConfigAdmin(req, res, next) {
  try {
    const config = replacePolicyConfig(req.body || {});
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function addPolicyListEntryAdmin(req, res, next) {
  try {
    const listName = String(req.params.listName || "");
    const value = String(req.body?.value || "");
    const config = addPolicyListEntry(listName, value);
    if (!config) {
      return res.status(400).json({ message: "Invalid list or entry value" });
    }
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function updatePolicyListEntryAdmin(req, res, next) {
  try {
    const listName = String(req.params.listName || "");
    const index = Number(req.params.index);
    const value = String(req.body?.value || "");
    const config = updatePolicyListEntry(listName, index, value);
    if (!config) {
      return res.status(400).json({ message: "Invalid list, index, or entry value" });
    }
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function deletePolicyListEntryAdmin(req, res, next) {
  try {
    const listName = String(req.params.listName || "");
    const index = Number(req.params.index);
    const config = deletePolicyListEntry(listName, index);
    if (!config) {
      return res.status(400).json({ message: "Invalid list or index" });
    }
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function resetPolicyConfigAdmin(_req, res, next) {
  try {
    const config = resetPolicyConfig();
    return res.status(200).json({ config });
  } catch (err) {
    return next(err);
  }
}

async function getSimulationModules(_req, res, next) {
  try {
    const modules = await listModules();
    return res.status(200).json({ modules });
  } catch (err) {
    return next(err);
  }
}

async function getSimulationPromptInsights(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 50), 200));
    const existingModules = await listModules();
    const createdPromptKeys = new Set(
      existingModules
        .map((module) => normalizePrompt(module.sourcePrompt))
        .filter((normalized) => normalized && normalized.length >= 8)
    );
    const events = (await listPolicyEvents(limit)).filter(
      (event) =>
        !event.blocked &&
        SIMULATION_ELIGIBLE_POLICY_CODES.has(String(event.code || "").trim().toUpperCase()) &&
        String(event.message || "").trim()
    );

    const grouped = new Map();
    for (const event of events) {
      const normalized = normalizePrompt(event.message);
      if (!normalized || normalized.length < 8) {
        continue;
      }
      if (disregardedPromptInsightKeys.has(normalized) || createdPromptKeys.has(normalized)) {
        continue;
      }
      const alignment = evaluateSimulationPromptAlignment(event.message);
      if (!alignment.allowed) {
        continue;
      }
      const current = grouped.get(normalized) || {
        normalized,
        samplePrompt: String(event.message || "").trim(),
        occurrences: 0,
        lastSeen: event.at,
        uniqueUsers: new Set(),
        recommendedSurface: alignment.surface,
        recommendedSurfaceLabel: alignment.surfaceLabel
      };
      current.occurrences += 1;
      current.lastSeen = current.lastSeen > event.at ? current.lastSeen : event.at;
      current.uniqueUsers.add(event.userEmail || "unknown");
      grouped.set(normalized, current);
    }

    const insights = Array.from(grouped.values())
      .map((item) => ({
        normalized: item.normalized,
        samplePrompt: item.samplePrompt,
        occurrences: item.occurrences,
        uniqueUsers: item.uniqueUsers.size,
        lastSeen: item.lastSeen,
        suggestedCategory: inferCategory(item.samplePrompt),
        recommendedSurface: item.recommendedSurface || "windows-terminal",
        recommendedSurfaceLabel: item.recommendedSurfaceLabel || "Windows Terminal"
      }))
      .sort((a, b) => {
        if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
        return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      })
      .slice(0, 20);

    return res.status(200).json({ insights });
  } catch (err) {
    return next(err);
  }
}

async function disregardSimulationPromptInsight(req, res, next) {
  try {
    const normalized = normalizePrompt(req.body?.sourcePrompt);
    if (!normalized || normalized.length < 8) {
      return res.status(400).json({ message: "A valid sourcePrompt is required." });
    }
    disregardedPromptInsightKeys.add(normalized);
    return res.status(200).json({ disregarded: true, normalized });
  } catch (err) {
    return next(err);
  }
}

async function generateSimulationModuleDraft(req, res, next) {
  try {
    const mode = String(req.body?.mode || "from_prompt");
    if (mode === "from_prompt") {
      const sourcePrompt = String(req.body?.sourcePrompt || "").trim();
      if (!sourcePrompt) {
        return res.status(400).json({ message: "sourcePrompt is required for mode from_prompt" });
      }
      const alignment = evaluateSimulationPromptAlignment(sourcePrompt);
      if (!alignment.allowed) {
        return res.status(400).json({
          message:
            "Prompt is outside supported simulation surfaces (Windows Terminal, Mac Terminal, Windows OS, Mac OS)."
        });
      }
      const occurrences = Math.max(1, Number(req.body?.occurrences || 1));
      const draft = await generateSimulationDraftFromPrompt(sourcePrompt, occurrences, { alignment });
      if (!draft) {
        return res.status(400).json({
          message:
            "Prompt is outside supported simulation surfaces (Windows Terminal, Mac Terminal, Windows OS, Mac OS)."
        });
      }
      return res.status(200).json({ draft, sourcePrompt, occurrences, recommendedSurface: alignment.surface });
    }

    const title = String(req.body?.title || "").trim();
    const category = String(req.body?.category || "").trim();
    if (!title || !category) {
      return res.status(400).json({ message: "title and category are required for mode manual" });
    }
    const draft = {
      title,
      category,
      difficulty: inferDifficulty(`${title} ${category}`, 1),
      simulation: buildFallbackSimulationDefinition({ title, category, prompt: title })
    };
    return res.status(200).json({ draft });
  } catch (err) {
    return next(err);
  }
}

async function createSimulationModule(req, res, next) {
  try {
    const mode = String(req.body?.mode || "manual");
    let payload = {
      title: req.body?.title,
      category: req.body?.category,
      difficulty: req.body?.difficulty,
      enabled: req.body?.enabled,
      simulation: req.body?.simulation,
      sourcePrompt: req.body?.sourcePrompt
    };

    if (mode === "from_prompt") {
      const sourcePrompt = String(req.body?.sourcePrompt || "").trim();
      if (!sourcePrompt) {
        return res.status(400).json({ message: "sourcePrompt is required for mode from_prompt" });
      }
      const alignment = evaluateSimulationPromptAlignment(sourcePrompt);
      if (!alignment.allowed) {
        return res.status(400).json({
          message:
            "Prompt is outside supported simulation surfaces (Windows Terminal, Mac Terminal, Windows OS, Mac OS)."
        });
      }
      const occurrences = Math.max(1, Number(req.body?.occurrences || 1));
      const draft = await generateSimulationDraftFromPrompt(sourcePrompt, occurrences, { alignment });
      if (!draft) {
        return res.status(400).json({
          message:
            "Prompt is outside supported simulation surfaces (Windows Terminal, Mac Terminal, Windows OS, Mac OS)."
        });
      }
      payload = {
        ...draft,
        enabled: true,
        sourcePrompt,
        simulation: draft.simulation
      };
    }

    if (mode === "manual") {
      const sourcePrompt = String(req.body?.sourcePrompt || "").trim();
      if (sourcePrompt && !payload.simulation) {
        payload.simulation = buildFallbackSimulationDefinition({
          title: payload.title,
          category: payload.category,
          prompt: sourcePrompt
        });
      }
    }

    const created = await createModule(payload);
    if (!created) {
      return res.status(400).json({ message: "Invalid module payload" });
    }
    return res.status(201).json({ module: created });
  } catch (err) {
    return next(err);
  }
}

async function updateSimulationModule(req, res, next) {
  try {
    const id = String(req.params.id || "");
    const module = await updateModule(id, req.body || {});
    if (!module) {
      return res.status(404).json({ message: "Simulation module not found" });
    }
    return res.status(200).json({ module });
  } catch (err) {
    return next(err);
  }
}

async function deleteSimulationModule(req, res, next) {
  try {
    const id = String(req.params.id || "");
    const removed = await deleteModule(id);
    if (!removed) {
      return res.status(404).json({ message: "Simulation module not found" });
    }
    return res.status(200).json({ module: removed });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  hardDeleteUser,
  getPolicyEvents,
  getPolicySummaryAdmin,
  getPolicyConfigAdmin,
  replacePolicyConfigAdmin,
  addPolicyListEntryAdmin,
  updatePolicyListEntryAdmin,
  deletePolicyListEntryAdmin,
  resetPolicyConfigAdmin,
  getSimulationModules,
  getSimulationPromptInsights,
  disregardSimulationPromptInsight,
  generateSimulationModuleDraft,
  createSimulationModule,
  updateSimulationModule,
  deleteSimulationModule
};
