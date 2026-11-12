const { getOpenAIModerationClient } = require("../utils/openai");

const CREDIBLE_THREAT_PATTERN =
  /\b(?:i(?:'m| am)? going to|i will|we will)\s+(?:kill|murder|shoot|stab|rape|bomb|attack|hurt)\b|\b(?:kill|murder|shoot|stab|rape|bomb|attack|hurt)\s+(?:you|him|her|them|someone|a person|people|the school|the office)\b/i;

function baselineSafetyBlock(text) {
  const input = String(text || "");
  if (CREDIBLE_THREAT_PATTERN.test(input)) {
    return { code: "SAFETY_THREAT", message: "I cannot help with threats or violence. If someone may be in immediate danger, contact local emergency services." };
  }
  return null;
}

function configuredSafetyBlock(text, keywords = []) {
  const input = String(text || "");
  for (const keyword of keywords) {
    const escaped = String(keyword).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    if (escaped && new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(input)) {
      return { code: "SAFETY_CUSTOM_KEYWORD", message: "This request contains content restricted by your organization's safety policy. Please keep the conversation safe and focused on IT support." };
    }
  }
  return null;
}

function getSafetyRuleInfo() {
  return { threatProtection: true, moderationModel: "omni-moderation-latest" };
}

async function evaluateContentSafety(text) {
  const baseline = baselineSafetyBlock(text);
  if (baseline) return baseline;

  try {
    const config = await require("../store/policyConfigStore").getPolicyRuntimeConfig();
    const custom = configuredSafetyBlock(text, config.safetyBlockedKeywords);
    if (custom) return custom;
  } catch (_err) {
    return { code: "SAFETY_UNAVAILABLE", message: "Content safety checks are temporarily unavailable. Please try again later." };
  }

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

module.exports = { evaluateContentSafety, baselineSafetyBlock, configuredSafetyBlock, getSafetyRuleInfo };
