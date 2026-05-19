const DEFAULT_MODULES = [
  {
    id: "no-internet",
    title: "No Internet Connection",
    category: "Network",
    difficulty: "Easy",
    enabled: true,
    completions: 8,
    passRate: 92,
    avgSteps: 4.1
  },
  {
    id: "dns-problem",
    title: "DNS Problem",
    category: "Network",
    difficulty: "Easy",
    enabled: true,
    completions: 6,
    passRate: 83,
    avgSteps: 5.3
  },
  {
    id: "slow-pc",
    title: "Slow Computer / High CPU",
    category: "Performance",
    difficulty: "Medium",
    enabled: true,
    completions: 4,
    passRate: 78,
    avgSteps: 5.8
  },
  {
    id: "printer-spooler",
    title: "Printer Spooler Issue",
    category: "Peripheral",
    difficulty: "Medium",
    enabled: true,
    completions: 3,
    passRate: 74,
    avgSteps: 6.2
  },
  {
    id: "hidden-usb",
    title: "Recover Hidden USB Files",
    category: "Files",
    difficulty: "Medium",
    enabled: true,
    completions: 2,
    passRate: 70,
    avgSteps: 6.5
  },
  {
    id: "account-locked",
    title: "User Account Locked",
    category: "Account",
    difficulty: "Medium",
    enabled: true,
    completions: 5,
    passRate: 86,
    avgSteps: 4.8
  },
  {
    id: "server-down",
    title: "Website/Server Down",
    category: "Server",
    difficulty: "Hard",
    enabled: true,
    completions: 2,
    passRate: 50,
    avgSteps: 8.7
  },
  {
    id: "malware-check",
    title: "Suspicious Process / Malware Check",
    category: "Security",
    difficulty: "Hard",
    enabled: true,
    completions: 1,
    passRate: 40,
    avgSteps: 10.2
  },
  {
    id: "low-disk",
    title: "Low Disk Space",
    category: "Performance",
    difficulty: "Easy",
    enabled: true,
    completions: 3,
    passRate: 81,
    avgSteps: 5
  },
  {
    id: "service-not-running",
    title: "Service Not Running",
    category: "Software",
    difficulty: "Medium",
    enabled: true,
    completions: 2,
    passRate: 72,
    avgSteps: 6.1
  }
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
