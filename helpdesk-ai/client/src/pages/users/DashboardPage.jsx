import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import SimulationScenarioCanvas, {
  applyActionToEnvironment,
  applyHardwareControlToEnvironment,
  createEnvironmentStateForScenario,
  getHardwareSceneControls,
  normalizeEnvironmentStateForScenario
} from "./Modules/SimulationScenarioCanvas";
import "./dashboard.css";

const QUESTION_BANK = [
  { label: "Account", title: "Password Reset", question: "How do I reset a forgotten password?" },
  { label: "Hardware", title: "PC Won't Boot", question: "Computer won't turn on, black screen issue" },
  { label: "Network", title: "No Internet", question: "No internet connection, how to fix?" },
  { label: "Peripheral", title: "Printer Offline", question: "Printer is offline and won't print" },
  { label: "Performance", title: "Slow Computer", question: "Computer is very slow, high CPU usage" },
  { label: "Critical", title: "BSOD Error", question: "Blue screen of death BSOD error on Windows" },
  { label: "Email", title: "Outlook Sync", question: "My Outlook is not syncing emails, how can I fix it?" },
  { label: "Security", title: "Possible Malware", question: "My computer shows suspicious popups. What should I do?" },
  { label: "Access", title: "VPN Login", question: "I cannot connect to VPN from home." },
  { label: "Server", title: "Website Down", question: "Our internal website is down. What should I check first?" }
];

const SESSION_STORAGE_PREFIX = "helpdesk_simulation_sessions_";
const THEME_STORAGE_KEY = "helpdesk_simulation_theme";

const SIM_ACTION_LIBRARY = {
  network: [
    {
      label: "Adapter Diagnostics",
      output: "NIC status and driver health validated. Link is active and adapter responds normally.",
      keywords: ["adapter", "ethernet", "wifi", "network", "lan"]
    },
    {
      label: "DHCP Lease Renew",
      output: "IP lease renewed successfully. Host received a valid address, gateway, and DNS values.",
      keywords: ["dhcp", "ip renew", "renew", "address"]
    },
    {
      label: "DNS Cache Reset",
      output: "Local resolver cache flushed and registration refreshed.",
      keywords: ["dns", "name resolution", "resolve", "lookup"]
    },
    {
      label: "Gateway Reachability Test",
      output: "Gateway latency is stable and local route is healthy.",
      keywords: ["gateway", "ping", "router", "route"]
    },
    {
      label: "Network Escalation Packet",
      output: "Escalation handoff drafted with traces, lease details, and replication notes.",
      keywords: ["escalate", "handoff", "network team"]
    }
  ],
  email: [
    {
      label: "Mailbox Access Probe",
      output: "Mailbox access via OWA succeeds. Server-side mailbox is available.",
      keywords: ["owa", "mailbox", "access", "exchange", "email"]
    },
    {
      label: "Outlook Connectivity Reset",
      output: "Client offline/online state cycled and transport session rebuilt.",
      keywords: ["outlook", "offline", "sync"]
    },
    {
      label: "Profile Repair Wizard",
      output: "Outlook profile integrity check completed with repaired account metadata.",
      keywords: ["profile", "repair", "account"]
    },
    {
      label: "Send/Receive Queue Run",
      output: "Send/receive queue processed and pending items synchronized.",
      keywords: ["send/receive", "queue", "sync"]
    }
  ],
  printer: [
    {
      label: "Printer Power & Link Check",
      output: "Printer power and interface link validated.",
      keywords: ["power", "printer", "link", "offline"]
    },
    {
      label: "Spool Queue Cleanup",
      output: "Stuck jobs removed and print queue reset.",
      keywords: ["queue", "spool", "stuck", "job"]
    },
    {
      label: "Spooler Service Restart",
      output: "Print Spooler restarted. Service dependencies are healthy.",
      keywords: ["spooler", "service", "restart"]
    },
    {
      label: "Device Online Recovery",
      output: "Device state switched to online and endpoint heartbeat restored.",
      keywords: ["online", "offline", "device"]
    },
    {
      label: "Controlled Test Print",
      output: "Test page transmitted and printer acknowledged completion.",
      keywords: ["test page", "print", "output"]
    }
  ],
  security: [
    {
      label: "Endpoint Isolation Control",
      output: "Endpoint isolated from lateral movement paths.",
      keywords: ["isolate", "contain", "endpoint", "network"]
    },
    {
      label: "Security Bridge Alert",
      output: "Security response channel notified with incident context.",
      keywords: ["security", "incident", "soc", "alert"]
    },
    {
      label: "Offline Threat Scan",
      output: "Offline scanning routine completed and suspicious artifacts tagged.",
      keywords: ["scan", "malware", "virus", "threat"]
    },
    {
      label: "Credential Recovery Workflow",
      output: "Credential reset sequence initiated from trusted endpoint guidance.",
      keywords: ["credential", "password", "reset", "account"]
    },
    {
      label: "Reimage & Restore Plan",
      output: "Reimage recommendation prepared with backup and restore checkpoints.",
      keywords: ["reimage", "restore", "clean"]
    }
  ],
  hardware: [
    {
      label: "Power Cycle Controller",
      output: "Forced power cycle executed to clear transient kernel lock state.",
      keywords: ["force restart", "hold power", "power button", "restart"]
    },
    {
      label: "Boot Interrupt Trigger",
      output: "Boot interruption succeeded and recovery flow became available.",
      keywords: ["f8", "shift+f8", "automatic repair", "interrupt boot", "recovery"]
    },
    {
      label: "Recovery Menu Navigator",
      output: "Reached Troubleshoot > Advanced options > Startup Settings path.",
      keywords: ["troubleshoot", "advanced options", "startup settings", "restart"]
    },
    {
      label: "Safe Mode Launcher",
      output: "Safe Mode selected and minimal driver stack started.",
      keywords: ["safe mode", "press 4", "f4"]
    },
    {
      label: "Dump & Driver Analyzer",
      output: "Crash dump metadata reviewed; suspected driver class identified for next checks.",
      keywords: ["bsod", "blue screen", "dump", "driver", "crash"]
    }
  ],
  general: [
    {
      label: "Prerequisite Verifier",
      output: "Baseline prerequisites validated before execution.",
      keywords: ["check", "verify", "prerequisite"]
    },
    {
      label: "Step Execution Engine",
      output: "Current troubleshooting action executed and tracked.",
      keywords: ["run", "execute", "step", "next"]
    },
    {
      label: "Outcome Recorder",
      output: "Observed result captured in simulation evidence log.",
      keywords: ["result", "outcome", "capture"]
    },
    {
      label: "Escalation Draft Tool",
      output: "Escalation narrative prepared with completed diagnostics.",
      keywords: ["escalate", "handoff"]
    }
  ]
};

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function normalizeForHistory(messages) {
  return messages
    .filter((m) => m.type === "text")
    .slice(-10)
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text
    }));
}

function pickRandomQuestions(count = 6) {
  const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function firstUserPrompt(messages) {
  return messages.find((m) => m.role === "user" && m.type === "text")?.text || "";
}

function createSession(title = "New Chat") {
  const now = new Date().toISOString();
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    actionableAiMessageId: null,
    hasSimulation: false,
    isFavorite: false,
    simulationStepsByMessage: {},
    simulationCanvasByMessage: {},
    suggestedQuestions: pickRandomQuestions()
  };
}

function normalizeLoadedSession(session, idx) {
  const now = new Date().toISOString();
  const parsedMessages = Array.isArray(session?.messages) ? session.messages : [];
  const firstPrompt = firstUserPrompt(parsedMessages);
  const incomingTitle = typeof session?.title === "string" ? session.title.trim() : "";
  const hasGenericTitle = /^Session\s+\d+$/i.test(incomingTitle);
  const computedTitle = firstPrompt
    ? sessionTitleFromMessage(firstPrompt)
    : incomingTitle && !hasGenericTitle
      ? incomingTitle
      : "New Chat";

  return {
    id: session?.id || `session-${Date.now()}-${idx}`,
    title: computedTitle,
    createdAt: session?.createdAt || now,
    updatedAt: session?.updatedAt || now,
    messages: parsedMessages,
    actionableAiMessageId: session?.actionableAiMessageId || null,
    hasSimulation: Boolean(session?.hasSimulation),
    isFavorite: Boolean(session?.isFavorite),
    simulationStepsByMessage:
      session?.simulationStepsByMessage && typeof session.simulationStepsByMessage === "object"
        ? session.simulationStepsByMessage
        : {},
    simulationCanvasByMessage:
      session?.simulationCanvasByMessage && typeof session.simulationCanvasByMessage === "object"
        ? session.simulationCanvasByMessage
        : {},
    suggestedQuestions:
      Array.isArray(session?.suggestedQuestions) && session.suggestedQuestions.length > 0
        ? session.suggestedQuestions
        : pickRandomQuestions()
  };
}

function sessionTitleFromMessage(text) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "New Chat";
  }
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
}

function sessionPreview(session) {
  if (!session.messages.length) {
    return "No messages yet";
  }
  const firstUser = session.messages.find((m) => m.role === "user" && m.type === "text");
  if (!firstUser) {
    return "No user prompt yet";
  }
  return sessionTitleFromMessage(firstUser.text);
}

function SuggestionIcon({ label }) {
  const key = String(label || "").toLowerCase();

  const icons = {
    account: (
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.31 0-6 1.79-6 4v1h12v-1c0-2.21-2.69-4-6-4z" />
    ),
    hardware: (
      <path d="M4 7h16v8H4zm2 10h12v2H6zm3-12h6v2H9z" />
    ),
    network: (
      <path d="M12 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6-4a10 10 0 0 1 12 0m-9-3a6 6 0 0 1 6 0M4 11a14 14 0 0 1 16 0" />
    ),
    peripheral: (
      <path d="M6 8h12v8H6zm2 10h8m-6-6h4" />
    ),
    performance: (
      <path d="M4 18h16M7 14l3-3 2 2 5-5" />
    ),
    critical: (
      <path d="M12 3 2 20h20L12 3zm1 13h-2v-2h2zm0-4h-2v-4h2z" />
    ),
    email: (
      <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
    ),
    security: (
      <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3zm0 5a2 2 0 0 0-2 2v1h4v-1a2 2 0 0 0-2-2zm-3 4h6v4H9z" />
    ),
    access: (
      <path d="M8 12h8m-2-2 2 2-2 2M5 5h8v2H7v10h6v2H5z" />
    ),
    server: (
      <path d="M4 5h16v4H4zm0 6h16v4H4zm0 6h16v2H4M7 7h2m0 6h2" />
    )
  };

  return (
    <span className="quick-icon-wrap" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="quick-icon">
        {icons[key] || <path d="M12 3v18M3 12h18" />}
      </svg>
    </span>
  );
}

function normalizeAssistantText(rawText) {
  const input = String(rawText || "").replace(/\r\n/g, "\n").trim();
  if (!input) {
    return "";
  }

  if (/```[\s\S]*```/.test(input)) {
    return input;
  }

  return input
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\)\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferScenarioType(seedText = "") {
  const text = String(seedText || "").toLowerCase();
  if (/(boot|hardware|bios|power supply|bsod|blue screen|driver|ram|gpu|device|safe mode|startup settings|automatic repair)/i.test(text)) {
    return "hardware";
  }
  if (/(internet|network|dns|dhcp|wifi|router|vpn|gateway|ipconfig|ping)/i.test(text)) {
    return "network";
  }
  if (/(outlook|email|exchange|mailbox|owa|send\/receive|smtp|imap)/i.test(text)) {
    return "email";
  }
  if (/(printer|spooler|print queue|paper|offline print)/i.test(text)) {
    return "printer";
  }
  if (/(malware|virus|security|unauthorized|incident|soc|breach|phishing)/i.test(text)) {
    return "security";
  }
  return "general";
}

function detectScenarioTypeFromContext({ steps = [], sourceText = "", firstPromptText = "" }) {
  const joinedSteps = Array.isArray(steps) ? steps.join(" ") : "";
  const directType = inferScenarioType(`${sourceText} ${joinedSteps}`);
  if (directType !== "general") {
    return directType;
  }
  return inferScenarioType(`${firstPromptText} ${sourceText} ${joinedSteps}`);
}

function createSimulationCanvasState(steps, scenarioType) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  return {
    scenarioType: scenarioType || "general",
    currentIndex: 0,
    completed: safeSteps.map(() => false),
    evidence: [],
    actionsTakenByStep: safeSteps.map(() => []),
    resolved: false,
    environmentState: createEnvironmentStateForScenario(scenarioType || "general"),
    createdAt: new Date().toISOString()
  };
}

function normalizeSimulationCanvasState(state, steps, fallbackType) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const completed = Array.isArray(state?.completed) ? state.completed : [];
  const actions = Array.isArray(state?.actionsTakenByStep) ? state.actionsTakenByStep : [];

  return {
    scenarioType: state?.scenarioType || fallbackType || "general",
    currentIndex: Number.isInteger(state?.currentIndex) ? Math.max(0, state.currentIndex) : 0,
    completed: safeSteps.map((_, idx) => Boolean(completed[idx])),
    evidence: Array.isArray(state?.evidence) ? state.evidence : [],
    actionsTakenByStep: safeSteps.map((_, idx) => (Array.isArray(actions[idx]) ? actions[idx] : [])),
    resolved: Boolean(state?.resolved),
    environmentState: normalizeEnvironmentStateForScenario(
      state?.environmentState,
      state?.scenarioType || fallbackType || "general"
    ),
    createdAt: state?.createdAt || new Date().toISOString()
  };
}

function getActionsForStep(scenarioType, stepText) {
  const base = SIM_ACTION_LIBRARY[scenarioType] || SIM_ACTION_LIBRARY.general;
  const text = String(stepText || "").toLowerCase();
  const scored = base.map((action) => {
    const keywordHits = Array.isArray(action.keywords)
      ? action.keywords.reduce((acc, keyword) => (text.includes(String(keyword).toLowerCase()) ? acc + 1 : acc), 0)
      : 0;
    return { action, score: keywordHits };
  });
  const prioritized = scored
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.action);
  return prioritized.slice(0, 4);
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const api = useAxios();
  const location = useLocation();
  const chatWrapRef = useRef(null);
  const textareaRef = useRef(null);
  const accountMenuRef = useRef(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [sessionsHydrated, setSessionsHydrated] = useState(false);

  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [modalSteps, setModalSteps] = useState([]);
  const [modalSourceTitle, setModalSourceTitle] = useState("AI Response");
  const [modalActiveStep, setModalActiveStep] = useState(0);
  const [modalMessageId, setModalMessageId] = useState(null);
  const [modalCanvasState, setModalCanvasState] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = useState(null);
  const [theme, setTheme] = useState("dark");

  const denied = useMemo(() => new URLSearchParams(location.search).get("denied") === "1", [location.search]);
  const storageKey = useMemo(
    () => (user?.id ? `${SESSION_STORAGE_PREFIX}${user.id}` : null),
    [user?.id]
  );

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const messages = currentSession?.messages || [];
  const showWelcome = messages.length === 0;
  const favoriteSessions = useMemo(() => sessions.filter((session) => session.isFavorite), [sessions]);
  const regularSessions = useMemo(() => sessions.filter((session) => !session.isFavorite), [sessions]);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
      if (!event.target.closest(".session-menu-wrap")) {
        setOpenSessionMenuId(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!storageKey) {
      setSessionsHydrated(false);
      return;
    }
    setSessionsHydrated(false);
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        const initial = createSession();
        setSessions([initial]);
        setActiveSessionId(initial.id);
        setSessionsHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed.map((session, idx) => normalizeLoadedSession(session, idx));
        setSessions(normalized);
        setActiveSessionId(normalized[0].id);
        setSessionsHydrated(true);
      } else {
        const initial = createSession();
        setSessions([initial]);
        setActiveSessionId(initial.id);
        setSessionsHydrated(true);
      }
    } catch (_err) {
      const initial = createSession();
      setSessions([initial]);
      setActiveSessionId(initial.id);
      setSessionsHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !sessionsHydrated) {
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [sessions, sessionsHydrated, storageKey]);

  useEffect(() => {
    if (!chatWrapRef.current) {
      return;
    }
    chatWrapRef.current.scrollTop = chatWrapRef.current.scrollHeight;
  }, [messages, typing]);

  const ensureSession = () => {
    if (currentSession) {
      return currentSession;
    }
    const fresh = createSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    return fresh;
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const appendMessageToSession = (sessionId, message) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }
        const hasUserPromptAlready = session.messages.some((item) => item.role === "user" && item.type === "text");
        const nextTitle =
          !hasUserPromptAlready && message.role === "user"
            ? sessionTitleFromMessage(message.text)
            : session.title;
        return {
          ...session,
          title: nextTitle,
          updatedAt: new Date().toISOString(),
          messages: [...session.messages, message]
        };
      })
    );
  };

  const pushAiMessage = (sessionId, text, type = "text", context = {}) => {
    const aiMessageId = `${Date.now()}-ai`;
    const cleanedText = type === "text" ? normalizeAssistantText(text) : String(text || "");
    const shouldOfferSimulation =
      type === "text" ? shouldOfferInteractiveSimulation(cleanedText, context) : false;
    appendMessageToSession(sessionId, {
      id: aiMessageId,
      role: "ai",
      type,
      text: cleanedText,
      time: formatTime()
    });
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              actionableAiMessageId: shouldOfferSimulation ? aiMessageId : null
            }
          : session
      )
    );
  };

  const sendMessage = async (overrideText = "") => {
    const text = (overrideText || input).trim();
    if (!text || typing) {
      return;
    }

    const targetSession = ensureSession();
    const sessionId = targetSession.id;
    const previousMessages = targetSession.messages;
    const firstPromptContext = firstUserPrompt([
      ...previousMessages,
      { role: "user", type: "text", text }
    ]);

    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              actionableAiMessageId: null
            }
          : session
      )
    );

    appendMessageToSession(sessionId, {
      id: `${Date.now()}-user`,
      role: "user",
      type: "text",
      text,
      time: formatTime()
    });

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setTyping(true);

    try {
      const history = normalizeForHistory(previousMessages);
      const response = await api.post("/api/ai/chat", {
        message: text,
        history
      });
      if (response.data?.policy?.blocked) {
        pushAiMessage(sessionId, response.data.reply || "Request blocked by policy.", "policy", {
          userPromptText: text,
          firstPromptText: firstPromptContext
        });
      } else {
        pushAiMessage(sessionId, response.data.reply || "No response generated.", "text", {
          userPromptText: text,
          firstPromptText: firstPromptContext
        });
      }
    } catch (error) {
      if (!error.response) {
        pushAiMessage(sessionId, "Connection error. Please try again.", "text", {
          userPromptText: text,
          firstPromptText: firstPromptContext
        });
      } else if (error.response.status === 503) {
        pushAiMessage(
          sessionId,
          "AI service is not configured yet. Please set AI_API_KEY on the server.",
          "text",
          {
            userPromptText: text,
            firstPromptText: firstPromptContext
          }
        );
      } else {
        pushAiMessage(sessionId, error.response.data?.message || "Unable to get AI response right now.", "text", {
          userPromptText: text,
          firstPromptText: firstPromptContext
        });
      }
    } finally {
      setTyping(false);
    }
  };

  const askQuestion = async (question) => {
    await sendMessage(question);
  };

  const startNewSession = () => {
    setOpenSessionMenuId(null);
    if (currentSession && currentSession.messages.length === 0) {
      return;
    }

    const existingEmpty = sessions.find((session) => session.messages.length === 0);
    if (existingEmpty) {
      setActiveSessionId(existingEmpty.id);
      setInput("");
      setTyping(false);
      setStepModalOpen(false);
      setModalMessageId(null);
      setModalCanvasState(null);
      return;
    }

    const session = createSession();
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setInput("");
    setTyping(false);
    setStepModalOpen(false);
    setModalMessageId(null);
    setModalCanvasState(null);
  };

  const deleteSession = (sessionId) => {
    setOpenSessionMenuId(null);
    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== sessionId);
      if (next.length === 0) {
        const fresh = createSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(next[0].id);
      }
      return next;
    });
  };

  const renameSession = (sessionId) => {
    const current = sessions.find((session) => session.id === sessionId);
    if (!current) {
      return;
    }
    const inputTitle = window.prompt("Rename session title", current.title || "New Chat");
    if (inputTitle == null) {
      return;
    }
    const title = inputTitle.trim();
    if (!title) {
      return;
    }
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              title: sessionTitleFromMessage(title),
              updatedAt: new Date().toISOString()
            }
          : session
      )
    );
    setOpenSessionMenuId(null);
  };

  const toggleFavoriteSession = (sessionId) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              isFavorite: !session.isFavorite
            }
          : session
      )
    );
    setOpenSessionMenuId(null);
  };

  const extractStepsFromAiText = (text) => {
    const lines = String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const numberedOrBullets = lines
      .filter((line) => /^(\d+[\).\:-]|[-*])\s+/.test(line))
      .map((line) => line.replace(/^(\d+[\).\:-]|[-*])\s+/, "").trim())
      .filter(Boolean);

    if (numberedOrBullets.length > 0) {
      return numberedOrBullets.slice(0, 12);
    }

    const sentenceFallback = String(text || "")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 8);

    return sentenceFallback.length > 0 ? sentenceFallback : ["No steps detected from this response."];
  };

  const openStepModalFromMessage = (msg) => {
    const existingSteps = currentSession?.simulationStepsByMessage?.[msg.id];
    const steps = existingSteps || extractStepsFromAiText(msg.text);
    const detectedScenarioType = detectScenarioTypeFromContext({
      steps,
      sourceText: msg.text,
      firstPromptText: firstUserPrompt(currentSession?.messages || [])
    });
    const existingCanvas = currentSession?.simulationCanvasByMessage?.[msg.id];
    const hasRecordedActions = Array.isArray(existingCanvas?.actionsTakenByStep)
      ? existingCanvas.actionsTakenByStep.some((bucket) => Array.isArray(bucket) && bucket.length > 0)
      : false;
    const scenarioType = hasRecordedActions
      ? existingCanvas?.scenarioType || detectedScenarioType
      : detectedScenarioType;
    const canvasState = existingCanvas
      ? normalizeSimulationCanvasState(existingCanvas, steps, scenarioType)
      : createSimulationCanvasState(steps, scenarioType);

    setModalSteps(steps);
    setModalActiveStep(0);
    setModalMessageId(msg.id);
    setModalCanvasState(canvasState);
    setModalSourceTitle("AI Response Steps");
    setStepModalOpen(true);

    if (currentSession) {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSession.id
            ? {
                ...session,
                hasSimulation: true,
                simulationStepsByMessage: {
                  ...session.simulationStepsByMessage,
                  [msg.id]: steps
                },
                simulationCanvasByMessage: {
                  ...session.simulationCanvasByMessage,
                  [msg.id]: canvasState
                }
              }
            : session
        )
      );
    }
  };

  const modalStepCount = modalSteps.length || 0;
  const modalRuntimeIndex = Number.isInteger(modalCanvasState?.currentIndex)
    ? modalCanvasState.currentIndex
    : modalActiveStep;
  const modalSafeStep = modalStepCount > 0 ? Math.min(Math.max(0, modalRuntimeIndex), modalStepCount - 1) : 0;
  const modalProgress = modalStepCount > 0 ? Math.round(((modalSafeStep + 1) / modalStepCount) * 100) : 0;
  const modalCompletedCount = Array.isArray(modalCanvasState?.completed)
    ? modalCanvasState.completed.filter(Boolean).length
    : 0;
  const modalResolved = Boolean(modalCanvasState?.resolved);
  const modalCompletionPct = modalStepCount > 0 ? Math.round((modalCompletedCount / modalStepCount) * 100) : 0;

  const syncModalCanvasState = (updater) => {
    setModalCanvasState((prev) => {
      if (!prev) {
        return prev;
      }
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (!next || !currentSession?.id || !modalMessageId) {
        return next;
      }
      setSessions((prevSessions) =>
        prevSessions.map((session) =>
          session.id === currentSession.id
            ? {
                ...session,
                simulationCanvasByMessage: {
                  ...session.simulationCanvasByMessage,
                  [modalMessageId]: next
                }
              }
            : session
        )
      );
      return next;
    });
  };

  const setModalStepIndex = (index) => {
    if (modalStepCount <= 0) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(modalStepCount - 1, index));
    setModalActiveStep(safeIndex);
    syncModalCanvasState((prev) => ({
      ...prev,
      currentIndex: safeIndex
    }));
  };

  const markCurrentStepComplete = () => {
    if (modalStepCount <= 0) {
      return;
    }
    syncModalCanvasState((prev) => {
      const completed = [...prev.completed];
      completed[modalSafeStep] = true;
      const allDone = completed.every(Boolean);
      return {
        ...prev,
        completed,
        resolved: allDone,
        evidence: [
          ...prev.evidence,
          {
            type: "status",
            message: `Marked step ${modalSafeStep + 1} as completed.`,
            time: formatTime()
          }
        ]
      };
    });
  };

  const moveModalStep = (delta) => {
    if (modalStepCount <= 0) {
      return;
    }
    setModalStepIndex(modalSafeStep + delta);
  };

  const handleModalAction = (action) => {
    if (!action) {
      return;
    }
    syncModalCanvasState((prev) => {
      const actionsByStep = prev.actionsTakenByStep.map((bucket) => [...bucket]);
      actionsByStep[modalSafeStep] = [
        ...(actionsByStep[modalSafeStep] || []),
        {
          label: action.label,
          output: action.output,
          time: formatTime()
        }
      ];
      return {
        ...prev,
        environmentState: applyActionToEnvironment(prev.scenarioType, prev.environmentState, action),
        actionsTakenByStep: actionsByStep,
        evidence: [
          ...prev.evidence,
          {
            type: "action",
            message: `${action.label}: ${action.output}`,
            time: formatTime()
          }
        ]
      };
    });
  };

  const handleHardwareSceneControl = (control) => {
    if (!control || !control.enabled) {
      return;
    }
    syncModalCanvasState((prev) => {
      const actionsByStep = prev.actionsTakenByStep.map((bucket) => [...bucket]);
      actionsByStep[modalSafeStep] = [
        ...(actionsByStep[modalSafeStep] || []),
        {
          label: control.label,
          output: control.output,
          time: formatTime()
        }
      ];
      return {
        ...prev,
        environmentState: applyHardwareControlToEnvironment(prev.environmentState, control.id),
        actionsTakenByStep: actionsByStep,
        evidence: [
          ...prev.evidence,
          {
            type: "action",
            message: `${control.label}: ${control.output}`,
            time: formatTime()
          }
        ]
      };
    });
  };

  const closeStepModal = () => {
    setStepModalOpen(false);
    setModalMessageId(null);
    setModalCanvasState(null);
  };

  const modalStepActions = getActionsForStep(
    modalCanvasState?.scenarioType || "general",
    modalSteps[modalSafeStep] || ""
  );
  const modalHardwareControls =
    (modalCanvasState?.scenarioType || "general") === "hardware"
      ? getHardwareSceneControls(modalSteps[modalSafeStep] || "", modalCanvasState?.environmentState)
      : [];
  const modalStepActionLog = modalCanvasState?.actionsTakenByStep?.[modalSafeStep] || [];

  const parseProcessResponse = (text, context = {}) => {
    const normalized = normalizeAssistantText(text);
    const compactText = String(normalized || "").replace(/\s+/g, " ").trim();
    const userPromptText = String(context?.userPromptText || "");
    const firstPromptText = String(context?.firstPromptText || "");
    const contextText = `${compactText} ${userPromptText} ${firstPromptText}`.trim();
    const lines = String(normalized || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const steps = lines
      .filter((line) => /^(\d+[\).\:-]|[-*])\s+/.test(line))
      .map((line) => line.replace(/^(\d+[\).\:-]|[-*])\s+/, "").trim())
      .filter(Boolean);

    const troubleHints = lines.filter((line) =>
      /(trouble|if .* issue|if .* fails|if this does not work|cannot|can't|unable)/i.test(line)
    );

    const intro =
      lines.find((line) => !/^(\d+[\).\:-]|[-*])\s+/.test(line)) ||
      "Please follow the guided steps below.";

    const stepQuestionCount = steps.filter((step) => /\?\s*$/.test(step)).length;
    const hasOnlyQuestionSteps = steps.length > 0 && stepQuestionCount === steps.length;
    const isQuestionHeavyStepList = steps.length > 0 && stepQuestionCount / steps.length >= 0.6;
    const asksForUserInput =
      /(please confirm|can you confirm|please clarify|can you clarify|let me know|reply with|which one|what is your|do you have|are you using|once you confirm|before i give|to proceed,? please|need (a )?(bit )?more detail|provide more context)/i.test(
        compactText
      );
    const hasTroubleshootingIntent =
      /(can't|cannot|unable|not working|won't|error|issue|problem|failed|fails|failure|offline|down|broken|slow|malware|virus|bsod|crash|disconnect|no internet|not syncing|black screen|stuck|fix|troubleshoot|diagnose|repair|resolve)/i.test(
        contextText
      );
    const hasSetupGuideIntent =
      /(install|installation|set up|setup|download|office\.com|sign in|subscription|product key|activate|trial|purchase|buy|tutorial|walkthrough|how do i install|how to install)/i.test(
        contextText
      );
    const isNonTroubleshootingGuide = hasSetupGuideIntent && !hasTroubleshootingIntent;

    return {
      intro,
      steps: steps.slice(0, 10),
      troubleHints: troubleHints.slice(0, 4),
      hasCodeBlock: /```[\s\S]*```/.test(String(normalized || "")),
      isClarificationRequest:
        /(need (a )?(bit )?more detail|please clarify|could refer to|which .* (do you mean|should)|once you confirm|can you confirm|can you clarify|provide (more )?context)/i.test(
          compactText
        ),
      hasOnlyQuestionSteps,
      isQuestionHeavyStepList,
      asksForUserInput,
      hasTroubleshootingIntent,
      isNonTroubleshootingGuide,
      hasProcessCue: /(steps?|procedure|troubleshoot|follow|first|next|then|finally|check|verify|run)/i.test(
        String(normalized || "")
      )
    };
  };

  const shouldRenderProcessCard = (parsed) => {
    if (parsed.isClarificationRequest) {
      return false;
    }
    if (parsed.hasOnlyQuestionSteps) {
      return false;
    }
    if (parsed.isQuestionHeavyStepList && parsed.asksForUserInput) {
      return false;
    }
    if (parsed.hasCodeBlock) {
      return false;
    }
    if (parsed.steps.length >= 2) {
      return true;
    }
    if (parsed.steps.length === 1 && parsed.hasProcessCue) {
      return true;
    }
    return false;
  };

  const shouldOfferInteractiveSimulation = (text, context = {}) => {
    const parsed = parseProcessResponse(text, context);
    if (!shouldRenderProcessCard(parsed)) {
      return false;
    }
    if (parsed.isNonTroubleshootingGuide) {
      return false;
    }
    return true;
  };

  const renderMessageBody = (msg) => {
    if (msg.role === "user") {
      return <div className="user-bubble">{msg.text}</div>;
    }

    if (msg.type === "sim-choice") {
      return (
        <div className="msg-bubble">
          <h3>Simulation Moved</h3>
          <p style={{ fontSize: "13px", color: "var(--text2)", marginBottom: 12 }}>
            Simulations are now handled on the dedicated Simulations page.
          </p>
          <Link to="/simulations" className="create-sim-btn" style={{ textDecoration: "none" }}>
            Open Simulations
          </Link>
        </div>
      );
    }

    if (msg.type === "policy") {
      return (
        <div className="response-card policy-bubble">
          {/* <div className="response-top">
            <div className="issue-tag">Policy Filter</div>
            <div className="status-pill">Notice</div>
          </div> */}
          <div className="step-header">
            <h2>Request blocked by policy</h2>
            <p>{normalizeAssistantText(msg.text)}</p>
          </div>
        </div>
      );
    }

    const parsed = parseProcessResponse(msg.text);
    const renderAsProcess = shouldRenderProcessCard(parsed);

    return (
      <>
        {renderAsProcess ? (
          <div className="response-card">
            <div className="response-top">
              {/* <div className="issue-tag">IT Guided Troubleshooting</div> */}
              {/* <div className="status-pill">Guided Process</div> */}
            </div>

            <div className="step-header">
              <small>Step 1 of {Math.max(parsed.steps.length, 1)}</small>
              <h2>{parsed.steps[0]?.split(":")[0] || "Start with these checks"}</h2>
              <p>{parsed.intro}</p>
            </div>

            <div className="progress-wrap">
              <div className="progress-info">
                <span>Initial checks</span>
                <span>{Math.min(100, Math.max(20, Math.round(100 / Math.max(parsed.steps.length, 2))))}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, Math.max(20, Math.round(100 / Math.max(parsed.steps.length, 2))))}%`
                  }}
                />
              </div>
            </div>

            <ul className="check-list">
              {parsed.steps.map((step, idx) => {
                const [head, ...tail] = step.split(":");
                const hasDesc = tail.length > 0;
                return (
                  <li key={`${step.slice(0, 24)}-${idx}`} className="check-item">
                    <div className="check-number">{idx + 1}</div>
                    <div>
                      <h3>{hasDesc ? head.trim() : step}</h3>
                      <p>{hasDesc ? tail.join(":").trim() : "Follow this step and confirm the result."}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {parsed.troubleHints.length > 0 ? (
              <div className="question-box">
                <h3>Recommended next checks</h3>
                <div className="trouble-items">
                  {parsed.troubleHints.map((hint, idx) => (
                    <div key={`${hint.slice(0, 22)}-${idx}`} className="trouble-item">
                      {hint}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="response-card">
            <div className="response-top">
              {/* <div className="issue-tag">Helpdesk Response</div> */}
              {/* <div className="status-pill">Answer</div> */}
            </div>
            <div className="plain-answer" style={{ whiteSpace: "pre-wrap" }}>
              {normalizeAssistantText(msg.text)}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderSessionCard = (session) => (
    <button
      key={session.id}
      className={`session-item hd-btn-reset ${activeSessionId === session.id ? "active" : ""}`}
      onClick={() => {
        setActiveSessionId(session.id);
        setOpenSessionMenuId(null);
      }}
    >
      <div className="session-icon">
        {((firstUserPrompt(session.messages) || session.title || "?").trim().charAt(0) || "?").toUpperCase()}
      </div>
      <div className="session-body">
        <div className="session-head">
          <div className="session-title">{session.title}</div>
          {session.isFavorite ? <span className="session-fav-dot" title="Favorite">★</span> : null}
        </div>
        <div className="session-preview">{sessionPreview(session)}</div>
        <div className="session-time">{formatDateTime(session.updatedAt)}</div>
      </div>
      <div className="session-menu-wrap">
        <button
          className="session-menu-btn hd-btn-reset"
          title="Session actions"
          aria-label="Session actions"
          onClick={(e) => {
            e.stopPropagation();
            setOpenSessionMenuId((prev) => (prev === session.id ? null : session.id));
          }}
        >
          <span />
          <span />
          <span />
        </button>
        {openSessionMenuId === session.id ? (
          <div className="session-menu-popover" onClick={(e) => e.stopPropagation()}>
            <button className="session-menu-item hd-btn-reset" onClick={() => renameSession(session.id)}>
              Rename
            </button>
            <button className="session-menu-item hd-btn-reset" onClick={() => toggleFavoriteSession(session.id)}>
              {session.isFavorite ? "Remove Favorite" : "Favorite"}
            </button>
            <button className="session-menu-item danger hd-btn-reset" onClick={() => deleteSession(session.id)}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </button>
  );

  return (
    <div className={`helpdesk-root ${theme === "light" ? "theme-light" : ""}`}>
      {stepModalOpen ? (
        <div className="step-modal-overlay" onClick={closeStepModal}>
          <div className="step-modal" onClick={(e) => e.stopPropagation()}>
            <div className="step-modal-header">
              <div className="step-modal-title">{modalSourceTitle}</div>
              <button className="step-modal-close hd-btn-reset" onClick={closeStepModal}>
                X
              </button>
            </div>
            <div className="step-modal-progress-wrap">
              <div className="step-modal-progress-info">
                <span>Step {modalStepCount === 0 ? 0 : modalSafeStep + 1} of {modalStepCount}</span>
                <span>{modalProgress}%</span>
              </div>
              <div className="step-modal-progress-track">
                <div className="step-modal-progress-fill" style={{ width: `${modalProgress}%` }} />
              </div>
            </div>
            <div className="step-modal-body">
              <div className="step-modal-left">
                <h3>Simulation Steps</h3>
                <div className="step-modal-list">
                  {modalSteps.map((step, idx) => (
                    <button
                      key={`${step.slice(0, 20)}-${idx}`}
                      className={`step-modal-item hd-btn-reset ${idx === modalSafeStep ? "active" : ""}`}
                      onClick={() => setModalStepIndex(idx)}
                    >
                      <span className="step-modal-item-num">{idx + 1}</span>
                      <span className="step-modal-item-text">{step}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="step-modal-right">
                <h3>Simulation Canvas</h3>
                <div className="step-modal-status-row">
                  <span className="step-modal-status-pill">
                    Scenario: {(modalCanvasState?.scenarioType || "general").toUpperCase()}
                  </span>
                  <span className={`step-modal-status-pill ${modalResolved ? "is-resolved" : ""}`}>
                    {modalResolved ? "Resolved" : "In Progress"} | {modalCompletionPct}%
                  </span>
                </div>
                <div className="step-modal-current">
                  <div className="step-modal-current-label">Current Step</div>
                  <div className="step-modal-current-head">
                    <span className="step-modal-current-num">{modalStepCount === 0 ? 0 : modalSafeStep + 1}</span>
                    <span className="step-modal-current-title">
                      Step {modalStepCount === 0 ? 0 : modalSafeStep + 1}
                    </span>
                  </div>
                  <div className="step-modal-current-text">{modalSteps[modalSafeStep] || "No steps available."}</div>
                </div>
                <div className="step-modal-canvas">
                  <div className="step-modal-canvas-header">
                    <div className="step-modal-canvas-title">Simulation Environment</div>
                    <button className="step-modal-mark-btn hd-btn-reset" onClick={markCurrentStepComplete}>
                      Mark Step Complete
                    </button>
                  </div>
                  <SimulationScenarioCanvas
                    scenarioType={modalCanvasState?.scenarioType || "general"}
                    currentStepText={modalSteps[modalSafeStep] || ""}
                    canvasState={modalCanvasState}
                    stepIndex={modalSafeStep}
                    actions={modalStepActions}
                    hardwareControls={modalHardwareControls}
                    onRunAction={handleModalAction}
                    onRunHardwareControl={handleHardwareSceneControl}
                  />
                  <div className="step-modal-action-log">
                    {(modalStepActionLog.length > 0 ? modalStepActionLog : [{ label: "No actions yet", output: "Run an action to generate simulation output.", time: "--:--" }]).map((item, idx) => (
                      <div key={`${item.label}-${idx}`} className="step-modal-log-line">
                        <span className="step-modal-log-time">{item.time}</span>
                        <span className="step-modal-log-text">
                          <strong>{item.label}</strong> - {item.output}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="step-modal-footer">
                  <div className="step-modal-nav">
                    <button
                      className="step-modal-nav-btn hd-btn-reset"
                      disabled={modalSafeStep <= 0}
                      onClick={() => moveModalStep(-1)}
                    >
                      Previous
                    </button>
                    <button
                      className="step-modal-nav-btn primary hd-btn-reset"
                      disabled={modalSafeStep >= modalStepCount - 1}
                      onClick={() => moveModalStep(1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div id="helpdesk-app" className={sidebarCollapsed ? "sidebar-collapsed" : ""}>
        <div className={`hd-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="hd-sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">HS</div>
              <div className="sidebar-logo-text">
                Helpdesk <span>Simulation</span>
              </div>
            </div>
          </div>

          <div className="hd-modules-list">
            <div className="session-tools">
              <button className="new-chat-sidebar-btn hd-btn-reset" onClick={startNewSession}>
                <span className="new-chat-icon">+</span>
                <span className="new-chat-label">New Chat</span>
              </button>
              <Link to="/simulations" className="new-chat-sidebar-btn sim-sidebar-btn hd-btn-reset">
                <span className="new-chat-icon">S</span>
                <span className="new-chat-label">Simulations</span>
              </Link>
              <div className="hd-sidebar-heading">Your Sessions</div>
            </div>
            {sessions.length === 0 ? (
              <p className="session-empty">No sessions yet.</p>
            ) : (
              <>
                {favoriteSessions.length > 0 ? (
                  <>
                    <div className="session-group-heading">Favorite Sessions</div>
                    {favoriteSessions.map((session) => renderSessionCard(session))}
                  </>
                ) : null}
                {regularSessions.length > 0 ? (
                  <>
                    <div className="session-group-heading">
                      {favoriteSessions.length > 0 ? "All Sessions" : "Sessions"}
                    </div>
                    {regularSessions.map((session) => renderSessionCard(session))}
                  </>
                ) : null}
              </>
            )}
          </div>

          <div className="hd-sidebar-footer" ref={accountMenuRef}>
            <button className="avatar-menu-btn hd-btn-reset" onClick={() => setAccountMenuOpen((prev) => !prev)}>
              <div className="avatar-dot">{(user?.firstName || "U").slice(0, 1).toUpperCase()}</div>
              <div className="avatar-labels">
                <div className="avatar-name">{user?.firstName || "User"} {user?.lastName || ""}</div>
                <div className="avatar-sub">Account</div>
              </div>
            </button>
            {accountMenuOpen ? (
              <div className="avatar-popover">
                <div className="avatar-popover-name">{user?.firstName || ""} {user?.lastName || ""}</div>
                <div className="avatar-popover-email">{user?.email || ""}</div>
                <button
                  className="avatar-popover-btn hd-btn-reset"
                  onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                >
                  {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                </button>
                <button className="avatar-popover-btn danger hd-btn-reset" onClick={logout}>
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="hd-main">
          <div className="hd-topbar">
            <button
              className={`toggle-sidebar hd-btn-reset ${sidebarCollapsed ? "is-collapsed" : ""}`}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              <span className="toggle-icon">&lt;</span>
            </button>
            <div className="topbar-title">
              Helpdesk Simulation <span>{currentSession?.title || "Session Chat and Simulations"}</span>
            </div>
            <div className="status-dot" />
            <span className="status-text">System Online</span>
            {denied ? <span className="denied-pill">Access denied</span> : null}
            {user?.role === "ADMIN" ? (
              <Link to="/admin" className="top-btn">
                Admin
              </Link>
            ) : null}
          </div>

          <div className="chat-wrap" ref={chatWrapRef}>
            <div className={`messages ${showWelcome ? "messages-welcome" : ""}`}>
              {showWelcome ? (
                <div className="welcome">
                  <h1>Hello, {user?.firstName || "there"}.</h1>
                  <p>What IT issue can I help you troubleshoot today?</p>
                  <div className="welcome-composer">
                    <div className="welcome-input-box">
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          autoResize();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        rows={1}
                        placeholder="Ask about password reset, VPN, printer, internet, BSOD..."
                      />
                      <button
                        className="send-btn hd-btn-reset"
                        onClick={() => sendMessage()}
                        disabled={typing || !input.trim()}
                      >
                        &gt;
                      </button>
                    </div>
                  </div>
                  <div className="welcome-related-label">Related tickets and common problems</div>
                  <div className="quick-grid">
                    {(currentSession?.suggestedQuestions || pickRandomQuestions()).map((q) => (
                      <button key={q.title} className="quick-card hd-btn-reset" onClick={() => askQuestion(q.question)}>
                        <div className="quick-card-head">
                          <SuggestionIcon label={q.label} />
                          <div className="qc-label">{q.label}</div>
                        </div>
                        <div className="qc-title">{q.title}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((msg) => (
                <div key={msg.id} className={msg.role === "user" ? "message-row user" : "ai-block"}>
                  {msg.role === "user" ? (
                    <>
                      <div className="user-bubble-wrap">
                        <div className="message-meta">
                          <span>{msg.time}</span>
                          <span>You</span>
                        </div>
                        {renderMessageBody(msg)}
                      </div>
                      <div className="avatar user-avatar">YOU</div>
                    </>
                  ) : (
                    <>
                      <div className="avatar ai-avatar">HD</div>
                      <div className="ai-content">
                        <div className="ai-label">
                          <span aria-hidden="true" />
                          Helpdesk Simulation Response
                        </div>
                        <div className="msg-meta">{msg.time}</div>
                        {renderMessageBody(msg)}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {typing ? (
              <div className="typing-wrap ai-block">
                <div className="avatar ai-avatar">AI</div>
                <div className="typing-bubble">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : null}
          </div>

          {!showWelcome ? (
            <div className="input-area">
              <div className="input-inner">
                <div className="input-box">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      autoResize();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder="Describe your IT issue or ask how to fix something..."
                  />
                  <button className="send-btn hd-btn-reset" onClick={() => sendMessage()} disabled={typing || !input.trim()}>
                    &gt;
                  </button>
                </div>
                <div className="input-hint">Press Enter to send. Shift+Enter for newline.</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
