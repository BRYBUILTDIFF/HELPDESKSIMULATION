const { listModules } = require("../store/simulationModuleStore");

async function listEnabledSimulationModules(_req, res, next) {
  try {
    const modules = await listModules({ onlyEnabled: true });
    return res.status(200).json({ modules });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listEnabledSimulationModules
};
