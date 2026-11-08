const { getOpenAIModerationClient } = require("../utils/openai");

const SEXUAL_CONTENT_PATTERN = /\b(porn|pornography|nudes?|nudity|sexual|sex|explicit sex|hookup)\b/i;
const CREDIBLE_THREAT_PATTERN =
  /\b(?:i(?:'m| am)? going to|i will|we will)\s+(?:kill|murder|shoot|stab|rape|bomb|attack|hurt)\b|\b(?:kill|murder|shoot|stab|rape|bomb|attack|hurt)\s+(?:you|him|her|them|someone|a person|people|the school|the office)\b/i;

function baselineSafetyBlock(text) {
  const input = String(text || "");
  if (SEXUAL_CONTENT_PATTERN.test(input)) {
    return { code: "SAFETY_SEXUAL_CONTENT", message: "I cannot help with sexual content. Please keep the conversation appropriate and focused on IT support." };
  }
  if (CREDIBLE_THREAT_PATTERN.test(input)) {
    return { code: "SAFETY_THREAT", message: "I cannot help with threats or violence. If someone may be in immediate danger, contact local emergency services." };
  }
  return null;
}

async function evaluateContentSafety(text) {
  const baseline = baselineSafetyBlock(text);
  if (baseline) return baseline;

  const client = getOpenAIModerationClient();
  if (!client) return process.env.NODE_ENV !== "production" && process.env.MODERATION_FAILURE_MODE === "baseline" ? null :
    { code: "SAFETY_UNAVAILABLE", message: "Content safety checks are temporarily unavailable. Please try again later." };

  try {
    const response = await client.moderations.create({ model: "omni-moderation-latest", input: String(text || "") });
    const categories = response.results?.[0]?.categories || {};
    if (response.results?.[0]?.flagged || Object.values(categories).some(Boolean)) {
      return { code: "SAFETY_CONTENT", message: "I cannot help with that request. Please keep the conversation safe and focused on IT support." };
    }
  } catch (err) {
    console.warn("[ContentSafety] Moderation unavailable", { code: err?.code || "UNAVAILABLE" });
    if (process.env.NODE_ENV === "production" || process.env.MODERATION_FAILURE_MODE !== "baseline") return {
      code: "SAFETY_UNAVAILABLE", message: "Content safety checks are temporarily unavailable. Please try again later."
    };
  }

  return null;
}

module.exports = { evaluateContentSafety, baselineSafetyBlock };
