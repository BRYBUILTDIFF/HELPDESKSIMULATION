function getHardwareStepIntent(stepText = "") {
  const text = String(stepText || "").toLowerCase();
  if (/(force restart|hold power|power button)/i.test(text)) {
    return "force_restart";
  }
  if (/(f8|shift\s*\+\s*f8|interrupt boot|automatic repair|recovery)/i.test(text)) {
    return "boot_interrupt";
  }
  if (/(troubleshoot|advanced options|startup settings)/i.test(text)) {
    return "startup_path";
  }
  if (/(safe mode|press 4|f4)/i.test(text)) {
    return "safe_mode";
  }
  return "generic_hardware";
}

export function createEnvironmentStateForScenario(scenarioType) {
  if (scenarioType === "hardware") {
    return {
      outletPowered: true,
      towerPowered: true,
      monitorSignal: true,
      forcedRestartDone: false,
      bootInterruptDone: false,
      recoveryMenuOpen: false,
      startupSettingsOpen: false,
      safeModeLaunched: false,
      bootHealth: "unstable"
    };
  }

  if (scenarioType === "network") {
    return {
      adapterOnline: true,
      gatewayReachable: false,
      dnsHealthy: false,
      leaseRenewed: false
    };
  }

  if (scenarioType === "email") {
    return {
      mailboxReachable: false,
      outlookConnected: false,
      profileHealthy: false,
      queueClean: false
    };
  }

  if (scenarioType === "printer") {
    return {
      printerOnline: false,
      queueClean: false,
      spoolerRunning: false,
      testPrintDone: false
    };
  }

  return null;
}

export function normalizeEnvironmentStateForScenario(state, scenarioType) {
  const base = createEnvironmentStateForScenario(scenarioType);
  if (!base) {
    return null;
  }
  if (!state || typeof state !== "object") {
    return base;
  }
  return {
    ...base,
    ...state
  };
}

export function getHardwareSceneControls(stepText = "", env = null) {
  const state = env || createEnvironmentStateForScenario("hardware");
  const intent = getHardwareStepIntent(stepText);

  const controlsByIntent = {
    force_restart: [
      {
        id: "force-restart",
        label: "Hold Power Button (10s)",
        output: "Forced restart sequence executed. Kernel lock state cleared.",
        enabled: true
      },
      {
        id: "power-on-check",
        label: "Power On Verification",
        output: "System powers back on and enters pre-boot checks.",
        enabled: state.forcedRestartDone
      }
    ],
    boot_interrupt: [
      {
        id: "boot-interrupt",
        label: "Trigger Boot Interrupt",
        output: "Boot interrupted repeatedly. Recovery handoff initiated.",
        enabled: true
      },
      {
        id: "open-recovery",
        label: "Open Recovery Environment",
        output: "Automatic Repair loaded. Recovery options are now available.",
        enabled: state.bootInterruptDone
      }
    ],
    startup_path: [
      {
        id: "open-troubleshoot",
        label: "Open Troubleshoot Menu",
        output: "Troubleshoot menu opened.",
        enabled: state.bootInterruptDone || state.recoveryMenuOpen
      },
      {
        id: "open-advanced",
        label: "Open Advanced Options",
        output: "Advanced options opened.",
        enabled: state.recoveryMenuOpen
      },
      {
        id: "open-startup-settings",
        label: "Open Startup Settings",
        output: "Startup Settings opened and restart option is ready.",
        enabled: state.recoveryMenuOpen
      }
    ],
    safe_mode: [
      {
        id: "launch-safe-mode",
        label: "Press 4 / F4",
        output: "Safe Mode launched with minimal driver stack.",
        enabled: state.startupSettingsOpen
      },
      {
        id: "boot-health-check",
        label: "Verify Boot Stability",
        output: "System is stable in Safe Mode. Continue root-cause isolation.",
        enabled: state.safeModeLaunched
      }
    ],
    generic_hardware: [
      {
        id: "hardware-diagnostics",
        label: "Run Hardware Diagnostics",
        output: "Diagnostics completed. Component baseline captured.",
        enabled: true
      },
      {
        id: "event-log-review",
        label: "Review Event Logs",
        output: "Critical boot events captured for investigation.",
        enabled: true
      }
    ]
  };

  return controlsByIntent[intent] || controlsByIntent.generic_hardware;
}

export function applyHardwareControlToEnvironment(currentState, controlId) {
  const next = {
    ...(currentState || createEnvironmentStateForScenario("hardware"))
  };

  if (controlId === "force-restart") {
    next.forcedRestartDone = true;
    next.towerPowered = true;
    next.bootHealth = "recovering";
  } else if (controlId === "power-on-check") {
    next.towerPowered = true;
    next.monitorSignal = true;
  } else if (controlId === "boot-interrupt") {
    next.bootInterruptDone = true;
    next.bootHealth = "recovering";
  } else if (controlId === "open-recovery") {
    next.recoveryMenuOpen = true;
  } else if (controlId === "open-troubleshoot") {
    next.recoveryMenuOpen = true;
  } else if (controlId === "open-advanced") {
    next.recoveryMenuOpen = true;
  } else if (controlId === "open-startup-settings") {
    next.startupSettingsOpen = true;
  } else if (controlId === "launch-safe-mode") {
    next.safeModeLaunched = true;
    next.bootHealth = "stable";
    next.monitorSignal = true;
  } else if (controlId === "boot-health-check") {
    next.bootHealth = next.safeModeLaunched ? "stable" : "recovering";
  }

  return next;
}

export function applyActionToEnvironment(scenarioType, currentState, action) {
  const scenario = scenarioType || "general";
  const next = {
    ...(normalizeEnvironmentStateForScenario(currentState, scenario) || {})
  };
  const labelText = String(action?.label || "").toLowerCase();
  const outputText = String(action?.output || "").toLowerCase();
  const actionText = `${labelText} ${outputText}`;

  if (scenario === "network") {
    if (/(adapter|nic|link)/i.test(actionText)) {
      next.adapterOnline = true;
    }
    if (/(renew|dhcp|lease)/i.test(actionText)) {
      next.leaseRenewed = true;
    }
    if (/(gateway|ping|route)/i.test(actionText)) {
      next.gatewayReachable = true;
    }
    if (/(dns|resolver|name resolution)/i.test(actionText)) {
      next.dnsHealthy = true;
    }
  } else if (scenario === "email") {
    if (/(mailbox|owa|access)/i.test(actionText)) {
      next.mailboxReachable = true;
    }
    if (/(outlook|connect|send\/receive|queue|sync)/i.test(actionText)) {
      next.outlookConnected = true;
      next.queueClean = true;
    }
    if (/(profile|repair)/i.test(actionText)) {
      next.profileHealthy = true;
    }
  } else if (scenario === "printer") {
    if (/(online|device|power|printer)/i.test(actionText)) {
      next.printerOnline = true;
    }
    if (/(queue|spool|job|cleanup)/i.test(actionText)) {
      next.queueClean = true;
    }
    if (/(spooler|service|restart)/i.test(actionText)) {
      next.spoolerRunning = true;
    }
    if (/(test page|test print|print)/i.test(actionText) && next.queueClean && next.spoolerRunning) {
      next.testPrintDone = true;
    }
  }

  return Object.keys(next).length > 0 ? next : currentState;
}

export function buildSimulationEnvironment(scenarioType, currentStep = "", canvasState = null, stepIndex = 0) {
  const normalizedScenario = scenarioType || "general";
  const envState = canvasState?.environmentState || null;
  const allActionLogs = Array.isArray(canvasState?.actionsTakenByStep) ? canvasState.actionsTakenByStep : [];
  const executedCount = allActionLogs.flat().length;
  const stepLogs = Array.isArray(allActionLogs[stepIndex]) ? allActionLogs[stepIndex] : [];
  const latestOutput = stepLogs.length > 0 ? stepLogs[stepLogs.length - 1].output : "No tool has been executed yet.";
  const lowerStep = String(currentStep || "").toLowerCase();

  const presets = {
    hardware: {
      title: "Hardware Recovery Lab",
      metrics: [
        {
          label: "Boot State",
          value: envState?.safeModeLaunched
            ? "Safe Mode"
            : envState?.recoveryMenuOpen
              ? "Recovery Menu"
              : lowerStep.includes("safe mode")
                ? "Recovery Path"
                : "Pre-Boot Check"
        },
        { label: "Diagnostics", value: executedCount > 0 ? "Running" : "Waiting" },
        {
          label: "Risk Level",
          value: envState?.bootHealth === "stable" ? "Controlled" : lowerStep.includes("bsod") ? "Critical" : "Moderate"
        }
      ]
    },
    network: {
      title: "Network Operations Console",
      metrics: [
        { label: "Adapter", value: envState?.adapterOnline ? "Online" : "Offline" },
        { label: "DNS State", value: envState?.dnsHealthy ? "Healthy" : "Unstable" },
        { label: "Gateway", value: envState?.gatewayReachable ? "Reachable" : "Pending" }
      ]
    },
    email: {
      title: "Messaging Support Desk",
      metrics: [
        { label: "Mailbox", value: envState?.mailboxReachable ? "Reachable" : "Pending" },
        { label: "Client Sync", value: envState?.outlookConnected ? "Connected" : "Disconnected" },
        { label: "Profile", value: envState?.profileHealthy ? "Healthy" : "Needs Repair" }
      ]
    },
    printer: {
      title: "Print Service Workbench",
      metrics: [
        { label: "Device State", value: envState?.printerOnline ? "Online" : "Offline" },
        { label: "Queue", value: envState?.queueClean ? "Clear" : "Blocked" },
        { label: "Spooler", value: envState?.spoolerRunning ? "Running" : "Stopped" }
      ]
    },
    security: {
      title: "Security Incident Console",
      metrics: [
        { label: "Containment", value: executedCount > 0 ? "In Progress" : "Pending" },
        { label: "Threat Scope", value: lowerStep.includes("scan") ? "Under Scan" : "Unverified" },
        { label: "Escalation", value: lowerStep.includes("notify") ? "Focus" : "Standby" }
      ]
    },
    general: {
      title: "Guided Troubleshooting Canvas",
      metrics: [
        { label: "Workflow", value: executedCount > 0 ? "Active" : "Ready" },
        { label: "Current Phase", value: `Step ${stepIndex + 1}` },
        { label: "Latest Output", value: stepLogs.length > 0 ? "Captured" : "None" }
      ]
    }
  };

  const selected = presets[normalizedScenario] || presets.general;
  return {
    title: selected.title,
    metrics: selected.metrics,
    latestOutput
  };
}
