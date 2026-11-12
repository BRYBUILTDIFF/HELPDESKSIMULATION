// Status 0 records an attempted action whose final response was not recorded.
const prisma = require("../prisma");
async function adminAudit(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  try {
    const changedFields = Object.keys(req.body || {}).filter(key => !/password|secret|token|key/i.test(key)).slice(0, 30);
    const values = {};
    for (const key of ["role", "isActive", "enabled", "difficulty"]) {
      if (["string", "boolean"].includes(typeof req.body?.[key])) values[key] = req.body[key];
    }
    let before = null;
    const userMatch = /^\/api\/admin\/users\/(\d+)$/.exec(req.originalUrl.split("?")[0]);
    if (userMatch) before = await prisma.user.findUnique({ where: { id: Number(userMatch[1]) }, select: { role: true, isActive: true } });
    const record = await prisma.adminAuditLog.create({ data: { actorId: req.user.id, method: req.method,
      path: req.originalUrl.split("?")[0].slice(0, 500), status: 0,
      metadata: { actorRole: req.user.role, changedFields, requestedValues: values, before } } });
    res.on("finish", () => {
      prisma.adminAuditLog.update({ where: { id: record.id }, data: { status: res.statusCode } })
        .catch(() => console.error("Admin audit result update failed", { id: String(record.id) }));
      // Metadata-only structured output can be collected by an external log sink.
      console.info("Admin audit", { id: String(record.id), actorId: req.user.id, method: req.method,
        path: req.originalUrl.split("?")[0], status: res.statusCode, changedFields });
    });
    return next();
  } catch (err) { return next(err); }
}
module.exports = adminAudit;
