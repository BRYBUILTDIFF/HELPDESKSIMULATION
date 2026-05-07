import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import { simulations } from "./helpdeskData";
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
    { label: "Check adapter status", output: "Adapter status checked. Link looks active, no hardware fault detected." },
    { label: "Run IP renew", output: "Executed IP renew flow. Device received a valid lease from DHCP." },
    { label: "Flush DNS cache", output: "DNS cache flushed. Name resolution state refreshed." },
    { label: "Ping gateway", output: "Gateway ping successful. Local network path is reachable." },
    { label: "Escalate to network team", output: "Escalation note prepared for network operations with troubleshooting summary." }
  ],
  email: [
    { label: "Check OWA access", output: "OWA login check passed. Mailbox is accessible via web." },
    { label: "Toggle Work Offline", output: "Outlook offline mode toggled. Client is attempting to reconnect." },
    { label: "Restart Outlook", output: "Outlook restart simulated. Sync workers reinitialized." },
    { label: "Repair profile", output: "Mail profile repair task queued. Corrupt profile risk reduced." },
    { label: "Run send/receive", output: "Manual send/receive completed. Queue processing resumed." }
  ],
  printer: [
    { label: "Check printer power", output: "Power status verified. Printer responds to local panel input." },
    { label: "Clear print queue", output: "Queued jobs cleared. Spool backlog removed." },
    { label: "Restart print spooler", output: "Print Spooler service restarted successfully." },
    { label: "Set printer online", output: "Printer switched from offline to online state." },
    { label: "Print test page", output: "Test page sent and acknowledged by the device." }
  ],
  security: [
    { label: "Isolate endpoint", output: "Endpoint isolated from network. Containment state active." },
    { label: "Notify security team", output: "Security incident channel notified with incident metadata." },
    { label: "Run offline scan", output: "Offline scan simulated. Threat traces captured for report." },
    { label: "Reset credentials", output: "Credential reset checklist started from clean device guidance." },
    { label: "Prepare reimage plan", output: "Reimage recommendation drafted with post-restore checklist." }
  ],
  hardware: [
    { label: "Verify power path", output: "Power path inspected. Outlet and cable checks completed." },
    { label: "Reseat components", output: "Component reseat checklist completed for RAM/GPU devices." },
    { label: "Run diagnostics", output: "Hardware diagnostics executed. Capturing component health status." },
    { label: "Check event logs", output: "System event logs reviewed for boot/device errors." },
    { label: "Escalate to L2", output: "Escalation package prepared with diagnostics and timeline." }
  ],
  general: [
    { label: "Validate prerequisites", output: "Prerequisite checks completed. Baseline condition confirmed." },
    { label: "Execute next action", output: "Next troubleshooting action executed and logged." },
    { label: "Capture result", output: "Outcome captured and attached to the simulation timeline." },
    { label: "Add escalation note", output: "Escalation note drafted in case issue persists." },
    { label: "Prepare closure summary", output: "Closure summary drafted with actions and findings." }
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
  if (/(boot|hardware|bios|power supply|bsod|driver|ram|gpu|device)/i.test(text)) {
    return "hardware";
  }
  return "general";
}

function detectScenarioTypeFromContext({ steps = [], sourceText = "", firstPromptText = "" }) {
  const joinedSteps = Array.isArray(steps) ? steps.join(" ") : "";
  return inferScenarioType(`${firstPromptText} ${sourceText} ${joinedSteps}`);
}

function createSimulationCanvasState(steps, scenarioType) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  return {
    scenarioType: scenarioType || "general",
    currentIndex: 0,
    completed: safeSteps.map(() => false),
    notes: "",
    evidence: [],
    actionsTakenByStep: safeSteps.map(() => []),
    resolved: false,
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
    notes: typeof state?.notes === "string" ? state.notes : "",
    evidence: Array.isArray(state?.evidence) ? state.evidence : [],
    actionsTakenByStep: safeSteps.map((_, idx) => (Array.isArray(actions[idx]) ? actions[idx] : [])),
    resolved: Boolean(state?.resolved),
    createdAt: state?.createdAt || new Date().toISOString()
  };
}

function getActionsForStep(scenarioType, stepText) {
  const base = SIM_ACTION_LIBRARY[scenarioType] || SIM_ACTION_LIBRARY.general;
  const text = String(stepText || "").toLowerCase();

  const preferred = base.filter((action) => {
    const label = action.label.toLowerCase();
    if (text.includes("dns") && label.includes("dns")) {
      return true;
    }
    if (text.includes("printer") && label.includes("printer")) {
      return true;
    }
    if (text.includes("outlook") && label.includes("outlook")) {
      return true;
    }
    if (text.includes("security") && (label.includes("security") || label.includes("isolate"))) {
      return true;
    }
    if ((text.includes("boot") || text.includes("hardware")) && (label.includes("power") || label.includes("diagnostics"))) {
      return true;
    }
    return false;
  });

  if (preferred.length >= 2) {
    return preferred.slice(0, 4);
  }
  return base.slice(0, 4);
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

  const [simPanelOpen, setSimPanelOpen] = useState(false);
  const [currentSimId, setCurrentSimId] = useState(null);
  const [simStep, setSimStep] = useState(0);
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

  const currentSim = currentSimId ? simulations[currentSimId] : null;
  const simTotalSteps = currentSim?.steps?.length || 0;
  const simProgress = simTotalSteps ? Math.round(((simStep + 1) / simTotalSteps) * 100) : 0;

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

  const pushAiMessage = (sessionId, text, type = "text") => {
    const aiMessageId = `${Date.now()}-ai`;
    const cleanedText = type === "text" ? normalizeAssistantText(text) : String(text || "");
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
              actionableAiMessageId: type === "text" ? aiMessageId : session.actionableAiMessageId
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
        pushAiMessage(sessionId, response.data.reply || "Request blocked by policy.", "policy");
      } else {
        pushAiMessage(sessionId, response.data.reply || "No response generated.");
      }
    } catch (error) {
      if (!error.response) {
        pushAiMessage(sessionId, "Connection error. Please try again.");
      } else if (error.response.status === 503) {
        pushAiMessage(sessionId, "AI service is not configured yet. Please set AI_API_KEY on the server.");
      } else {
        pushAiMessage(sessionId, error.response.data?.message || "Unable to get AI response right now.");
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
      setCurrentSimId(null);
      setSimStep(0);
      setSimPanelOpen(false);
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
    setCurrentSimId(null);
    setSimStep(0);
    setSimPanelOpen(false);
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

  const openSim = (id) => {
    if (!simulations[id]) {
      return;
    }
    setCurrentSimId(id);
    setSimStep(0);
    setSimPanelOpen(true);
  };

  const closeSim = () => {
    setSimPanelOpen(false);
  };

  const simNav = (direction) => {
    if (!currentSim) {
      return;
    }
    if (direction === 1 && simStep === currentSim.steps.length - 1) {
      setSimStep(currentSim.steps.length);
      return;
    }
    setSimStep((prev) => Math.max(0, Math.min(currentSim.steps.length - 1, prev + direction)));
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
    const scenarioType = detectScenarioTypeFromContext({
      steps,
      sourceText: msg.text,
      firstPromptText: firstUserPrompt(currentSession?.messages || [])
    });
    const existingCanvas = currentSession?.simulationCanvasByMessage?.[msg.id];
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

  const updateModalNotes = (value) => {
    syncModalCanvasState((prev) => ({
      ...prev,
      notes: value
    }));
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
  const modalStepActionLog = modalCanvasState?.actionsTakenByStep?.[modalSafeStep] || [];

  const parseProcessResponse = (text) => {
    const normalized = normalizeAssistantText(text);
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

    return {
      intro,
      steps: steps.slice(0, 10),
      troubleHints: troubleHints.slice(0, 4),
      hasCodeBlock: /```[\s\S]*```/.test(String(normalized || "")),
      hasProcessCue: /(steps?|procedure|troubleshoot|follow|first|next|then|finally|check|verify|run)/i.test(
        String(normalized || "")
      )
    };
  };

  const shouldRenderProcessCard = (parsed) => {
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

  const renderMessageBody = (msg) => {
    if (msg.role === "user") {
      return <div className="user-bubble">{msg.text}</div>;
    }

    if (msg.type === "sim-choice") {
      return (
        <div className="msg-bubble">
          <h3>Choose a Simulation</h3>
          <p style={{ fontSize: "13px", color: "var(--text2)", marginBottom: 12 }}>
            Select a scenario to run an interactive step-by-step simulation:
          </p>
          <div className="quick-grid">
            {Object.entries(simulations).map(([id, sim]) => (
              <button key={id} className="quick-card hd-btn-reset" onClick={() => openSim(id)}>
                <div className="qc-label">Simulation</div>
                <div className="qc-title">{sim.title}</div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (msg.type === "policy") {
      return (
        <div className="response-card policy-bubble">
          <div className="response-top">
            <div className="issue-tag">Policy Filter</div>
            <div className="status-pill">Notice</div>
          </div>
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
        {msg.role === "ai" &&
        msg.type === "text" &&
        currentSession?.actionableAiMessageId === msg.id ? (
          <div className="main-action">
            <button className="create-sim-btn hd-btn-reset" onClick={() => openStepModalFromMessage(msg)}>
              {currentSession?.hasSimulation ? "View Simulation" : "Start Interactive Simulation"}
            </button>
          </div>
        ) : null}
      </>
    );
  };

  const renderSimPanel = () => {
    if (!currentSim) {
      return null;
    }

    const complete = simStep >= currentSim.steps.length;
    const step = complete ? null : currentSim.steps[simStep];
    const stepLabel = complete ? "Simulation Complete!" : `Step ${simStep + 1} of ${currentSim.steps.length}`;

    return (
      <>
        <div className={`sim-overlay ${simPanelOpen ? "open" : ""}`} onClick={closeSim} />
        <div className={`sim-panel ${simPanelOpen ? "open" : ""}`}>
          <div className="sim-header">
            <div className="sim-icon">SIM</div>
            <div className="sim-title">{currentSim.title}</div>
            <div className="sim-label">LIVE SIM</div>
            <button className="sim-close hd-btn-reset" onClick={closeSim}>
              X
            </button>
          </div>
          <div className="sim-body">
            <div className="sim-progress">
              <div className="sim-progress-bar" style={{ width: `${complete ? 100 : simProgress}%` }} />
            </div>
            <div className="sim-step-label">{stepLabel}</div>

            {complete ? (
              <div className="sim-complete">
                <div className="check">OK</div>
                <h3>Simulation Complete!</h3>
                <p>
                  You've completed all {currentSim.steps.length} steps of{" "}
                  <strong style={{ color: "var(--text)" }}>{currentSim.title}</strong>.
                </p>
                <button className="sim-restart hd-btn-reset" onClick={() => setSimStep(0)}>
                  Restart Simulation
                </button>
              </div>
            ) : (
              <div className="sim-step-card">
                <div className="sim-step-num">
                  STEP {simStep + 1} OF {currentSim.steps.length}
                </div>
                <div className="sim-step-title">{step.title}</div>
                <div className="sim-step-desc" dangerouslySetInnerHTML={{ __html: step.desc }} />
                <div className="sim-screen">
                  <pre>{step.screen}</pre>
                </div>
                <div className="sim-action">
                  <strong>Action</strong>
                  {step.action}
                </div>
                {step.result ? <div className="sim-result">OK {step.result}</div> : null}
              </div>
            )}

            {!complete ? (
              <div className="sim-nav">
                <button className="sim-btn prev hd-btn-reset" disabled={simStep === 0} onClick={() => simNav(-1)}>
                  Previous
                </button>
                <button className="sim-btn next hd-btn-reset" onClick={() => simNav(1)}>
                  {simStep === currentSim.steps.length - 1 ? "Complete" : "Next"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
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
      {renderSimPanel()}
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
                    <div className="step-modal-canvas-title">Actions</div>
                    <button className="step-modal-mark-btn hd-btn-reset" onClick={markCurrentStepComplete}>
                      Mark Step Complete
                    </button>
                  </div>
                  <div className="step-modal-actions-grid">
                    {modalStepActions.map((action) => (
                      <button
                        key={action.label}
                        className="step-modal-action-btn hd-btn-reset"
                        onClick={() => handleModalAction(action)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
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
                <div className="step-modal-notes-wrap">
                  <label htmlFor="sim-notes" className="step-modal-notes-label">
                    Simulation Notes
                  </label>
                  <textarea
                    id="sim-notes"
                    value={modalCanvasState?.notes || ""}
                    onChange={(e) => updateModalNotes(e.target.value)}
                    placeholder="Write findings, observations, and escalation notes here..."
                  />
                </div>
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
