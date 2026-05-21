const { getAIProvider, getDefaultModel, getOpenAIClient } = require("../utils/openai");
const { evaluatePromptPolicy } = require("../policy/promptPolicy");
const { recordPolicyEvent } = require("../store/policyEventStore");

const SYSTEM_PROMPT = `
You are HelpDesk AI, an IT support assistant for internal users.
Provide practical, accurate, step-by-step troubleshooting guidance.
Prioritize safety and security best practices.
If details are missing, ask concise clarifying questions.
Keep responses concise and actionable.
`;

async function chat(req, res, next) {
  try {
    const message = String(req.body.message || "").trim();
    const history = Array.isArray(req.body.history) ? req.body.history : [];

    const policyResult = evaluatePromptPolicy(message, history);
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

module.exports = { chat };
