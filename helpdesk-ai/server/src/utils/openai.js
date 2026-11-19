const OpenAI = require("openai");
const { bounded, requestFetch } = require('../services/aiRequestContext');

let client = null;
let clientSignature = "";
let moderationClient = null;
let moderationClientKey = "";

function getAIProvider() {
  return (process.env.AI_PROVIDER || "openai").toLowerCase();
}

function getAIBaseURL(provider) {
  if (process.env.AI_BASE_URL) {
    return process.env.AI_BASE_URL;
  }
  if (provider === "deepseek") {
    return "https://api.deepseek.com";
  }
  return undefined;
}

function getAIApiKey() {
  return process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
}

function getDefaultModel(provider) {
  if (process.env.AI_MODEL) {
    return process.env.AI_MODEL;
  }
  if (process.env.OPENAI_MODEL) {
    return process.env.OPENAI_MODEL;
  }
  return provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini";
}

function getOpenAIClient() {
  const provider = getAIProvider();
  const apiKey = getAIApiKey();
  const baseURL = getAIBaseURL(provider);

  if (!apiKey) {
    return null;
  }

  const timeout = bounded('AI_TIMEOUT_MS', 25000, 1000, 60000);
  const signature = `${provider}|${baseURL || ""}|${require('crypto').createHash('sha256').update(apiKey).digest('hex')}|${timeout}`;
  if (!client || signature !== clientSignature) {
    const config = { apiKey, timeout, maxRetries: 0, fetch: requestFetch };
    if (baseURL) {
      config.baseURL = baseURL;
    }
    client = new OpenAI(config);
    clientSignature = signature;
  }

  return client;
}

function getOpenAIModerationClient() {
  const provider = getAIProvider();
  const apiKey = process.env.OPENAI_API_KEY || (provider === "openai" ? process.env.AI_API_KEY || "" : "");
  if (!apiKey) return null;

  const keySignature = require('crypto').createHash('sha256').update(apiKey).digest('hex');
  if (!moderationClient || moderationClientKey !== keySignature) {
    moderationClient = new OpenAI({ apiKey, timeout: bounded('AI_MODERATION_TIMEOUT_MS', 8000, 1000, 15000), maxRetries: 0, fetch: requestFetch });
    moderationClientKey = keySignature;
  }
  return moderationClient;
}

module.exports = {
  getOpenAIClient,
  getOpenAIModerationClient,
  getAIProvider,
  getDefaultModel
};
