function windowsSimulationsEnabled(env = process.env) {
  return String(env.WINDOWS_SIMULATIONS_ENABLED ?? "true").toLowerCase() === "true";
}
module.exports = { windowsSimulationsEnabled };
