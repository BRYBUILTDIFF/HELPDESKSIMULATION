const prisma = require("../prisma");
const { redactSecrets } = require("../utils/redact");
function policyOutcome(event) {
  const code = String(event.code || "").toUpperCase();
  if (code.includes("UNAVAILABLE")) return "UNAVAILABLE";
  if (code === "OUT_OF_SCOPE_REDIRECT") return "REDIRECTED";
  if (code.startsWith("OUTPUT_") && code.endsWith("FILTERED")) return "OUTPUT_FILTERED";
  return event.blocked ? "BLOCKED" : "ALLOWED";
}
async function recordPolicyEvent(event) {
  return prisma.policyEvent.create({ data: { userId: event.userId || null, userEmail: event.userEmail || "unknown",
    message: redactSecrets(event.message).slice(0, 300), blocked: policyOutcome(event) === "BLOCKED", code: event.code || "UNKNOWN",
    reason: redactSecrets(event.reason).slice(0, 1000), hasHistory: Boolean(event.hasHistory) } });
}
async function listPolicyEvents(limit = 100) {
  const rows = await prisma.policyEvent.findMany({ take: Math.max(1, Math.min(Number(limit) || 100, 1000)), orderBy: { at: "desc" } });
  return rows.map(event => ({ ...event, outcome: policyOutcome(event) }));
}
function summarize(groups) {
  const counts = { total: 0, allowed: 0, redirected: 0, blocked: 0, outputFiltered: 0, unavailable: 0 };
  const keys = { ALLOWED: "allowed", REDIRECTED: "redirected", BLOCKED: "blocked", OUTPUT_FILTERED: "outputFiltered", UNAVAILABLE: "unavailable" };
  for (const group of groups) { const n = group._count._all; counts.total += n; counts[keys[policyOutcome(group)]] += n; }
  const evaluated = counts.total - counts.unavailable;
  return { ...counts, evaluated, blockRate: evaluated ? Math.round(counts.blocked / evaluated * 1000) / 10 : 0 };
}
async function getPolicySummary() {
  // Philippine calendar day, independent of the database server's timezone.
  const offset = 8 * 3600000;
  const todayStart = new Date(Math.floor((Date.now() + offset) / 86400000) * 86400000 - offset);
  const [groups, todayGroups, last24h] = await prisma.$transaction([
    prisma.policyEvent.groupBy({ by: ["code", "blocked"], _count: { _all: true } }),
    prisma.policyEvent.groupBy({ by: ["code", "blocked"], where: { at: { gte: todayStart } }, _count: { _all: true } }),
    prisma.policyEvent.count({ where: { at: { gte: new Date(Date.now() - 86400000) } } })
  ]);
  const byCode = {};
  for (const row of groups) byCode[row.code] = (byCode[row.code] || 0) + row._count._all;
  return { ...summarize(groups), last24h, byCode, today: summarize(todayGroups), timezone: "Asia/Manila" };
}
module.exports = { recordPolicyEvent, listPolicyEvents, getPolicySummary, policyOutcome, summarize, prunePolicyEvents() {} };
