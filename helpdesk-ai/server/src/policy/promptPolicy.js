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

const IN_SCOPE_KEYWORDS = [
  "it",
  "helpdesk",
  "support",
  "technical",
  "computer",
  "laptop",
  "desktop",
  "pc",
  "monitor",
  "keyboard",
  "mouse",
  "printer",
  "scanner",
  "webcam",
  "microphone",
  "headset",
  "audio",
  "network",
  "internet",
  "wifi",
  "lan",
  "vpn",
  "router",
  "switch",
  "dns",
  "ip",
  "dhcp",
  "ping",
  "tracert",
  "outlook",
  "email",
  "exchange",
  "account",
  "password",
  "login",
  "log in",
  "sign in",
  "authentication",
  "access",
  "permission",
  "active directory",
  "aduc",
  "software",
  "install",
  "update",
  "driver",
  "windows",
  "mac",
  "linux",
  "server",
  "website down",
  "slow",
  "freezing",
  "freeze",
  "high cpu",
  "bsod",
  "blue screen",
  "malware",
  "virus",
  "phishing",
  "file recovery",
  "deleted file",
  "onedrive",
  "sharepoint",
  "systemctl",
  "ssh",
  "port",
  "firewall"
];

const IN_SCOPE_INTENT_PATTERNS = [
  /\b(not working|can't|cannot|unable|failed|error|issue|problem|troubleshoot|fix)\b/,
  /\b(how do i|how to|steps|guide)\b/,
  /\b(reset|unlock|recover|configure|setup|set up)\b/
];

const OUT_OF_SCOPE_KEYWORDS = [
  "dating",
  "relationship",
  "boyfriend",
  "girlfriend",
  "astrology",
  "zodiac",
  "horoscope",
  "recipe",
  "cooking",
  "fitness",
  "workout",
  "diet",
  "medical",
  "diagnosis",
  "prescription",
  "stocks",
  "crypto",
  "bitcoin",
  "trading",
  "gambling",
  "casino",
  "sports bet",
  "politics",
  "election",
  "travel itinerary",
  "movie recommendation",
  "lyrics"
];

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function countKeywordMatches(text, keywords) {
  return keywords.reduce((count, keyword) => (text.includes(keyword.toLowerCase()) ? count + 1 : count), 0);
}

function matchesAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isGreetingOnly(text) {
  return GREETING_PATTERNS.some((pattern) => pattern.test(text)) && text.split(" ").length <= 6;
}

function buildHistoryContext(history) {
  if (!Array.isArray(history)) {
    return "";
  }
  return history
    .filter(
      (entry) =>
        entry &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim()
    )
    .slice(-8)
    .map((entry) => entry.content.trim())
    .join(" ");
}

function isShortFollowUp(text) {
  return /^(yes|no|yep|nope|ok|okay|sure|continue|go ahead|proceed|please continue|correct|right)\b[.!?]*$/i.test(
    text
  );
}

function evaluatePromptPolicy(message, history = []) {
  const normalized = normalize(message);
  const historyContext = normalize(buildHistoryContext(history));

  if (!normalized) {
    return {
      allowed: false,
      code: "EMPTY_PROMPT",
      reason: "Prompt is empty.",
      userMessage: "Please enter your IT support question."
    };
  }

  if (normalized.length > 4000) {
    return {
      allowed: false,
      code: "PROMPT_TOO_LONG",
      reason: "Prompt exceeds maximum length.",
      userMessage: "Your prompt is too long. Please shorten it to continue."
    };
  }

  if (isGreetingOnly(normalized)) {
    return {
      allowed: true,
      code: "GREETING",
      reason: "Greeting detected.",
      directReply:
        "Hello! I am HelpDesk AI. I can help with IT issues like login, password, email, network, printer, software, and security problems. What can I help you with today?"
    };
  }

  const inScopeScore = countKeywordMatches(normalized, IN_SCOPE_KEYWORDS);
  const outScopeScore = countKeywordMatches(normalized, OUT_OF_SCOPE_KEYWORDS);
  const hasInScopeIntent = matchesAnyPattern(normalized, IN_SCOPE_INTENT_PATTERNS);
  const historyInScopeScore = historyContext ? countKeywordMatches(historyContext, IN_SCOPE_KEYWORDS) : 0;
  const historyHasInScopeIntent = historyContext ? matchesAnyPattern(historyContext, IN_SCOPE_INTENT_PATTERNS) : false;
  const followUpNeedsContext = isShortFollowUp(normalized);

  if (followUpNeedsContext && (historyInScopeScore > 0 || historyHasInScopeIntent)) {
    return {
      allowed: true,
      code: "ALLOWED_CONTEXT_FOLLOW_UP",
      reason: "Short follow-up allowed using recent in-scope context."
    };
  }

  if (outScopeScore > 0 && inScopeScore === 0 && !hasInScopeIntent) {
    return {
      allowed: false,
      code: "OUT_OF_SCOPE",
      reason: "Prompt matches an out-of-scope topic.",
      userMessage:
        "This system only supports IT helpdesk topics. Please ask about account access, devices, network, software, email, security, or system troubleshooting."
    };
  }

  if (inScopeScore > 0 || hasInScopeIntent) {
    return {
      allowed: true,
      code: "ALLOWED",
      reason: "Prompt matches in-scope IT helpdesk policy."
    };
  }

  return {
    allowed: false,
    code: "OUT_OF_SCOPE",
    reason: "Prompt does not match supported IT helpdesk scope.",
    userMessage:
      "Out-of-scope request. Please ask an IT support question related to account access, hardware, network, software, email, security, or server issues."
  };
}

module.exports = { evaluatePromptPolicy };
