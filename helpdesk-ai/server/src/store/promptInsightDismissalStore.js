const crypto = require("crypto");
const prisma = require("../prisma");
const hash = value => crypto.createHash("sha256").update(String(value || "").trim()).digest("hex");
async function isPromptInsightDismissed(...keys) {
  return Boolean(await prisma.promptInsightDismissal.findFirst({ where: { key: { in: keys.filter(Boolean).map(hash) } } }));
}
async function dismissPromptInsight(...keys) {
  await prisma.promptInsightDismissal.createMany({ data: [...new Set(keys.filter(Boolean).map(hash))].map(key => ({ key })), skipDuplicates: true });
}
module.exports = { dismissPromptInsight, isPromptInsightDismissed };
