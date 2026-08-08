const fs = require("fs");
const path = require("path");
const prisma = require("../prisma");

const POLICY_LIST_KEYS = [
  "greetingPatterns",
  "inScopeKeywords",
  "outOfScopeKeywords",
  "inScopeIntentPatterns"
];

const POLICY_MESSAGES_KEYS = [
  "greetingReply",
  "outOfScopeMessage",
  "mixedScopeMessage",
  "followUpNoContextMessage",
  "emptyPromptMessage",
  "promptTooLongMessage",
  "defaultOutOfScopeMessage",
  "clarifyMessage"
];

const DEFAULT_POLICY_CONFIG = {
  greetingPatterns: [
    "hi",
    "hello",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
    "yo",
    "hi there",
    "hello there"
  ],
  inScopeKeywords: [
    "computer", "laptop", "desktop", "pc", "workstation",
    "monitor", "display", "screen", "keyboard", "mouse",
    "printer", "scanner", "webcam", "microphone", "headset",
    "headphones", "speaker", "audio", "usb", "hdmi", "ram",
    "hard drive", "ssd", "hdd", "disk", "power supply", "ups",
    "post error", "beep code", "peripheral", "device",
    "network", "internet", "wifi", "wi-fi", "lan", "ethernet",
    "vpn", "router", "switch", "access point", "gateway",
    "dns", "ip address", "dhcp", "subnet", "mac address",
    "ping", "tracert", "traceroute", "packet loss", "bandwidth",
    "firewall", "port", "proxy", "nat",
    "windows", "macos", "mac os", "linux", "ubuntu",
    "os", "operating system", "bsod", "blue screen",
    "crash", "freeze", "freezing", "slow", "high cpu", "high ram",
    "task manager", "services", "startup", "boot", "reboot",
    "safe mode", "recovery", "restore", "reinstall",
    "driver", "update", "patch", "install", "uninstall",
    "software", "application", "app", "program", "executable",
    "registry", "group policy", "gpo", "systemctl", "powershell",
    "command prompt", "cmd", "terminal", "bash",
    "outlook", "email", "e-mail", "exchange", "smtp", "imap",
    "calendar", "teams", "zoom", "slack",
    "account", "password", "passcode", "pin",
    "login", "log in", "sign in", "logout", "sign out",
    "authentication", "2fa", "mfa", "otp",
    "access", "permission", "privilege", "role",
    "active directory", "aduc", "ad", "ldap",
    "locked account", "unlock", "reset password", "expired password",
    "domain", "user profile",
    "file", "folder", "document", "onedrive", "sharepoint",
    "google drive", "backup", "restore", "deleted file",
    "file recovery", "shared drive", "mapped drive", "network drive",
    "malware", "virus", "ransomware", "spyware", "phishing",
    "antivirus", "endpoint", "security", "threat", "intrusion",
    "data breach", "suspicious email", "spam",
    "ssh", "rdp", "remote desktop", "remote access",
    "server", "virtual machine", "vm", "hypervisor",
    "ticketing", "helpdesk", "service desk", "it support",
    "incident", "ticket"
  ],
  inScopeIntentPatterns: [
    "not working", "won't work", "doesn't work", "stopped working",
    "can't connect", "cannot connect", "unable to connect",
    "connection failed", "connection dropped", "connection lost",
    "error", "failed", "failure", "fault", "malfunction", "corrupted",
    "crash", "crashed", "crashing",
    "how do i fix", "how to fix", "how do i reset", "how to reset",
    "how do i configure", "how to configure", "how do i set up", "how to set up",
    "how do i install", "how to install", "how do i uninstall", "how to uninstall",
    "how do i update", "how to update", "how do i enable", "how to enable",
    "how do i disable", "how to disable", "how do i unlock", "how to unlock",
    "how do i recover", "how to recover",
    "steps to fix", "steps to resolve", "steps to troubleshoot", "steps to reset", "steps to configure",
    "reset password", "unlock account", "recover account", "configure network", "set up printer",
    "troubleshoot issue", "diagnose problem", "fix error", "resolve fault"
  ],
  outOfScopeKeywords: [
    "dating", "relationship", "boyfriend", "girlfriend", "marriage",
    "divorce", "breakup", "love", "crush", "romance", "hookup",
    "fitness", "workout", "exercise", "diet", "weight loss",
    "nutrition", "calories", "gym", "yoga", "meditation",
    "medical", "medicine", "doctor", "diagnosis", "prescription",
    "symptom", "disease", "illness", "treatment", "hospital",
    "stocks", "crypto", "bitcoin", "ethereum", "trading",
    "investment", "forex", "tax", "accounting", "budget",
    "gambling", "casino", "poker", "bet", "sports bet", "lottery",
    "movie", "film", "series", "netflix", "anime", "manga",
    "lyrics", "song", "music recommendation", "playlist",
    "game recommendation", "video game tip",
    "astrology", "zodiac", "horoscope", "tarot", "numerology",
    "recipe", "cooking", "food", "restaurant", "meal plan",
    "travel", "vacation", "itinerary", "hotel", "flight booking",
    "tourism", "visa application",
    "politics", "election", "president", "government policy",
    "news", "current events",
    "essay", "homework", "thesis", "history", "geography",
    "science fair", "math problem", "physics", "chemistry",
    "biology", "literature"
  ],
  messages: {
    greetingReply:
      "Hello! I am HelpDesk AI. I can assist with IT issues such as login and account access, password resets, email and Outlook problems, network and VPN connectivity, hardware troubleshooting, software errors, printer issues, and security concerns. What can I help you with today?",
    outOfScopeMessage:
      "This system only supports IT helpdesk topics. Please ask about account access, hardware, network, software, email, security, or system troubleshooting.",
    mixedScopeMessage:
      "Your message appears to contain topics outside the scope of IT helpdesk support. Please focus your question on IT-related issues.",
    followUpNoContextMessage:
      "It looks like you're starting a new conversation. Please describe your IT support issue so I can assist you.",
    emptyPromptMessage: "Please enter your IT support question.",
    promptTooLongMessage: "Your prompt is too long. Please shorten it to continue.",
    defaultOutOfScopeMessage:
      "I can only assist with IT support topics such as account access, hardware issues, network problems, software errors, email, security, or server troubleshooting. Please rephrase your question.",
    clarifyMessage:
      "Could you clarify if this is an IT-related issue? I'm here to help with IT support topics."
  }
};

const DATA_DIR = path.resolve(__dirname, "../../data");
const POLICY_CONFIG_PATH = path.join(DATA_DIR, "policy-config.json");
const POLICY_RULE_TYPES = {
  greetingPatterns: "GREETING_PATTERN",
  inScopeKeywords: "IN_SCOPE_KEYWORD",
  outOfScopeKeywords: "OUT_OF_SCOPE_KEYWORD",
  inScopeIntentPatterns: "IN_SCOPE_INTENT"
};
const PLAIN_LANGUAGE_LISTS = new Set(["greetingPatterns", "inScopeIntentPatterns"]);
const REGEX_CONTROL_CHARACTER_PATTERN = /[\\^$|()[\]{}*?]/;
const LEGACY_INTENT_PATTERNS = {
  "\\b(not working|won't work|doesn't work|stopped working)\\b": ["not working", "won't work", "doesn't work", "stopped working"],
  "\\b(can't connect|cannot connect|unable to connect|connection (failed|dropped|lost))\\b": ["can't connect", "cannot connect", "unable to connect", "connection failed", "connection dropped", "connection lost"],
  "\\b(error|failed|failure|fault|malfunction|corrupted|crash(ed|ing)?)\\b": ["error", "failed", "failure", "fault", "malfunction", "corrupted", "crash", "crashed", "crashing"],
  "\\b(how (do i|to) (fix|reset|configure|set up|setup|install|uninstall|update|enable|disable|unlock|recover))\\b": DEFAULT_POLICY_CONFIG.inScopeIntentPatterns.slice(19, 41),
  "\\b(steps to (fix|resolve|troubleshoot|reset|configure))\\b": ["steps to fix", "steps to resolve", "steps to troubleshoot", "steps to reset", "steps to configure"],
  "\\b(reset|unlock|recover|configure|setup|set up)\\b.*\\b(password|account|network|device|printer|computer|laptop|email|vpn|wifi)\\b": ["reset password", "unlock account", "recover account", "configure network", "set up printer"],
  "\\b(troubleshoot|diagnose|fix|resolve)\\b.*\\b(issue|problem|error|fault)\\b": ["troubleshoot issue", "diagnose problem", "fix error", "resolve fault"]
};

let cachedConfig = null;
let initializationPromise = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStringArray(input, { lower = false } = {}) {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized = input
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .map((entry) => (lower ? entry.toLowerCase() : entry));

  return Array.from(new Set(normalized));
}

function isPlainLanguagePolicyEntry(listName, value) {
  return !PLAIN_LANGUAGE_LISTS.has(listName) || !REGEX_CONTROL_CHARACTER_PATTERN.test(String(value || ""));
}

function upgradeLegacyPolicyConfig(config) {
  const greetingPatterns = Array.isArray(config.greetingPatterns) ? config.greetingPatterns : DEFAULT_POLICY_CONFIG.greetingPatterns;
  const inScopeIntentPatterns = Array.isArray(config.inScopeIntentPatterns) ? config.inScopeIntentPatterns : DEFAULT_POLICY_CONFIG.inScopeIntentPatterns;
  return {
    ...config,
    greetingPatterns: greetingPatterns.map((entry) =>
      String(entry).replace(/^\^/, "").replace(/\\b$/, "")
    ),
    inScopeIntentPatterns: Array.from(new Set(inScopeIntentPatterns.flatMap((entry) => LEGACY_INTENT_PATTERNS[entry] || [entry])))
  };
}

function sanitizeMessages(messages) {
  const next = { ...DEFAULT_POLICY_CONFIG.messages };
  const source = messages && typeof messages === "object" ? messages : {};

  for (const key of POLICY_MESSAGES_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      next[key] = value.trim();
    }
  }

  return next;
}

function sanitizePolicyConfig(rawConfig) {
  const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

  return {
    greetingPatterns: normalizeStringArray(source.greetingPatterns).filter((value) => isPlainLanguagePolicyEntry("greetingPatterns", value)),
    inScopeKeywords: normalizeStringArray(source.inScopeKeywords, { lower: true }),
    outOfScopeKeywords: normalizeStringArray(source.outOfScopeKeywords, { lower: true }),
    inScopeIntentPatterns: normalizeStringArray(source.inScopeIntentPatterns).filter((value) => isPlainLanguagePolicyEntry("inScopeIntentPatterns", value)),
    messages: sanitizeMessages(source.messages)
  };
}

function loadLegacyConfig() {
  try {
    if (!fs.existsSync(POLICY_CONFIG_PATH)) {
      return clone(DEFAULT_POLICY_CONFIG);
    }

    const raw = fs.readFileSync(POLICY_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return sanitizePolicyConfig(upgradeLegacyPolicyConfig({
      ...DEFAULT_POLICY_CONFIG,
      ...parsed,
      messages: { ...DEFAULT_POLICY_CONFIG.messages, ...(parsed?.messages || {}) }
    }));
  } catch (_err) {
    return clone(DEFAULT_POLICY_CONFIG);
  }
}

function ruleRowsForConfig(config, createdById = null) {
  return POLICY_LIST_KEYS.flatMap((listName) =>
    config[listName].map((value, position) => ({
      type: POLICY_RULE_TYPES[listName],
      value,
      position,
      enabled: true,
      createdById
    }))
  );
}

function configFromRows(configRow, rules) {
  const config = {
    greetingPatterns: [],
    inScopeKeywords: [],
    outOfScopeKeywords: [],
    inScopeIntentPatterns: [],
    messages: sanitizeMessages(configRow?.messages)
  };

  for (const listName of POLICY_LIST_KEYS) {
    config[listName] = rules
      .filter((rule) => rule.enabled && rule.type === POLICY_RULE_TYPES[listName])
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
      .map((rule) => rule.value);
  }

  return sanitizePolicyConfig(config);
}

async function readConfigFromDb(client = prisma) {
  const [configRow, rules] = await Promise.all([
    client.policyConfig.findUnique({ where: { id: 1 } }),
    client.policyRule.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] })
  ]);
  return configFromRows(configRow, rules);
}

async function initializePolicyConfig() {
  if (cachedConfig) {
    return clone(cachedConfig);
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const existing = await prisma.policyConfig.findUnique({ where: { id: 1 } });
    if (!existing) {
      const initialConfig = loadLegacyConfig();
      await prisma.$transaction(async (tx) => {
        await tx.policyConfig.upsert({
          where: { id: 1 },
          update: {},
          create: { id: 1, messages: initialConfig.messages }
        });
        await tx.policyRule.createMany({
          data: ruleRowsForConfig(initialConfig),
          skipDuplicates: true
        });
      });
    }

    cachedConfig = await readConfigFromDb();
    return clone(cachedConfig);
  })().finally(() => {
    initializationPromise = null;
  });

  return initializationPromise;
}

function toKeywordRegExpList(keywords) {
  return keywords
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean)
    .map((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const compact = escaped.replace(/\s+/g, "\\s+");
      try {
        return new RegExp(`\\b${compact}\\b`, "i");
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

async function getPolicyConfig() {
  try {
    await initializePolicyConfig();
    cachedConfig = await readConfigFromDb();
    return clone(cachedConfig);
  } catch (error) {
    console.error("[PolicyConfig] Database unavailable; using read-only legacy configuration.", error?.message || error);
    return loadLegacyConfig();
  }
}

async function getPolicyRuntimeConfig() {
  const config = await getPolicyConfig();
  return {
    ...clone(config),
    greetingPatternRegex: toKeywordRegExpList(config.greetingPatterns),
    inScopeIntentRegex: toKeywordRegExpList(config.inScopeIntentPatterns),
    inScopeKeywordRegex: toKeywordRegExpList(config.inScopeKeywords),
    outOfScopeKeywordRegex: toKeywordRegExpList(config.outOfScopeKeywords)
  };
}

async function replacePolicyConfig(nextConfig, updatedById = null) {
  const next = sanitizePolicyConfig(nextConfig);
  const ruleRows = ruleRowsForConfig(next, updatedById);
  await prisma.$transaction(async (tx) => {
    await tx.policyRule.deleteMany();
    await tx.policyConfig.upsert({
      where: { id: 1 },
      update: { messages: next.messages, version: { increment: 1 }, updatedById },
      create: { id: 1, messages: next.messages, updatedById }
    });
    if (ruleRows.length > 0) {
      await tx.policyRule.createMany({ data: ruleRows });
    }
  });
  cachedConfig = next;
  return clone(cachedConfig);
}

async function addPolicyListEntry(listName, value, updatedById = null) {
  if (!POLICY_LIST_KEYS.includes(listName)) {
    return null;
  }

  const normalized = String(value || "").trim();
  if (!normalized || !isPlainLanguagePolicyEntry(listName, normalized)) {
    return null;
  }

  const storedValue =
    listName === "inScopeKeywords" || listName === "outOfScopeKeywords"
      ? normalized.toLowerCase()
      : normalized;

  const current = await getPolicyConfig();
  if (current[listName].includes(storedValue)) {
    return current;
  }

  const type = POLICY_RULE_TYPES[listName];
  await prisma.$transaction(async (tx) => {
    const aggregate = await tx.policyRule.aggregate({ where: { type }, _max: { position: true } });
    await tx.policyRule.create({
      data: {
        type,
        value: storedValue,
        position: (aggregate._max.position ?? -1) + 1,
        createdById: updatedById
      }
    });
    await tx.policyConfig.update({ where: { id: 1 }, data: { version: { increment: 1 }, updatedById } });
  });
  cachedConfig = await readConfigFromDb();
  return clone(cachedConfig);
}

async function updatePolicyListEntry(listName, index, value, updatedById = null) {
  if (!POLICY_LIST_KEYS.includes(listName)) {
    return null;
  }

  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) {
    return null;
  }

  const normalized = String(value || "").trim();
  if (!normalized || !isPlainLanguagePolicyEntry(listName, normalized)) {
    return null;
  }

  await initializePolicyConfig();
  const storedValue =
    listName === "inScopeKeywords" || listName === "outOfScopeKeywords"
      ? normalized.toLowerCase()
      : normalized;
  const type = POLICY_RULE_TYPES[listName];
  const rules = await prisma.policyRule.findMany({ where: { type }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const target = rules[idx];
  if (!target) return null;

  await prisma.$transaction(async (tx) => {
    const duplicate = await tx.policyRule.findFirst({ where: { type, value: storedValue, id: { not: target.id } } });
    if (duplicate) {
      await tx.policyRule.delete({ where: { id: target.id } });
    } else {
      await tx.policyRule.update({ where: { id: target.id }, data: { value: storedValue } });
    }
    await tx.policyConfig.update({ where: { id: 1 }, data: { version: { increment: 1 }, updatedById } });
  });
  cachedConfig = await readConfigFromDb();
  return clone(cachedConfig);
}

async function deletePolicyListEntry(listName, index, updatedById = null) {
  if (!POLICY_LIST_KEYS.includes(listName)) {
    return null;
  }

  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) {
    return null;
  }

  await initializePolicyConfig();
  const type = POLICY_RULE_TYPES[listName];
  const rules = await prisma.policyRule.findMany({ where: { type }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const target = rules[idx];
  if (!target) return null;

  await prisma.$transaction([
    prisma.policyRule.delete({ where: { id: target.id } }),
    prisma.policyConfig.update({ where: { id: 1 }, data: { version: { increment: 1 }, updatedById } })
  ]);
  cachedConfig = await readConfigFromDb();
  return clone(cachedConfig);
}

async function resetPolicyConfig(updatedById = null) {
  return replacePolicyConfig(DEFAULT_POLICY_CONFIG, updatedById);
}

module.exports = {
  POLICY_LIST_KEYS,
  POLICY_MESSAGES_KEYS,
  isPlainLanguagePolicyEntry,
  initializePolicyConfig,
  getPolicyConfig,
  getPolicyRuntimeConfig,
  replacePolicyConfig,
  addPolicyListEntry,
  updatePolicyListEntry,
  deletePolicyListEntry,
  resetPolicyConfig
};
