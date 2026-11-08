const prisma = require("../prisma");
const { getModuleById } = require("../store/simulationModuleStore");
const { normalizeCommand, extractExpectedCommands } = require("../utils/simulationCommands");
async function startAttempt(req, res, next) {
  try {
    const module = await getModuleById(req.params.id);
    if (!module?.enabled) return res.status(404).json({ message: "Simulation module not found" });
    const surface = module.simulation?.surface;
    if (!["windows-terminal", "mac-terminal"].includes(surface)) return res.status(400).json({ message: "This surface does not support command verification." });
    const expected = (module.simulation?.steps || []).map(step => extractExpectedCommands(step.title, step));
    if (!expected.length) return res.status(400).json({ message: "This module has no steps." });
    const attempt = await prisma.simulationAttempt.create({ data: { userId: req.user.id, moduleId: module.id, surface,
      expected, expiresAt: new Date(Date.now() + 2 * 3600000) } });
    return res.status(201).json({ attemptKey: attempt.id, expiresAt: attempt.expiresAt, nextStep: 0 });
  } catch (err) { return next(err); }
}
async function submitCommand(req, res, next) {
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.attemptId}))`;
      const attempt = await tx.simulationAttempt.findFirst({ where: { id: req.params.attemptId, userId: req.user.id, moduleId: req.params.id } });
      if (!attempt || attempt.expiresAt <= new Date()) return null;
      // Client step index is only a retry key; it can never advance skipped steps.
      if (req.body.step < attempt.nextStep) return { accepted: true, nextStep: attempt.nextStep };
      const accepted = req.body.step === attempt.nextStep && Array.isArray(attempt.expected) &&
        attempt.expected[attempt.nextStep]?.includes(normalizeCommand(req.body.command));
      await tx.simulationAttempt.update({ where: { id: attempt.id }, data: accepted ? { nextStep: { increment: 1 } } : { mistakes: { increment: 1 } } });
      return { accepted, nextStep: attempt.nextStep + (accepted ? 1 : 0) };
    });
    if (!result) return res.status(404).json({ message: "Attempt not found or expired. Start a new simulation." });
    return res.json(result);
  } catch (err) { return next(err); }
}
module.exports = { startAttempt, submitCommand };
