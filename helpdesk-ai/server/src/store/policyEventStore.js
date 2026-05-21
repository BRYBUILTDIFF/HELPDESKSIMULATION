const fs = require("fs");
const path = require("path");
const prisma = require("../prisma");

const MAX_EVENTS = 1000;
const DATA_DIR = path.resolve(__dirname, "../../data");
const POLICY_EVENTS_FILE = path.resolve(DATA_DIR, "policy-events.json");
let dbUnavailable = false;
let dbSeedChecked = false;

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_err) {
    // ignore and continue with in-memory fallback
  }
}

function loadPersistedEvents() {
  try {
    if (!fs.existsSync(POLICY_EVENTS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(POLICY_EVENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && typeof item === "object")
      .slice(0, MAX_EVENTS);
  } catch (_err) {
    return [];
  }
}

function persistEvents(events) {
  try {
    ensureDataDir();
    fs.writeFileSync(POLICY_EVENTS_FILE, JSON.stringify(events, null, 2), "utf8");
  } catch (_err) {
    // ignore write failures; app can still run with in-memory data
  }
}

const policyEvents = loadPersistedEvents();

function shouldDisableDb(err) {
  if (!err) {
    return false;
  }
  if (["P2021", "P2022", "P2023", "P1001", "P1002"].includes(err.code)) {
    return true;
  }
  return /does not exist|table .* not found|unknown table/i.test(String(err.message || ""));
}

function mapDbEvent(item) {
  return {
    id: item.id,
    at: new Date(item.at).toISOString(),
    userId: item.userId ?? null,
    userEmail: item.userEmail || "unknown",
    message: item.message || "",
    blocked: Boolean(item.blocked),
    code: item.code || "UNKNOWN",
    reason: item.reason || "",
    hasHistory: Boolean(item.hasHistory)
  };
}

function canUseDb() {
  return Boolean(prisma?.policyEvent) && !dbUnavailable;
}

async function ensureDbSeededFromFile() {
  if (!canUseDb() || dbSeedChecked) {
    return;
  }
  dbSeedChecked = true;
  if (policyEvents.length === 0) {
    return;
  }
  try {
    const total = await prisma.policyEvent.count();
    if (total > 0) {
      return;
    }
    await prisma.policyEvent.createMany({
      data: policyEvents.map((item) => ({
        id: item.id,
        at: new Date(item.at),
        userId: Number.isInteger(item.userId) ? item.userId : null,
        userEmail: item.userEmail || "unknown",
        message: String(item.message || ""),
        blocked: Boolean(item.blocked),
        code: item.code || "UNKNOWN",
        reason: item.reason || "",
        hasHistory: Boolean(item.hasHistory)
      })),
      skipDuplicates: true
    });
  } catch (err) {
    if (shouldDisableDb(err)) {
      dbUnavailable = true;
    }
  }
}

async function recordPolicyEvent(event) {
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

  if (canUseDb()) {
    try {
      await ensureDbSeededFromFile();
      const created = await prisma.policyEvent.create({
        data: {
          at: new Date(item.at),
          userId: Number.isInteger(item.userId) ? item.userId : null,
          userEmail: item.userEmail,
          message: item.message,
          blocked: item.blocked,
          code: item.code,
          reason: item.reason,
          hasHistory: item.hasHistory
        }
      });
      return mapDbEvent(created);
    } catch (err) {
      if (shouldDisableDb(err)) {
        dbUnavailable = true;
      }
    }
  }

  policyEvents.unshift(item);
  if (policyEvents.length > MAX_EVENTS) {
    policyEvents.length = MAX_EVENTS;
  }
  persistEvents(policyEvents);
  return item;
}

async function listPolicyEvents(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, MAX_EVENTS));
  if (canUseDb()) {
    try {
      await ensureDbSeededFromFile();
      const rows = await prisma.policyEvent.findMany({
        take: safeLimit,
        orderBy: { at: "desc" }
      });
      return rows.map(mapDbEvent);
    } catch (err) {
      if (shouldDisableDb(err)) {
        dbUnavailable = true;
      }
    }
  }
  return policyEvents.slice(0, safeLimit);
}

async function getPolicySummary() {
  if (canUseDb()) {
    try {
      await ensureDbSeededFromFile();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [total, blocked, last24h, byCodeRows] = await Promise.all([
        prisma.policyEvent.count(),
        prisma.policyEvent.count({ where: { blocked: true } }),
        prisma.policyEvent.count({ where: { at: { gte: oneDayAgo } } }),
        prisma.policyEvent.groupBy({ by: ["code"], _count: { _all: true } })
      ]);

      const byCode = byCodeRows.reduce((acc, row) => {
        acc[row.code || "UNKNOWN"] = row._count._all;
        return acc;
      }, {});

      return {
        total,
        blocked,
        allowed: total - blocked,
        blockRate: total > 0 ? Math.round((blocked / total) * 100) : 0,
        last24h,
        byCode
      };
    } catch (err) {
      if (shouldDisableDb(err)) {
        dbUnavailable = true;
      }
    }
  }

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
