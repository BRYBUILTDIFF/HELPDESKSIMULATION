const GREETING_PATTERNS = [
  /^hi\b/,
  /^hello\b/,
  /^hey\b/,
  /^good morning\b/,
  /^good afternoon\b/,
  /^good evening\b/,
  /^yo\b/,
  /^hi there\b/,
  /^hello there\b/
];

// --------------------------------------------------------------------------
// IN-SCOPE: Only IT helpdesk topics (hardware, software, network, accounts,
// email, security, system troubleshooting — entry/mid level only).
// --------------------------------------------------------------------------
const IN_SCOPE_KEYWORDS = [
  // Hardware
  "computer", "laptop", "desktop", "pc", "workstation",
  "monitor", "display", "screen", "keyboard", "mouse",
  "printer", "scanner", "webcam", "microphone", "headset",
  "headphones", "speaker", "audio", "usb", "hdmi", "ram",
  "hard drive", "ssd", "hdd", "disk", "power supply", "ups",
  "post error", "beep code", "peripheral", "device",

  // Network & Connectivity
  "network", "internet", "wifi", "wi-fi", "lan", "ethernet",
  "vpn", "router", "switch", "access point", "gateway",
  "dns", "ip address", "dhcp", "subnet", "mac address",
  "ping", "tracert", "traceroute", "packet loss", "bandwidth",
  "firewall", "port", "proxy", "nat",

  // Operating System & Software
  "windows", "macos", "mac os", "linux", "ubuntu",
  "os", "operating system", "bsod", "blue screen",
  "crash", "freeze", "freezing", "slow", "high cpu", "high ram",
  "task manager", "services", "startup", "boot", "reboot",
  "safe mode", "recovery", "restore", "reinstall",
  "driver", "update", "patch", "install", "uninstall",
  "software", "application", "app", "program", "executable",
  "registry", "group policy", "gpo", "systemctl", "powershell",
  "command prompt", "cmd", "terminal", "bash",

  // Email & Communication Tools
  "outlook", "email", "e-mail", "exchange", "smtp", "imap",
  "calendar", "teams", "zoom", "slack",

  // Account & Access Management
  "account", "password", "passcode", "pin",
  "login", "log in", "sign in", "logout", "sign out",
  "authentication", "2fa", "mfa", "otp",
  "access", "permission", "privilege", "role",
  "active directory", "aduc", "ad", "ldap",
  "locked account", "unlock", "reset password", "expired password",
  "domain", "user profile",

  // File & Storage
  "file", "folder", "document", "onedrive", "sharepoint",
  "google drive", "backup", "restore", "deleted file",
  "file recovery", "shared drive", "mapped drive", "network drive",

  // Security
  "malware", "virus", "ransomware", "spyware", "phishing",
  "antivirus", "endpoint", "security", "threat", "intrusion",
  "data breach", "suspicious email", "spam",

  // Remote & Infrastructure (entry/mid level)
  "ssh", "rdp", "remote desktop", "remote access",
  "server", "virtual machine", "vm", "hypervisor",
  "ticketing", "helpdesk", "service desk", "it support",
  "incident", "ticket"
];

// Intent patterns scoped strictly to IT troubleshooting actions
const IN_SCOPE_INTENT_PATTERNS = [
  /\b(not working|won't work|doesn't work|stopped working)\b/,
  /\b(can't connect|cannot connect|unable to connect|connection (failed|dropped|lost))\b/,
  /\b(error|failed|failure|fault|malfunction|corrupted|crash(ed|ing)?)\b/,
  /\b(how (do i|to) (fix|reset|configure|set up|setup|install|uninstall|update|enable|disable|unlock|recover))\b/,
  /\b(steps to (fix|resolve|troubleshoot|reset|configure))\b/,
  /\b(reset|unlock|recover|configure|setup|set up)\b.*\b(password|account|network|device|printer|computer|laptop|email|vpn|wifi)\b/,
  /\b(troubleshoot|diagnose|diagnose|fix|resolve)\b.*\b(issue|problem|error|fault)\b/
];

// --------------------------------------------------------------------------
// OUT-OF-SCOPE: Explicit non-IT topics that must always be rejected.
// This list is broader and more defensive than before.
// --------------------------------------------------------------------------
const OUT_OF_SCOPE_KEYWORDS = [
  // Personal/Social
  "dating", "relationship", "boyfriend", "girlfriend", "marriage",
  "divorce", "breakup", "love", "crush", "romance", "hookup",
  // Wellness & Lifestyle
  "fitness", "workout", "exercise", "diet", "weight loss",
  "nutrition", "calories", "gym", "yoga", "meditation",
  // Medical
  "medical", "medicine", "doctor", "diagnosis", "prescription",
  "symptom", "disease", "illness", "treatment", "hospital",
  // Finance
  "stocks", "crypto", "bitcoin", "ethereum", "trading",
  "investment", "forex", "tax", "accounting", "budget",
  // Gambling & Betting
  "gambling", "casino", "poker", "bet", "sports bet", "lottery",
  // Entertainment
  "movie", "film", "series", "netflix", "anime", "manga",
  "lyrics", "song", "music recommendation", "playlist",
  "game recommendation", "video game tip",
  // Pseudoscience / Astrology
  "astrology", "zodiac", "horoscope", "tarot", "numerology",
  // Food
  "recipe", "cooking", "food", "restaurant", "meal plan",
  // Travel & Leisure
  "travel", "vacation", "itinerary", "hotel", "flight booking",
  "tourism", "visa application",
  // Politics & News
  "politics", "election", "president", "government policy",
  "news", "current events",
  // Academic / General Knowledge (not IT)
  "essay", "homework", "thesis", "history", "geography",
  "science fair", "math problem", "physics", "chemistry",
  "biology", "literature"
];

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function countKeywordMatches(text, keywords) {
  return keywords.reduce(
    (count, kw) => (text.includes(kw.toLowerCase()) ? count + 1 : count),
    0
  );
}

function matchesAnyPattern(text, patterns) {
  return patterns.some((p) => p.test(text));
}

function isGreetingOnly(text) {
  return GREETING_PATTERNS.some((p) => p.test(text)) && text.split(" ").length <= 6;
}

function isShortFollowUp(text) {
  return /^(yes|no|yep|nope|ok|okay|sure|continue|go ahead|proceed|please continue|correct|right)\b[.!?]*$/i.test(text);
}

function buildHistoryContext(history) {
  if (!Array.isArray(history)) return "";
  return history
    .filter(
      (e) =>
        e &&
        (e.role === "user" || e.role === "assistant") &&
        typeof e.content === "string" &&
        e.content.trim()
    )
    .slice(-8)
    .map((e) => e.content.trim())
    .join(" ");
}

// --------------------------------------------------------------------------
// Main policy evaluator
// --------------------------------------------------------------------------
function evaluatePromptPolicy(message, history = []) {
  const normalized = normalize(message);
  const historyContext = normalize(buildHistoryContext(history));

  // 1. Empty input
  if (!normalized) {
    return {
      allowed: false,
      code: "EMPTY_PROMPT",
      reason: "Prompt is empty.",
      userMessage: "Please enter your IT support question."
    };
  }

  // 2. Length guard
  if (normalized.length > 4000) {
    return {
      allowed: false,
      code: "PROMPT_TOO_LONG",
      reason: "Prompt exceeds maximum length.",
      userMessage: "Your prompt is too long. Please shorten it to continue."
    };
  }

  // 3. Greeting-only shortcut
  if (isGreetingOnly(normalized)) {
    return {
      allowed: true,
      code: "GREETING",
      reason: "Greeting detected.",
      directReply:
        "Hello! I am HelpDesk AI. I can assist with IT issues such as login and account access, password resets, email and Outlook problems, network and VPN connectivity, hardware troubleshooting, software errors, printer issues, and security concerns. What can I help you with today?"
    };
  }

  const inScopeScore     = countKeywordMatches(normalized, IN_SCOPE_KEYWORDS);
  const outScopeScore    = countKeywordMatches(normalized, OUT_OF_SCOPE_KEYWORDS);
  const hasInScopeIntent = matchesAnyPattern(normalized, IN_SCOPE_INTENT_PATTERNS);

  const historyInScopeScore     = historyContext ? countKeywordMatches(historyContext, IN_SCOPE_KEYWORDS) : 0;
  const historyHasInScopeIntent = historyContext ? matchesAnyPattern(historyContext, IN_SCOPE_INTENT_PATTERNS) : false;

  // 4. Out-of-scope takes priority when there are NO in-scope signals at all
  if (outScopeScore > 0 && inScopeScore === 0 && !hasInScopeIntent) {
    return {
      allowed: false,
      code: "OUT_OF_SCOPE",
      reason: "Prompt matches an out-of-scope topic with no IT helpdesk signals.",
      userMessage:
        "This system only supports IT helpdesk topics. Please ask about account access, hardware, network, software, email, security, or system troubleshooting."
    };
  }

  // 5. Mixed signal: out-of-scope outweighs in-scope (e.g. someone sneaking
  //    off-topic content alongside a single IT keyword)
  if (outScopeScore > 0 && outScopeScore >= inScopeScore && !hasInScopeIntent) {
    return {
      allowed: false,
      code: "OUT_OF_SCOPE",
      reason: "Out-of-scope content outweighs in-scope IT signals.",
      userMessage:
        "Your message appears to contain topics outside the scope of IT helpdesk support. Please focus your question on IT-related issues."
    };
  }

  // 6. Short follow-up allowed only when recent conversation was in-scope
  if (isShortFollowUp(normalized)) {
    if (historyInScopeScore > 0 || historyHasInScopeIntent) {
      return {
        allowed: true,
        code: "ALLOWED_CONTEXT_FOLLOW_UP",
        reason: "Short follow-up allowed using recent in-scope context."
      };
    }
    // No in-scope history — treat as ambiguous/out-of-scope
    return {
      allowed: false,
      code: "OUT_OF_SCOPE",
      reason: "Short follow-up with no prior in-scope conversation context.",
      userMessage:
        "It looks like you're starting a new conversation. Please describe your IT support issue so I can assist you."
    };
  }

  // 7. Clear in-scope match
  if (inScopeScore > 0 || hasInScopeIntent) {
    return {
      allowed: true,
      code: "ALLOWED",
      reason: "Prompt matches in-scope IT helpdesk policy."
    };
  }

  // 8. Default deny — ambiguous prompts with no IT signal
  return {
    allowed: false,
    code: "OUT_OF_SCOPE",
    reason: "Prompt does not match supported IT helpdesk scope.",
    userMessage:
      "I can only assist with IT support topics such as account access, hardware issues, network problems, software errors, email, security, or server troubleshooting. Please rephrase your question."
  };
}

module.exports = { evaluatePromptPolicy };