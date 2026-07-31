const { getPolicyRuntimeConfig } = require("../store/policyConfigStore");

const DEEPSEEK_URL = process.env.POLICY_CLASSIFIER_URL || "http://localhost:11434/api/chat";
const DEEPSEEK_MODEL = process.env.POLICY_CLASSIFIER_MODEL || "deepseek-r1:7b";
const CLASSIFIER_TIMEOUT_MS = Math.max(1000, Number(process.env.POLICY_CLASSIFIER_TIMEOUT_MS) || 8000);
const CLARIFY_MESSAGE_FALLBACK =
  "Could you clarify if this is an IT-related issue? I'm here to help with IT support topics.";
const FOLLOW_UP_NO_CONTEXT_REGEX =
  /\b(what now|next step|next steps|and then|then what|how about now|didn't work|didnt work|still not working|same issue|again|repeat that|continue)\b/i;

let cachedFetchImpl = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;

function listPreview(values, limit = 24) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((entry) => String(entry || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function matchesAnyRegex(regexList, text) {
  if (!Array.isArray(regexList) || !text) {
    return false;
  }
  return regexList.some((regex) => {
    try {
      regex.lastIndex = 0;
      return regex.test(text);
    } catch (_err) {
      return false;
    }
  });
}

function isLikelyFollowUpWithoutContext(input, history, signals) {
  if (Array.isArray(history) && history.length > 0) {
    return false;
  }
  if (!FOLLOW_UP_NO_CONTEXT_REGEX.test(input)) {
    return false;
  }
  return !signals.hasInScopeKeyword && !signals.hasInScopeIntent && !signals.hasOutOfScopeKeyword;
}

function getClassifierSystemPrompt(policy = {}) {
  const inScopePreview = listPreview(policy.inScopeKeywords).join(", ");
  const outOfScopePreview = listPreview(policy.outOfScopeKeywords).join(", ");

  return [
    "You are an IT helpdesk policy classifier.",
    "Classify the user's latest message into exactly one label: in_scope, out_of_scope, or greeting.",
    "Return ONLY raw JSON with exact shape:",
    "{\"classification\":\"in_scope|out_of_scope|greeting\",\"confidence\":0.0,\"reason\":\"short sentence\"}",
    "No markdown, no code fences, no additional keys, no explanation.",
    "IN-SCOPE includes: hardware, software, operating systems, network, VPN, email, account access, passwords, printers, security, remote access, active directory, IT ticketing.",
    "OUT-OF-SCOPE includes: health, finance, relationships, food, travel, entertainment, academics, politics, and anything unrelated to IT support.",
    "Classify as in_scope only when the message has a clear IT helpdesk connection. If it is ambiguous or lacks IT context, classify as out_of_scope.",
    "If short follow-up continues an IT support conversation, classify as in_scope.",
    "If greeting only and no IT question, classify as greeting.",
    "Handle multilingual input correctly, including Filipino/Tagalog.",
    `Reference in-scope terms: ${inScopePreview || "none provided"}.`,
    `Reference out-of-scope terms: ${outOfScopePreview || "none provided"}.`
  ].join(" ");
}

function sanitizeHistory(history = []) {
  if (!Array.isArray(history)) {
    return [];
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
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim().slice(0, 4000)
    }));
}

async function getFetchImpl() {
  if (cachedFetchImpl) {
    return cachedFetchImpl;
  }

  try {
    const nodeFetchModule = await import("node-fetch");
    cachedFetchImpl = nodeFetchModule.default;
    return cachedFetchImpl;
  } catch (_err) {
    throw new Error("No fetch implementation available.");
  }
}

function isClassifierPayload(value) {
  return value && typeof value === "object" && ["in_scope", "out_of_scope", "greeting"].includes(String(value.classification || "").trim());
}

function findClassifierPayloadInText(rawContent) {
  const content = String(rawContent || "").trim();
  if (!content) {
    return null;
  }

  try {
    const direct = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim());
    if (isClassifierPayload(direct)) {
      return direct;
    }
  } catch (_err) {
    // Some DeepSeek responses contain thinking text or markdown around the JSON payload.
  }

  for (let start = content.indexOf("{"); start >= 0; start = content.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < content.length; index += 1) {
      const character = content[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const candidate = JSON.parse(content.slice(start, index + 1));
            if (isClassifierPayload(candidate)) {
              return candidate;
            }
          } catch (_err) {
            // Continue looking for another JSON object in the model response.
          }
          break;
        }
      }
    }
  }

  return null;
}

/**
 * Classifies a prompt using a local DeepSeek model through an Ollama-compatible chat endpoint.
 * @param {string} message
 * @param {Array<{role: string, content: string}>} history
 * @returns {Promise<{classification: "in_scope" | "out_of_scope" | "greeting", confidence: number, reason: string}>}
 */
async function classifyWithDeepSeek(message, history, policy) {
  const fetchImpl = await getFetchImpl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
  const safeMessage = String(message || "").trim();
  const safeHistory = sanitizeHistory(history);

  try {
    const response = await fetchImpl(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        stream: false,
        messages: [
          { role: "system", content: getClassifierSystemPrompt(policy) },
          ...safeHistory,
          { role: "user", content: safeMessage }
        ]
      })
    });

    const rawResponse = await response.text();
    if (!response.ok) {
      throw new Error(`Classifier request failed (${response.status}).`);
    }

    let envelope;
    try {
      envelope = JSON.parse(rawResponse);
    } catch (_err) {
      console.error("[PolicyClassifier] Malformed JSON envelope from classifier:", rawResponse);
      throw new Error("Malformed classifier response.");
    }

    const rawModelContent = String(envelope?.message?.content || "").trim();
    if (!rawModelContent) {
      console.error("[PolicyClassifier] Empty classifier output:", rawResponse);
      throw new Error("Classifier returned empty output.");
    }

    const parsed = findClassifierPayloadInText(rawModelContent);
    if (!parsed) {
      console.error("[PolicyClassifier] Non-JSON classifier content:", rawModelContent);
      throw new Error("Classifier returned non-JSON content.");
    }

    const classification = String(parsed?.classification || "").trim();
    if (!["in_scope", "out_of_scope", "greeting"].includes(classification)) {
      console.error("[PolicyClassifier] Invalid classification payload:", rawModelContent);
      throw new Error("Classifier returned unsupported classification.");
    }

    const numericConfidence = Number(parsed?.confidence);
    const confidence = Number.isFinite(numericConfidence)
      ? Math.max(0, Math.min(1, numericConfidence))
      : 0;
    const reason = String(parsed?.reason || "").trim() || "Classifier decision.";

    return { classification, confidence, reason };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Classifier timeout after 8 seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Evaluates a prompt against IT helpdesk scope policy.
 * @param {string} message
 * @param {Array<{role: string, content: string}>} history
 * @returns {Promise<{allowed: boolean, code: string, reason: string, userMessage?: string, directReply?: string}>}
 */
async function evaluatePromptPolicy(message, history = []) {
  const policy = getPolicyRuntimeConfig();
  const input = String(message || "").trim();
  const safeHistory = sanitizeHistory(history);

  if (!input) {
    return {
      allowed: false,
      code: "EMPTY_PROMPT",
      reason: "Prompt is empty.",
      userMessage: policy.messages.emptyPromptMessage
    };
  }

  if (input.length > 4000) {
    return {
      allowed: false,
      code: "PROMPT_TOO_LONG",
      reason: "Prompt exceeds maximum length.",
      userMessage: policy.messages.promptTooLongMessage
    };
  }

  const hasGreetingPattern = matchesAnyRegex(policy.greetingPatternRegex, input);
  const hasInScopeKeyword = matchesAnyRegex(policy.inScopeKeywordRegex, input);
  const hasOutOfScopeKeyword = matchesAnyRegex(policy.outOfScopeKeywordRegex, input);
  const hasInScopeIntent = matchesAnyRegex(policy.inScopeIntentRegex, input);
  const signals = { hasInScopeKeyword, hasOutOfScopeKeyword, hasInScopeIntent };

  if (isLikelyFollowUpWithoutContext(input, safeHistory, signals)) {
    return {
      allowed: false,
      code: "FOLLOW_UP_NO_CONTEXT",
      reason: "Likely follow-up prompt without prior IT context.",
      userMessage: policy.messages.followUpNoContextMessage
    };
  }

  if (hasGreetingPattern && !hasInScopeKeyword && !hasInScopeIntent && !hasOutOfScopeKeyword) {
    return {
      allowed: true,
      code: "GREETING_PATTERN",
      reason: "Matched greeting pattern.",
      directReply: policy.messages.greetingReply
    };
  }

  if (hasOutOfScopeKeyword && !hasInScopeKeyword && !hasInScopeIntent) {
    return {
      allowed: false,
      code: "OUT_OF_SCOPE_KEYWORD",
      reason: "Matched out-of-scope keyword without IT scope signal.",
      userMessage: policy.messages.outOfScopeMessage || policy.messages.defaultOutOfScopeMessage
    };
  }

  if (hasOutOfScopeKeyword && (hasInScopeKeyword || hasInScopeIntent)) {
    return {
      allowed: false,
      code: "MIXED_SCOPE",
      reason: "Prompt contains mixed in-scope and out-of-scope signals.",
      userMessage: policy.messages.mixedScopeMessage
    };
  }

  if ((hasInScopeKeyword || hasInScopeIntent) && !hasOutOfScopeKeyword) {
    return {
      allowed: true,
      code: "ALLOWED_RULE_MATCH",
      reason: "Matched in-scope keyword or intent pattern."
    };
  }

  try {
    const classificationResult = await classifyWithDeepSeek(input, safeHistory, policy);

    if (classificationResult.classification === "greeting") {
      return {
        allowed: true,
        code: "GREETING",
        reason: classificationResult.reason,
        directReply: policy.messages.greetingReply
      };
    }

    if (classificationResult.classification === "in_scope") {
      return {
        allowed: true,
        code: "ALLOWED",
        reason: classificationResult.reason
      };
    }

    if ((hasInScopeKeyword || hasInScopeIntent) && classificationResult.confidence < 0.85) {
      return {
        allowed: false,
        code: "CLARIFY",
        reason: classificationResult.reason,
        userMessage: policy.messages.clarifyMessage || CLARIFY_MESSAGE_FALLBACK
      };
    }

    if (classificationResult.confidence < 0.75) {
      return {
        allowed: false,
        code: "CLARIFY",
        reason: classificationResult.reason,
        userMessage: policy.messages.clarifyMessage || CLARIFY_MESSAGE_FALLBACK
      };
    }

    return {
      allowed: false,
      code: "OUT_OF_SCOPE",
      reason: classificationResult.reason,
      userMessage: policy.messages.outOfScopeMessage || policy.messages.defaultOutOfScopeMessage
    };
  } catch (err) {
    console.error("[PolicyClassifier]", err);
    return {
      allowed: false,
      code: "CLASSIFIER_ERROR",
      reason: `Scope classifier unavailable; request safely blocked. ${err?.message || "Classifier error."}`,
      userMessage: policy.messages.defaultOutOfScopeMessage || policy.messages.outOfScopeMessage
    };
  }
}

module.exports = { evaluatePromptPolicy };
