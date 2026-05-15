const DEFAULT_MODULES = [
  { id: "no-internet", title: "No Internet Connection", category: "Network", difficulty: "Easy", enabled: true },
  { id: "dns-problem", title: "DNS Problem", category: "Network", difficulty: "Easy", enabled: true },
  { id: "slow-pc", title: "Slow Computer / High CPU", category: "Performance", difficulty: "Medium", enabled: true },
  { id: "printer-spooler", title: "Printer Spooler Issue", category: "Peripheral", difficulty: "Medium", enabled: true },
  { id: "hidden-usb", title: "Recover Hidden USB Files", category: "Files", difficulty: "Medium", enabled: true },
  { id: "account-locked", title: "User Account Locked", category: "Account", difficulty: "Medium", enabled: true },
  { id: "server-down", title: "Website/Server Down", category: "Server", difficulty: "Hard", enabled: true },
  { id: "malware-check", title: "Suspicious Process / Malware Check", category: "Security", difficulty: "Hard", enabled: true },
  { id: "low-disk", title: "Low Disk Space", category: "Performance", difficulty: "Easy", enabled: true },
  { id: "service-not-running", title: "Service Not Running", category: "Software", difficulty: "Medium", enabled: true }
];

let modules = DEFAULT_MODULES.map((m) => ({ ...m }));

function listModules() {
  return modules.map((m) => ({ ...m }));
}

function updateModule(id, patch = {}) {
  const idx = modules.findIndex((m) => m.id === id);
  if (idx === -1) {
    return null;
  }
  modules[idx] = {
    ...modules[idx],
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : modules[idx].enabled,
    difficulty:
      typeof patch.difficulty === "string" && ["Easy", "Medium", "Hard"].includes(patch.difficulty)
        ? patch.difficulty
        : modules[idx].difficulty
  };
  return { ...modules[idx] };
}

module.exports = {
  listModules,
  updateModule
};

