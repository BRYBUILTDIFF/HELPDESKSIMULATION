const { getPolicyRuntimeConfig } = require("../store/policyConfigStore");

const DEEPSEEK_URL = "http://localhost:11434/api/chat";
const DEEPSEEK_MODEL = "deepseek-r1:7b";
const CLASSIFIER_TIMEOUT_MS = 8000;
const CLARIFY_MESSAGE_FALLBACK =
  "Could you clarify if this is an IT-related issue? I'm here to help with IT support topics.";

let cachedFetchImpl = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;

function getClassifierSystemPrompt() {
  return [
    "You are an IT helpdesk policy classifier.",
    "Classify the user's latest message into exactly one label: in_scope, out_of_scope, or greeting.",
    "Return ONLY raw JSON with exact shape:",
    "{\"classification\":\"in_scope|out_of_scope|greeting\",\"confidence\":0.0,\"reason\":\"short sentence\"}",
    "No markdown, no code fences, no additional keys, no explanation.",
    "IN-SCOPE includes: hardware, software, operating systems, network, VPN, email, account access, passwords, printers, security, remote access, active directory, IT ticketing.",
    "OUT-OF-SCOPE includes: health, finance, relationships, food, travel, entertainment, academics, politics, and anything unrelated to IT support.",
    "If ambiguous but possibly IT-related, classify as in_scope.",
    "If short follow-up continues an IT support conversation, classify as in_scope.",
    "If greeting only and no IT question, classify as greeting.",
    "Handle multilingual input correctly, including Filipino/Tagalog."
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

/**
 * Classifies a prompt using a local DeepSeek model through an Ollama-compatible chat endpoint.
 * @param {string} message
 * @param {Array<{role: string, content: string}>} history
 * @returns {Promise<{classification: "in_scope" | "out_of_scope" | "greeting", confidence: number, reason: string}>}
 */
async function classifyWithDeepSeek(message, history) {
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
          { role: "system", content: getClassifierSystemPrompt() },
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

    let parsed;
    try {
      parsed = JSON.parse(rawModelContent);
    } catch (_err) {
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

  try {
    const classificationResult = await classifyWithDeepSeek(input, history);

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
      userMessage: policy.messages.outOfScopeMessage
    };
  } catch (err) {
    console.error("[PolicyClassifier]", err);
    return {
      allowed: true,
      code: "CLASSIFIER_ERROR",
      reason: err?.message || "Classifier error."
    };
  }
}

module.exports = { evaluatePromptPolicy };
