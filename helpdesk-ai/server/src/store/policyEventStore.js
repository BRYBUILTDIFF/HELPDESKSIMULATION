const MAX_EVENTS = 500;

const policyEvents = [];

function recordPolicyEvent(event) {
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    at: new Date().toISOString(),
    userId: event?.userId ?? null,
    userEmail: event?.userEmail || "unknown",
    message: String(event?.message || "").slice(0, 300),
    blocked: Boolean(event?.blocked),
    code: event?.code || "UNKNOWN",
    reason: event?.reason || "",
    hasHistory: Boolean(event?.hasHistory)
  };

  policyEvents.unshift(item);
  if (policyEvents.length > MAX_EVENTS) {
    policyEvents.length = MAX_EVENTS;
  }
  return item;
}

function listPolicyEvents(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, MAX_EVENTS));
  return policyEvents.slice(0, safeLimit);
}

function getPolicySummary() {
  const total = policyEvents.length;
  const blocked = policyEvents.filter((e) => e.blocked).length;
  const allowed = total - blocked;

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = policyEvents.filter((e) => new Date(e.at).getTime() >= oneDayAgo).length;

  const byCode = policyEvents.reduce((acc, e) => {
    acc[e.code] = (acc[e.code] || 0) + 1;
    return acc;
  }, {});

  return {
    total,
    blocked,
    allowed,
    blockRate: total > 0 ? Math.round((blocked / total) * 100) : 0,
    last24h,
    byCode
  };
}

module.exports = {
  recordPolicyEvent,
  listPolicyEvents,
  getPolicySummary
};

