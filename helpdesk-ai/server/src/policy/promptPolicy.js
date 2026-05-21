const { getPolicyRuntimeConfig } = require("../store/policyConfigStore");

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function countKeywordMatches(text, keywords) {
  return keywords.reduce((count, keyword) => (text.includes(keyword) ? count + 1 : count), 0);
}

function matchesAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isGreetingOnly(text, greetingPatterns) {
  return matchesAnyPattern(text, greetingPatterns) && text.split(" ").length <= 6;
}

function isShortFollowUp(text) {
  return /^(yes|no|yep|nope|ok|okay|sure|continue|go ahead|proceed|please continue|correct|right)\b[.!?]*$/i.test(text);
}

function isContextualFollowUp(text) {
  const compact = String(text || "").trim();
  if (!compact) {
    return false;
  }

  const tokenCount = compact.split(/\s+/).length;
  if (tokenCount > 18) {
    return false;
  }

  const startsWithFollowUpQuestion =
    /^(what|how|why|where|when|which|can|could|would|should|do|does|did)\b/.test(compact);
  const hasReference =
    /\b(it|that|this|those|these|same|above|previous|earlier|last one|that one)\b/.test(compact) ||
    /\bfor (it|that|this)\b/.test(compact);
  const hasFollowUpPhrase =
    /\b(what are the steps|next steps|steps for|explain (it|that|this)|more details|elaborate|break it down|how about)\b/.test(compact);

  return startsWithFollowUpQuestion && (hasReference || hasFollowUpPhrase);
}

function buildHistoryContext(history) {
  if (!Array.isArray(history)) return "";
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

function evaluatePromptPolicy(message, history = []) {
  const policy = getPolicyRuntimeConfig();
  const normalized = normalize(message);
  const historyContext = normalize(buildHistoryContext(history));

  if (!normalized) {
    return {
      allowed: false,
      code: "EMPTY_PROMPT",
      reason: "Prompt is empty.",
      userMessage: policy.messages.emptyPromptMessage
    };
  }

  if (normalized.length > 4000) {
    return {
      allowed: false,
      code: "PROMPT_TOO_LONG",
      reason: "Prompt exceeds maximum length.",
      userMessage: policy.messages.promptTooLongMessage
    };
  }

  if (isGreetingOnly(normalized, policy.greetingPatternRegex)) {
    return {
      allowed: true,
      code: "GREETING",
      reason: "Greeting detected.",
      directReply: policy.messages.greetingReply
    };
  }

  const inScopeScore = countKeywordMatches(normalized, policy.inScopeKeywords);
  const outScopeScore = countKeywordMatches(normalized, policy.outOfScopeKeywords);
  const hasInScopeIntent = matchesAnyPattern(normalized, policy.inScopeIntentRegex);

  const historyInScopeScore = historyContext
    ? countKeywordMatches(historyContext, policy.inScopeKeywords)
    : 0;
  const historyHasInScopeIntent = historyContext
    ? matchesAnyPattern(historyContext, policy.inScopeIntentRegex)
    : false;
  const hasInScopeHistoryContext = historyInScopeScore > 0 || historyHasInScopeIntent;

  if (outScopeScore > 0 && inScopeScore === 0 && !hasInScopeIntent) {
    return {
      allowed: false,
      code: "OUT_OF_SCOPE",
      reason: "Prompt matches an out-of-scope topic with no IT helpdesk signals.",
      userMessage: policy.messages.outOfScopeMessage
    };
  }

  if (outScopeScore > 0 && outScopeScore >= inScopeScore && !hasInScopeIntent) {
    return {
      allowed: false,
      code: "OUT_OF_SCOPE",
      reason: "Out-of-scope content outweighs in-scope IT signals.",
      userMessage: policy.messages.mixedScopeMessage
    };
  }

  if (isShortFollowUp(normalized)) {
    if (hasInScopeHistoryContext) {
      return {
        allowed: true,
        code: "ALLOWED_CONTEXT_FOLLOW_UP",
        reason: "Short follow-up allowed using recent in-scope context."
      };
    }
    return {
      allowed: false,
      code: "OUT_OF_SCOPE",
      reason: "Short follow-up with no prior in-scope conversation context.",
      userMessage: policy.messages.followUpNoContextMessage
    };
  }

  if (
    inScopeScore === 0 &&
    !hasInScopeIntent &&
    outScopeScore === 0 &&
    hasInScopeHistoryContext &&
    isContextualFollowUp(normalized)
  ) {
    return {
      allowed: true,
      code: "ALLOWED_CONTEXT_FOLLOW_UP",
      reason: "Contextual follow-up allowed using recent in-scope conversation context."
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
    userMessage: policy.messages.defaultOutOfScopeMessage
  };
}

module.exports = { evaluatePromptPolicy };
