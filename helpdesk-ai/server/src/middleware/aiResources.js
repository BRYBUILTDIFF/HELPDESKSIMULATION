const { randomUUID } = require('crypto');
const prisma = require('../prisma');
const { context, bounded } = require('../services/aiRequestContext');
const { requestLimit } = require('./requestLimits');
async function aiResources(req, res, next) {
  const id = randomUUID();
  const deadline = bounded('AI_REQUEST_DEADLINE_MS', 55000, 5000, 90000);
  const controller = new AbortController();
  let timer, reserved = false, released = false;
  async function release() {
    if (released || !reserved) return;
    released = true;
    await prisma.$executeRaw`DELETE FROM "SecurityLease" WHERE "id"=${id}`.catch(() => console.error('AI capacity release failed'));
  }
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(991124)`;
      await tx.$executeRaw`DELETE FROM "SecurityLease" WHERE "expiresAt" < CURRENT_TIMESTAMP`;
      const [counts] = await tx.$queryRaw`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "userId"=${req.user.id})::int AS owned FROM "SecurityLease"`;
      if (counts.total >= bounded('AI_GLOBAL_CONCURRENCY', 6, 1, 100) || counts.owned >= bounded('AI_USER_CONCURRENCY', 1, 1, 5)) {
        const error = new Error('AI capacity is busy'); error.status = 429; error.publicMessage = 'Another AI request is in progress. Please wait and try again.'; throw error;
      }
      await tx.$executeRaw`INSERT INTO "SecurityLease" ("id","userId","expiresAt") VALUES (${id},${req.user.id},${new Date(Date.now() + deadline + 10000)})`;
    });
    reserved = true;
    const finish = () => { clearTimeout(timer); void release(); };
    res.once('finish', finish);
    res.once('close', () => { controller.abort(); finish(); });
    timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) res.status(504).json({ message: 'The AI request timed out. Please try again shortly.' });
    }, deadline);
    timer.unref();
    context.run({ signal: controller.signal }, next);
  } catch (error) { await release(); next(error); }
}
function aiBudget(scope, maxKey, fallback, key) {
  return (req, res, next) => requestLimit(scope, { max: bounded(maxKey, fallback, 1, 100000), windowMs: 86400000, key })(req, res, next);
}
// Rolling daily request budgets, not currency caps. Failures also count.
const aiLimits = [
  aiBudget('ai-daily-user', 'AI_USER_DAILY_REQUESTS', 200, req => req.user.id),
  aiBudget('ai-daily-global', 'AI_GLOBAL_DAILY_REQUESTS', 1000, () => 'all'),
  aiResources
];
module.exports = { aiResources, aiLimits };
