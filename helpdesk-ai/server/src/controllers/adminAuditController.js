const prisma = require('../prisma');
const { redactSecrets } = require('../utils/redact');
const DAY = 86400000;
const badRequest = message => Object.assign(new Error(message), { status: 400, publicMessage: message });
function integer(value, fallback, maximum) {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) throw badRequest('Invalid audit pagination or administrator ID.');
  return Number(value);
}
function dateBoundary(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest('Use a valid date in YYYY-MM-DD format.');
  const time = Date.parse(value + 'T00:00:00.000Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw badRequest('Use a valid calendar date.');
  return time - 8 * 3600000;
}
function parseFilters(query) {
  const page = integer(query.page, 1, 100000);
  const pageSize = integer(query.pageSize, 25, 100);
  const actorId = integer(query.actorId, null, 2147483647);
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 200)) throw badRequest('Search must be at most 200 characters.');
  const q = (query.q || '').trim();
  const result = query.result || 'all';
  if (!['all', 'success', 'failed', 'unrecorded', 'redirected'].includes(result)) throw badRequest('Invalid audit result filter.');
  const from = dateBoundary(query.from), to = dateBoundary(query.to);
  if (from !== null && to !== null && from > to) throw badRequest('Start date must be on or before end date.');
  const where = {};
  if (actorId) where.actorId = actorId;
  if (from !== null || to !== null) where.at = { ...(from !== null ? { gte: new Date(from) } : {}), ...(to !== null ? { lt: new Date(to + DAY) } : {}) };
  if (result === 'success') where.status = { gte: 200, lt: 300 };
  if (result === 'redirected') where.status = { gte: 300, lt: 400 };
  if (result === 'failed') where.status = { gte: 400 };
  if (result === 'unrecorded') where.status = 0;
  return { page, pageSize, q, where };
}
function safeValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => ['role','isActive','enabled','difficulty'].includes(key) && ['string','boolean'].includes(typeof entry)).map(([key, entry]) => [key, typeof entry === 'string' ? redactSecrets(entry).slice(0, 200) : entry]));
}
function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return {
    actorRole: typeof metadata.actorRole === 'string' ? redactSecrets(metadata.actorRole).slice(0, 30) : null,
    changedFields: Array.isArray(metadata.changedFields) ? metadata.changedFields.filter(value => typeof value === 'string' && !/password|secret|token|key/i.test(value)).slice(0,30).map(value => redactSecrets(value).slice(0,100)) : [],
    requestedValues: safeValues(metadata.requestedValues), before: safeValues(metadata.before)
  };
}
const userSelect = { id: true, firstName: true, lastName: true, email: true };
async function listAuditEvents(req, res, next) {
  try {
    const { page: requestedPage, pageSize, q, where } = parseFilters(req.query);
    if (q) {
      const accounts = await prisma.user.findMany({ where: { OR: [{ firstName: { contains:q, mode:'insensitive' } },{ lastName: { contains:q, mode:'insensitive' } },{ email: { contains:q, mode:'insensitive' } }] }, select: { id: true }, take:1000 });
      const actorIds = accounts.map(user => user.id);
      if (/^\d+$/.test(q) && Number(q) <= 2147483647) actorIds.push(Number(q));
      where.OR = [{ path: { contains:q, mode:'insensitive' } },{ method: { equals:q.toUpperCase() } }, ...(actorIds.length ? [{ actorId: { in:actorIds } }] : [])];
    }
    const data = await prisma.$transaction(async tx => {
      const total = await tx.adminAuditLog.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const rows = await tx.adminAuditLog.findMany({ where, orderBy:[{ at:'desc' },{ id:'desc' }], take:pageSize, skip:(page - 1) * pageSize });
      return { rows, pagination:{ page, pageSize, total, totalPages } };
    });
    const accounts = await prisma.user.findMany({ where:{ id:{ in:[...new Set(data.rows.map(row => row.actorId))] } }, select:userSelect });
    const byId = new Map(accounts.map(user => [user.id, user]));
    res.set('Cache-Control','no-store');
    return res.json({ events:data.rows.map(row => ({ ...row, id:String(row.id), path:redactSecrets(row.path), metadata:safeMetadata(row.metadata), actor:byId.get(row.actorId) || null })), pagination:data.pagination });
  } catch(error) { next(error); }
}
async function listAuditActors(_req, res, next) {
  try {
    const ids = await prisma.adminAuditLog.groupBy({ by:['actorId'], orderBy:{ actorId:'asc' }, take:1000 });
    const users = await prisma.user.findMany({ where:{ id:{ in:ids.map(row => row.actorId) } }, select:userSelect });
    const byId = new Map(users.map(user => [user.id,user]));
    res.set('Cache-Control','no-store');
    return res.json({ actors:ids.map(row => ({ id:row.actorId, account:byId.get(row.actorId) || null })) });
  } catch(error) { next(error); }
}
module.exports = { listAuditEvents, listAuditActors, parseFilters, safeMetadata };
