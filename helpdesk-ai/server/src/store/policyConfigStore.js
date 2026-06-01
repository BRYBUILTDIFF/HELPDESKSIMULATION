const fs = require("fs");
const path = require("path");

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
    "^hi\\b",
    "^hello\\b",
    "^hey\\b",
    "^good morning\\b",
    "^good afternoon\\b",
    "^good evening\\b",
    "^yo\\b",
    "^hi there\\b",
    "^hello there\\b"
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
    "\\b(not working|won't work|doesn't work|stopped working)\\b",
    "\\b(can't connect|cannot connect|unable to connect|connection (failed|dropped|lost))\\b",
    "\\b(error|failed|failure|fault|malfunction|corrupted|crash(ed|ing)?)\\b",
    "\\b(how (do i|to) (fix|reset|configure|set up|setup|install|uninstall|update|enable|disable|unlock|recover))\\b",
    "\\b(steps to (fix|resolve|troubleshoot|reset|configure))\\b",
    "\\b(reset|unlock|recover|configure|setup|set up)\\b.*\\b(password|account|network|device|printer|computer|laptop|email|vpn|wifi)\\b",
    "\\b(troubleshoot|diagnose|fix|resolve)\\b.*\\b(issue|problem|error|fault)\\b"
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

let cachedConfig = clone(DEFAULT_POLICY_CONFIG);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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
    greetingPatterns: normalizeStringArray(source.greetingPatterns),
    inScopeKeywords: normalizeStringArray(source.inScopeKeywords, { lower: true }),
    outOfScopeKeywords: normalizeStringArray(source.outOfScopeKeywords, { lower: true }),
    inScopeIntentPatterns: normalizeStringArray(source.inScopeIntentPatterns),
    messages: sanitizeMessages(source.messages)
  };
}

function saveConfigToDisk() {
  ensureDataDir();
  fs.writeFileSync(POLICY_CONFIG_PATH, JSON.stringify(cachedConfig, null, 2), "utf8");
}

function loadConfigFromDisk() {
  try {
    if (!fs.existsSync(POLICY_CONFIG_PATH)) {
      cachedConfig = clone(DEFAULT_POLICY_CONFIG);
      saveConfigToDisk();
      return;
    }

    const raw = fs.readFileSync(POLICY_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    cachedConfig = sanitizePolicyConfig({
      ...DEFAULT_POLICY_CONFIG,
      ...parsed,
      messages: { ...DEFAULT_POLICY_CONFIG.messages, ...(parsed?.messages || {}) }
    });
  } catch (_err) {
    cachedConfig = clone(DEFAULT_POLICY_CONFIG);
    saveConfigToDisk();
  }
}

function toRegExpList(patterns) {
  return patterns
    .map((pattern) => {
      try {
        return new RegExp(pattern, "i");
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
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

function getPolicyConfig() {
  return clone(cachedConfig);
}

function getPolicyRuntimeConfig() {
  return {
    ...clone(cachedConfig),
    greetingPatternRegex: toRegExpList(cachedConfig.greetingPatterns),
    inScopeIntentRegex: toRegExpList(cachedConfig.inScopeIntentPatterns),
    inScopeKeywordRegex: toKeywordRegExpList(cachedConfig.inScopeKeywords),
    outOfScopeKeywordRegex: toKeywordRegExpList(cachedConfig.outOfScopeKeywords)
  };
}

function replacePolicyConfig(nextConfig) {
  cachedConfig = sanitizePolicyConfig(nextConfig);
  saveConfigToDisk();
  return getPolicyConfig();
}

function addPolicyListEntry(listName, value) {
  if (!POLICY_LIST_KEYS.includes(listName)) {
    return null;
  }

  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const storedValue =
    listName === "inScopeKeywords" || listName === "outOfScopeKeywords"
      ? normalized.toLowerCase()
      : normalized;

  if (!cachedConfig[listName].includes(storedValue)) {
    cachedConfig[listName].push(storedValue);
    saveConfigToDisk();
  }

  return getPolicyConfig();
}

function updatePolicyListEntry(listName, index, value) {
  if (!POLICY_LIST_KEYS.includes(listName)) {
    return null;
  }

  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= cachedConfig[listName].length) {
    return null;
  }

  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  cachedConfig[listName][idx] =
    listName === "inScopeKeywords" || listName === "outOfScopeKeywords"
      ? normalized.toLowerCase()
      : normalized;

  cachedConfig[listName] = Array.from(new Set(cachedConfig[listName]));
  saveConfigToDisk();
  return getPolicyConfig();
}

function deletePolicyListEntry(listName, index) {
  if (!POLICY_LIST_KEYS.includes(listName)) {
    return null;
  }

  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= cachedConfig[listName].length) {
    return null;
  }

  cachedConfig[listName].splice(idx, 1);
  saveConfigToDisk();
  return getPolicyConfig();
}

function resetPolicyConfig() {
  cachedConfig = clone(DEFAULT_POLICY_CONFIG);
  saveConfigToDisk();
  return getPolicyConfig();
}

loadConfigFromDisk();

module.exports = {
  POLICY_LIST_KEYS,
  POLICY_MESSAGES_KEYS,
  getPolicyConfig,
  getPolicyRuntimeConfig,
  replacePolicyConfig,
  addPolicyListEntry,
  updatePolicyListEntry,
  deletePolicyListEntry,
  resetPolicyConfig
};
