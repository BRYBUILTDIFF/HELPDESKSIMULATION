const { getAIProvider, getDefaultModel, getOpenAIClient } = require("../utils/openai");
const { evaluatePromptPolicy } = require("../policy/promptPolicy");
const { recordPolicyEvent } = require("../store/policyEventStore");

const SYSTEM_PROMPT = `
You are HelpDesk AI, an IT support assistant for internal users.
Provide practical, accurate, step-by-step troubleshooting guidance.
Prioritize safety and security best practices.
If details are missing, ask one or two concise clarifying questions and wait for the user's answer. Do not label those questions as steps, and do not mix questions with a procedural checklist in the same reply.
For terminal or command-line tasks that need operating-system-specific commands, ask which operating system the user uses when the conversation does not establish it. Do not provide a long mixed Windows, macOS, and Linux command list unless the user explicitly asks for a comparison.
When giving a step-by-step guide, format each primary action as Step 1:, Step 2:, and so on. Keep each step focused on one action; place command examples and notes beneath that step.
Keep responses concise and actionable.
`;

const RELATED_TICKET_CACHE_TTL_MS = 5 * 60 * 1000;
const RELATED_TICKET_CACHE_LIMIT = 200;
const RELATED_TICKET_TIMEOUT_MS = Math.max(1000, Number(process.env.RELATED_TICKET_TIMEOUT_MS) || 5000);
const SUGGESTED_TICKETS_CACHE_TTL_MS = 15 * 60 * 1000;
const relatedTicketCache = new Map();
let suggestedTicketsCache = null;

function extractJsonObject(rawContent) {
  const content = String(rawContent || "").trim();
  if (!content) return null;

  try {
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim());
  } catch (_err) {
    // DeepSeek R1 may include reasoning text before its JSON response.
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
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(content.slice(start, index + 1));
          } catch (_err) {
            break;
          }
        }
      }
    }
  }
  return null;
}

function readRelatedTicketCache(key) {
  const entry = relatedTicketCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    relatedTicketCache.delete(key);
    return null;
  }
  return entry.suggestionIds;
}

function writeRelatedTicketCache(key, suggestionIds) {
  if (relatedTicketCache.size >= RELATED_TICKET_CACHE_LIMIT) {
    const oldestKey = relatedTicketCache.keys().next().value;
    if (oldestKey) relatedTicketCache.delete(oldestKey);
  }
  relatedTicketCache.set(key, { suggestionIds, expiresAt: Date.now() + RELATED_TICKET_CACHE_TTL_MS });
}

function normalizeSuggestedTickets(payload) {
  const suggestions = Array.isArray(payload) ? payload : payload?.suggestions;
  if (!Array.isArray(suggestions)) return [];

  return suggestions
    .map((suggestion) => ({
      label: String(suggestion?.label || "General").trim().slice(0, 40),
      title: String(suggestion?.title || "").trim().slice(0, 100),
      question: String(suggestion?.question || "").trim().slice(0, 300)
    }))
    .filter((suggestion) => suggestion.title && suggestion.question)
    .slice(0, 6);
}

async function getSuggestedTickets(_req, res) {
  if (suggestedTicketsCache?.expiresAt > Date.now()) {
    return res.status(200).json({ suggestions: suggestedTicketsCache.suggestions, cached: true });
  }

  const client = getOpenAIClient();
  if (!client) {
    return res.status(200).json({ suggestions: [], unavailable: true });
  }

  try {
    const completion = await client.chat.completions.create({
      model: getDefaultModel(getAIProvider()),
      temperature: 0.55,
      messages: [
        {
          role: "system",
          content: "You suggest common, realistic internal IT helpdesk issues. Return ONLY valid JSON in exactly this shape: {\"suggestions\":[{\"label\":\"Category\",\"title\":\"Short issue title\",\"question\":\"A practical first-person help request\"}]}. Return exactly 6 varied, safe helpdesk suggestions. Cover different categories when possible. Do not include unsupported consumer topics, dangerous instructions, or duplicate issues."
        },
        {
          role: "user",
          content: "Generate a useful set of starting issues for an internal Help Desk Support System dashboard."
        }
      ]
    });
    const suggestions = normalizeSuggestedTickets(extractJsonObject(completion.choices?.[0]?.message?.content));
    if (suggestions.length === 0) {
      return res.status(200).json({ suggestions: [], unavailable: true });
    }

    suggestedTicketsCache = {
      suggestions,
      expiresAt: Date.now() + SUGGESTED_TICKETS_CACHE_TTL_MS
    };
    return res.status(200).json({ suggestions });
  } catch (err) {
    console.warn("[SuggestedTickets] AI suggestions unavailable:", err?.message || "Unknown error");
    return res.status(200).json({ suggestions: [], unavailable: true });
  }
}

async function getRelatedTickets(req, res) {
  const query = String(req.body?.query || "").trim();
  const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : [];
  const safeCandidates = candidates
    .map((candidate) => ({
      id: String(candidate?.id || "").trim(),
      label: String(candidate?.label || "").trim(),
      title: String(candidate?.title || "").trim(),
      question: String(candidate?.question || "").trim()
    }))
    .filter((candidate) => candidate.id && candidate.title && candidate.question)
    .slice(0, 12);

  if (!query || safeCandidates.length === 0) {
    return res.status(200).json({ suggestionIds: [] });
  }

  const cacheKey = `${query.toLowerCase()}|${safeCandidates.map((candidate) => candidate.id).join(",")}`;
  const cached = readRelatedTicketCache(cacheKey);
  if (cached) {
    return res.status(200).json({ suggestionIds: cached, cached: true });
  }

  if (typeof globalThis.fetch !== "function") {
    return res.status(200).json({ suggestionIds: [], unavailable: true });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RELATED_TICKET_TIMEOUT_MS);
  try {
    const response = await globalThis.fetch(process.env.POLICY_CLASSIFIER_URL || "http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.POLICY_CLASSIFIER_MODEL || "deepseek-r1:7b",
        stream: false,
        messages: [
          {
            role: "system",
            content: "You select relevant IT helpdesk tickets. Return ONLY JSON in this exact shape: {\"suggestionIds\":[\"candidate-id\"]}. Select up to 4 IDs only from the supplied candidates. Do not invent IDs. If none are relevant, return an empty array."
          },
          {
            role: "user",
            content: `User query: ${query}\n\nCandidates: ${JSON.stringify(safeCandidates)}`
          }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Related ticket classifier request failed (${response.status}).`);
    }
    const envelope = JSON.parse(await response.text());
    const payload = extractJsonObject(envelope?.message?.content);
    const validIds = new Set(safeCandidates.map((candidate) => candidate.id));
    const suggestionIds = Array.from(new Set(Array.isArray(payload?.suggestionIds) ? payload.suggestionIds : []))
      .map((id) => String(id || "").trim())
      .filter((id) => validIds.has(id))
      .slice(0, 4);
    writeRelatedTicketCache(cacheKey, suggestionIds);
    return res.status(200).json({ suggestionIds });
  } catch (err) {
    console.warn("[RelatedTickets] Semantic fallback unavailable:", err?.message || "Unknown error");
    return res.status(200).json({ suggestionIds: [], unavailable: true });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function chat(req, res, next) {
  try {
    const message = String(req.body.message || "").trim();
    const history = Array.isArray(req.body.history) ? req.body.history : [];

    const policyResult = await evaluatePromptPolicy(message, history);
    if (policyResult.directReply) {
      await recordPolicyEvent({
        userId: req.user?.id,
        userEmail: req.user?.email,
        message,
        blocked: false,
        code: policyResult.code,
        reason: policyResult.reason,
        hasHistory: history.length > 0
      });
      return res.status(200).json({
        reply: policyResult.directReply,
        policy: {
          blocked: false,
          code: policyResult.code,
          reason: policyResult.reason
        }
      });
    }

    if (!policyResult.allowed) {
      await recordPolicyEvent({
        userId: req.user?.id,
        userEmail: req.user?.email,
        message,
        blocked: true,
        code: policyResult.code,
        reason: policyResult.reason,
        hasHistory: history.length > 0
      });
      return res.status(200).json({
        reply: policyResult.userMessage,
        policy: {
          blocked: true,
          code: policyResult.code,
          reason: policyResult.reason
        }
      });
    }

    const client = getOpenAIClient();
    if (!client) {
      return res.status(503).json({ message: "AI service is not configured." });
    }

    const safeHistory = history
      .filter(
        (h) =>
          h &&
          (h.role === "user" || h.role === "assistant") &&
          typeof h.content === "string" &&
          h.content.trim()
      )
      .slice(-10)
      .map((h) => ({
        role: h.role,
        content: h.content.trim().slice(0, 4000)
      }));

    const provider = getAIProvider();
    const completion = await client.chat.completions.create({
      model: getDefaultModel(provider),
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT.trim() },
        ...safeHistory,
        { role: "user", content: message }
      ]
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(500).json({ message: "AI did not return a response." });
    }

    await recordPolicyEvent({
      userId: req.user?.id,
      userEmail: req.user?.email,
      message,
      blocked: false,
      code: policyResult.code || "ALLOWED",
      reason: policyResult.reason || "Allowed request.",
      hasHistory: history.length > 0
    });

    return res.status(200).json({
      reply,
      policy: {
        blocked: false,
        code: policyResult.code || "ALLOWED"
      }
    });
  } catch (err) {
    if (err?.status === 401 || err?.code === "invalid_api_key") {
      return res.status(401).json({
        message:
          "Invalid AI API key for the configured provider. Check AI_PROVIDER, AI_API_KEY, AI_BASE_URL, and AI_MODEL in server/.env."
      });
    }
    return next(err);
  }
}

module.exports = { chat, getRelatedTickets, getSuggestedTickets };
