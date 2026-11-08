const prisma = require("../prisma");
const { redactSecrets } = require("../utils/redact");
async function recordPolicyEvent(event) {
  return prisma.policyEvent.create({ data: { userId: event.userId || null, userEmail: event.userEmail || "unknown",
    message: redactSecrets(event.message).slice(0, 300), blocked: Boolean(event.blocked), code: event.code || "UNKNOWN",
    reason: redactSecrets(event.reason).slice(0, 1000), hasHistory: Boolean(event.hasHistory) } });
}
async function listPolicyEvents(limit = 100) {
  return prisma.policyEvent.findMany({ take: Math.max(1, Math.min(Number(limit) || 100, 1000)), orderBy: { at: "desc" } });
}
async function getPolicySummary() {
  const [total, blocked, last24h, groups] = await Promise.all([
    prisma.policyEvent.count(), prisma.policyEvent.count({ where: { blocked: true } }),
    prisma.policyEvent.count({ where: { at: { gte: new Date(Date.now() - 86400000) } } }),
    prisma.policyEvent.groupBy({ by: ["code"], _count: { _all: true } })
  ]);
  return { total, blocked, allowed: total - blocked, last24h, blockRate: total ? Math.round(blocked / total * 100) : 0,
    byCode: Object.fromEntries(groups.map(row => [row.code, row._count._all])) };
}
module.exports = { recordPolicyEvent, listPolicyEvents, getPolicySummary, prunePolicyEvents() {} };
