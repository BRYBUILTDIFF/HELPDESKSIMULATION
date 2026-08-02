import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import TerminalEmulator from "./Modules/TerminalEmulator";
import WindowsOsSimulation from "./Modules/WindowsOsSimulation";
import SimulationWalkthrough from "./Modules/SimulationWalkthrough";
import helpdeskLogo from "../../IMG/HELPDESKAI.png";
import { simulations } from "./helpdeskData";
import "./dashboard.css";

const THEME_STORAGE_KEY = "helpdesk_simulation_theme_v2";

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function firstUserPrompt(messages = []) {
  return messages.find((m) => m.role === "user" && m.type === "text")?.text || "";
}

function sessionPreview(session) {
  if (!Array.isArray(session?.messages) || session.messages.length === 0) {
    return "No messages yet";
  }
  const firstUser = session.messages.find((m) => m.role === "user" && m.type === "text");
  if (!firstUser?.text) {
    return "No user prompt yet";
  }
  const cleaned = firstUser.text.trim().replace(/\s+/g, " ");
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
}

function buildFallbackSimulation(module) {
  const title = String(module?.title || "Simulation Scenario").trim();
  const category = String(module?.category || "General").trim();
  return {
    title,
    surface: "windows-terminal",
    steps: [
      {
        title: "Gather Incident Details",
        desc: `Capture the user issue context for <b>${title}</b> and verify impact scope.`,
        screen: `> Ticket opened\n> Category: ${category}\n> Scenario: ${title}`,
        action: "Collect symptoms, affected systems, and timeline.",
        result: "Incident context documented."
      },
      {
        title: "Run Initial Checks",
        desc: "Perform safe baseline checks to confirm symptoms and isolate probable cause.",
        screen: "> Baseline checks running...\n> Connectivity, service state, and logs reviewed",
        action: "Validate environment and reproduce the issue.",
        result: "Initial diagnostics completed."
      },
      {
        title: "Apply Corrective Action",
        desc: "Use approved remediation aligned with support policy.",
        screen: "> Remediation sequence executed\n> Changes tracked",
        action: "Apply fix and monitor immediate response.",
        result: "Issue response improved."
      },
      {
        title: "Validate Recovery",
        desc: "Confirm service restoration from both system and user perspective.",
        screen: "> Validation tests passed\n> User confirmation received",
        action: "Run verification checks and collect proof.",
        result: "Recovery confirmed."
      },
      {
        title: "Document and Close",
        desc: "Document root cause and actions for future simulation improvements.",
        screen: "> Ticket notes updated\n> Simulation learning captured",
        action: "Record steps, lessons learned, and closure notes.",
        result: "Scenario completed."
      }
    ]
  };
}

export default function SimulationsPage() {
  const { user, logout } = useAuth();
  const api = useAxios();
  const accountMenuRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [activeSimId, setActiveSimId] = useState(null);
  const [activeSimLabel, setActiveSimLabel] = useState("Simulation");
  const [simStep, setSimStep] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [mobileView, setMobileView] = useState(false);
  const [serverModules, setServerModules] = useState([]);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  const simulationMap = useMemo(() => {
    const map = { ...simulations };
    serverModules.forEach((module) => {
      if (!module?.id) {
        return;
      }
      const moduleSimulation =
        module?.simulation && Array.isArray(module.simulation.steps) && module.simulation.steps.length > 0
          ? module.simulation
          : buildFallbackSimulation(module);
      map[module.id] = moduleSimulation;
    });
    return map;
  }, [serverModules]);

  const currentSim = activeSimId ? simulationMap[activeSimId] : null;
  const simTotalSteps = currentSim?.steps?.length || 0;
  const simProgress = simTotalSteps ? Math.round(((simStep + 1) / simTotalSteps) * 100) : 0;
  const favoriteSessions = useMemo(() => sessions.filter((session) => session.isFavorite), [sessions]);
  const regularSessions = useMemo(() => sessions.filter((session) => !session.isFavorite), [sessions]);

  const catalog = useMemo(() => {
    const grouped = new Map();
    serverModules.forEach((module) => {
      const cat = module.category || "General";
      if (!grouped.has(cat)) {
        grouped.set(cat, { cat, items: [] });
      }
      grouped.get(cat).items.push({
        id: module.id,
        label: module.title,
        keys: [module.category].filter(Boolean)
      });
    });
    return Array.from(grouped.values()).map((group) => ({
      ...group,
      cards: group.items.map((item) => {
        const sim = simulationMap[item.id];
        return {
          ...item,
          simId: item.id,
          available: Boolean(sim),
          description: sim?.steps?.[0]?.desc || "Guided simulation module for this support case.",
          stepCount: sim?.steps?.length || 0
        };
      })
    }));
  }, [serverModules, simulationMap]);

  useEffect(() => {
    let cancelled = false;
    const loadModules = async () => {
      try {
        const res = await api.get("/api/simulations/modules");
        if (!cancelled) {
          setServerModules(Array.isArray(res.data?.modules) ? res.data.modules : []);
        }
      } catch (_err) {
        if (!cancelled) {
          setServerModules([]);
        }
      }
    };
    loadModules();
    return () => {
      cancelled = true;
    };
  }, [api]);

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
    if (typeof window === "undefined") {
      return undefined;
    }
    const media = window.matchMedia("(max-width: 880px)");
    const syncLayout = (eventOrMedia) => {
      const isMobile = Boolean(eventOrMedia.matches);
      setMobileView(isMobile);
      setSidebarCollapsed(isMobile);
    };
    syncLayout(media);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncLayout);
      return () => media.removeEventListener("change", syncLayout);
    }
    media.addListener(syncLayout);
    return () => media.removeListener(syncLayout);
  }, []);

  // Always start a fresh walkthrough whenever a simulation becomes active.
  // This also covers simulations opened through restored or alternate UI state.
  useEffect(() => {
    if (activeSimId) {
      setShowWalkthrough(true);
    }
  }, [activeSimId]);

  useEffect(() => {
    if (!user?.id) {
      setSessions([]);
      return;
    }

    let cancelled = false;

    const loadSessions = async () => {
      try {
        const response = await api.get("/api/sessions");
        const serverSessions = Array.isArray(response.data?.sessions) ? response.data.sessions : [];
        if (!cancelled) {
          setSessions(serverSessions);
        }
      } catch (_err) {
        if (!cancelled) {
          setSessions([]);
        }
      }
    };

    loadSessions();

    return () => {
      cancelled = true;
    };
  }, [api, user?.id]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const openSimulation = (card) => {
    if (!card?.simId || !simulationMap[card.simId]) {
      return;
    }
    setActiveSimId(card.simId);
    setActiveSimLabel(card.label);
    setSimStep(0);
    setShowWalkthrough(true);
  };

  const closeSimulation = () => {
    setActiveSimId(null);
    setSimStep(0);
    setShowWalkthrough(false);
  };

  const moveStep = (delta) => {
    if (!currentSim) {
      return;
    }
    setSimStep((prev) => Math.max(0, Math.min(currentSim.steps.length - 1, prev + delta)));
  };

  return (
    <div className={`helpdesk-root ${theme === "light" ? "theme-light" : ""}`}>
      {currentSim && currentSim.surface !== "windows-os" && showWalkthrough ? (
        <SimulationWalkthrough
          key={activeSimId}
          type="terminal"
          onDone={() => setShowWalkthrough(false)}
        />
      ) : null}

      {currentSim?.surface === "windows-os" ? (
          <WindowsOsSimulation api={api} moduleId={activeSimId} title={activeSimLabel} steps={currentSim?.steps || []} onEnded={closeSimulation} />
      ) : null}

      {currentSim && currentSim.surface !== "windows-os" ? (
        <div className="step-modal-overlay" onClick={closeSimulation}>
          <div className="step-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sim-preview-topbar">
              <div className="sim-preview-topbar-left">
                <div className="sim-preview-window-dots" aria-hidden="true">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>
                <div className="sim-preview-module-title">
                  <span>{activeSimLabel}</span> · Simulation
                </div>
              </div>
              <div className="sim-preview-topbar-right">
                <button type="button" className="btn-sm sim-preview-close-btn" onClick={closeSimulation} aria-label="Close simulation">
                  X
                </button>
              </div>
            </div>
            <div className="step-modal-body sim-runtime-body">
              <aside className="sim-runtime-steps">
                <h3>Simulation Steps</h3>
                <div className="sim-runtime-step-list">
                  {currentSim.steps.map((step, idx) => (
                    <button
                      key={`${step.title}-${idx}`}
                      type="button"
                      className={`sim-runtime-step ${idx === simStep ? "active" : ""}`}
                      onClick={() => setSimStep(idx)}
                    >
                      <span className="sim-runtime-step-num">{idx + 1}</span>
                      <span className="sim-runtime-step-copy">
                        <span className="sim-runtime-step-title">{step.title}</span>
                        {step.action ? <span className="sim-runtime-step-sub">{step.action}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="sim-runtime-canvas">
                <h3>Simulation Canvas</h3>
                <div className="sim-runtime-status-row">
                  <span className="sim-runtime-status-pill">Scenario: {activeSimLabel}</span>
                  <span className="sim-runtime-status-pill">In Progress | {simProgress}%</span>
                </div>

                <div className="sim-runtime-current">
                  <div className="sim-runtime-current-label">Current Step</div>
                  <div className="sim-runtime-current-head">
                    <span className="sim-runtime-current-num">{simStep + 1}</span>
                    <span className="sim-runtime-current-title">{currentSim.steps[simStep].title}</span>
                  </div>
                  <div
                    className="sim-runtime-current-text"
                    dangerouslySetInnerHTML={{ __html: currentSim.steps[simStep].desc }}
                  />
                </div>

                <div className="sim-runtime-terminal">
                  <div className="sim-preview-terminal-head">
                    <span className="dot red" />
                    <span className="dot yellow" />
                    <span className="dot green" />
                    <strong>Helpdesk Terminal</strong>
                  </div>
                  <TerminalEmulator
                    className="sim-runtime-terminal-body"
                    initialMessage="Windows Terminal simulation ready. Type 'help' for available commands."
                    username="student"
                    hostname="DESKTOP-SIM"
                    initialPath="C:\\Users\\student"
                    onCommand={() => {}}
                    autoFocus={!showWalkthrough}
                  />
                </div>
              </section>
            </div>
            <div className="sim-runtime-footer">
              <div className="sim-preview-footer-center">
                <div className="sim-preview-step-dots" aria-hidden="true">
                  {currentSim.steps.map((step, index) => (
                    <span
                      key={`dot-${step.title}-${index}`}
                      className={`sim-preview-step-dot ${index < simStep ? "done" : index === simStep ? "active" : "todo"}`}
                    />
                  ))}
                </div>
                <span className="sim-preview-footer-nav">Step {simStep + 1} of {simTotalSteps}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div id="helpdesk-app" className={sidebarCollapsed ? "sidebar-collapsed" : ""}>
        {mobileView && !sidebarCollapsed ? (
          <button
            className="sidebar-backdrop hd-btn-reset"
            aria-label="Close sidebar"
            onClick={() => setSidebarCollapsed(true)}
          />
        ) : null}
        <div className={`hd-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="hd-sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon"><img src={helpdeskLogo} alt="HelpDesk AI" /></div>
              <div className="sidebar-logo-text">
                Helpdesk <span>Simulation</span>
              </div>
            </div>
          </div>
          <div className="hd-modules-list">
            <div className="session-tools">
              <Link
                to="/dashboard"
                className="new-chat-sidebar-btn hd-btn-reset"
                onClick={() => {
                  if (mobileView) {
                    setSidebarCollapsed(true);
                  }
                }}
              >
                <span className="new-chat-icon">+</span>
                <span className="new-chat-label">New Chat</span>
              </Link>
              <Link
                to="/simulations"
                className="new-chat-sidebar-btn sim-sidebar-btn hd-btn-reset"
                onClick={() => {
                  if (mobileView) {
                    setSidebarCollapsed(true);
                  }
                }}
              >
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
                    {favoriteSessions.map((session) => (
                      <Link
                        key={session.id}
                        to={`/dashboard?session=${session.id}`}
                        className="session-item hd-btn-reset"
                        onClick={() => {
                          if (mobileView) {
                            setSidebarCollapsed(true);
                          }
                        }}
                      >
                        <div className="session-icon">
                          {((firstUserPrompt(session.messages) || session.title || "?").trim().charAt(0) || "?").toUpperCase()}
                        </div>
                        <div className="session-body">
                          <div className="session-head">
                            <div className="session-title">{session.title || "New Chat"}</div>
                            <span className="session-fav-dot" title="Favorite">★</span>
                          </div>
                          <div className="session-preview">{sessionPreview(session)}</div>
                          <div className="session-time">{formatDateTime(session.updatedAt)}</div>
                        </div>
                      </Link>
                    ))}
                  </>
                ) : null}
                {regularSessions.length > 0 ? (
                  <>
                    {favoriteSessions.length > 0 ? <div className="session-group-heading">All Sessions</div> : null}
                    {regularSessions.map((session) => (
                      <Link
                        key={session.id}
                        to={`/dashboard?session=${session.id}`}
                        className="session-item hd-btn-reset"
                        onClick={() => {
                          if (mobileView) {
                            setSidebarCollapsed(true);
                          }
                        }}
                      >
                        <div className="session-icon">
                          {((firstUserPrompt(session.messages) || session.title || "?").trim().charAt(0) || "?").toUpperCase()}
                        </div>
                        <div className="session-body">
                          <div className="session-title">{session.title || "New Chat"}</div>
                          <div className="session-preview">{sessionPreview(session)}</div>
                          <div className="session-time">{formatDateTime(session.updatedAt)}</div>
                        </div>
                      </Link>
                    ))}
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
                <div className="avatar-theme-row">
                  <span className="avatar-theme-label">Dark Mode</span>
                  <button
                    className={`avatar-theme-switch hd-btn-reset ${theme === "dark" ? "is-on" : ""}`}
                    onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                    aria-label="Toggle dark mode"
                    aria-pressed={theme === "dark"}
                  >
                    <span className="avatar-theme-track">
                      <span className="avatar-theme-thumb" />
                    </span>
                    <span className="avatar-theme-state">{theme === "dark" ? "On" : "Off"}</span>
                  </button>
                </div>
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
              Simulation Modules <span>Ticketed Cases and Guided Labs</span>
            </div>
            <div className="status-dot" />
            <span className="status-text">System Online</span>
            {user?.role === "ADMIN" ? (
              <Link to="/admin" className="top-btn">
                Admin
              </Link>
            ) : null}
          </div>

          <div className="chat-wrap">
            <div className="messages">
              <div className="sim-hub">
                {catalog.length === 0 ? (
                  <div className="muted-cell">No simulation modules published by Admin yet.</div>
                ) : (
                  catalog.map((group) => (
                    <section key={group.cat} className="sim-hub-section">
                      <div className="sim-hub-head">
                        <h2>{group.cat}</h2>
                        <span>{group.cards.length} cases</span>
                      </div>
                      <div className="sim-hub-grid">
                        {group.cards.map((card) => (
                          <article key={card.id} className={`sim-hub-card ${card.available ? "" : "is-disabled"}`}>
                            <div className="sim-hub-card-top">
                              <div className="sim-hub-label">{card.label}</div>
                              <span className={`sim-hub-pill ${card.available ? "ok" : "na"}`}>
                                {card.available ? `${card.stepCount} steps` : "No Simulation"}
                              </span>
                            </div>
                            <p>{card.description}</p>
                            <button
                              className="create-sim-btn hd-btn-reset"
                              disabled={!card.available}
                              onClick={() => openSimulation(card)}
                            >
                              Open Simulation
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
