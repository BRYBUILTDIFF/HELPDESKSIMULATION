const OpenAI = require("openai");

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

  const signature = `${provider}|${baseURL || ""}|${apiKey.slice(0, 8)}`;
  if (!client || signature !== clientSignature) {
    const config = { apiKey };
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

  if (!moderationClient || moderationClientKey !== apiKey.slice(0, 8)) {
    moderationClient = new OpenAI({ apiKey });
    moderationClientKey = apiKey.slice(0, 8);
  }
  return moderationClient;
}

module.exports = {
  getOpenAIClient,
  getOpenAIModerationClient,
  getAIProvider,
  getDefaultModel
};
