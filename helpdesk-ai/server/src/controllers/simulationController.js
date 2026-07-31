const { listModules, recordModuleCompletion } = require("../store/simulationModuleStore");

async function listEnabledSimulationModules(_req, res, next) {
  try {
    const modules = await listModules({ onlyEnabled: true });
    return res.status(200).json({ modules });
  } catch (err) {
    return next(err);
  }
}

async function completeSimulationModule(req, res, next) {
  try {
    const result = await recordModuleCompletion({
      moduleId: String(req.params.id || "").trim(),
      userId: req.user.id,
      attemptKey: req.body?.attemptKey,
      surface: req.body?.surface,
      stepsCompleted: req.body?.stepsCompleted
    });
    if (!result) return res.status(404).json({ message: "Simulation module not found." });
    return res.status(200).json(result);
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ message: err.message });
    return next(err);
  }
}

module.exports = {
  listEnabledSimulationModules,
  completeSimulationModule
};
