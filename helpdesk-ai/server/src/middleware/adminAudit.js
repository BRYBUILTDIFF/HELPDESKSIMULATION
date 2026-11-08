// Status 0 records an attempted action whose final response was not recorded.
const prisma = require("../prisma");
async function adminAudit(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  try {
    const record = await prisma.adminAuditLog.create({ data: { actorId: req.user.id, method: req.method,
      path: req.originalUrl.split("?")[0].slice(0, 500), status: 0 } });
    res.on("finish", () => {
      prisma.adminAuditLog.update({ where: { id: record.id }, data: { status: res.statusCode } })
        .catch(() => console.error("Admin audit result update failed", { id: String(record.id) }));
    });
    return next();
  } catch (err) { return next(err); }
}
module.exports = adminAudit;
