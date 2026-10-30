const openedSimulations = new Set();

// The standalone catalog has no saved attempt ID, so remember first opens per
// account/module. Dashboard attempts use their existing session identity instead.
export function claimCatalogWalkthrough(userId, moduleId) {
  if (!userId || !moduleId) return false;
  const key = `helpdesk_walkthrough:${userId}:${moduleId}`;
  if (openedSimulations.has(key)) return false;
  openedSimulations.add(key);
  try {
    if (localStorage.getItem(key) === "shown") return false;
    localStorage.setItem(key, "shown");
  } catch (_) { /* Keep the in-memory first-open behavior if storage is blocked. */ }
  return true;
}
