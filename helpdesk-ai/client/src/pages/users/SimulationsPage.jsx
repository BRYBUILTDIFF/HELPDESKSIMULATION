import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import { kb, modules, simulations } from "./helpdeskData";
import "./dashboard.css";

const THEME_STORAGE_KEY = "helpdesk_simulation_theme";
const SESSION_STORAGE_PREFIX = "helpdesk_simulation_sessions_";

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

function resolveSimulationId(itemId) {
  const kbEntry = kb[itemId];
  const candidate = kbEntry?.sim || itemId;
  if (!candidate) {
    return null;
  }
  return simulations[candidate] ? candidate : null;
}

export default function SimulationsPage() {
  const { user, logout } = useAuth();
  const api = useAxios();
  const accountMenuRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [activeSimId, setActiveSimId] = useState(null);
  const [activeSimLabel, setActiveSimLabel] = useState("Simulation");
  const [simStep, setSimStep] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [mobileView, setMobileView] = useState(false);

  const storageKey = useMemo(
    () => (user?.id ? `${SESSION_STORAGE_PREFIX}${user.id}` : null),
    [user?.id]
  );

  const currentSim = activeSimId ? simulations[activeSimId] : null;
  const simTotalSteps = currentSim?.steps?.length || 0;
  const simProgress = simTotalSteps ? Math.round(((simStep + 1) / simTotalSteps) * 100) : 0;
  const favoriteSessions = useMemo(() => sessions.filter((session) => session.isFavorite), [sessions]);
  const regularSessions = useMemo(() => sessions.filter((session) => !session.isFavorite), [sessions]);

  const catalog = useMemo(
    () =>
      modules.map((group) => ({
        ...group,
        cards: group.items.map((item) => {
          const simId = resolveSimulationId(item.id);
          const sim = simId ? simulations[simId] : null;
          return {
            ...item,
            simId,
            available: Boolean(simId),
            description:
              sim?.steps?.[0]?.desc ||
              kb[item.id]?.steps?.[0]?.t ||
              "Guided simulation module for this support case.",
            stepCount: sim?.steps?.length || 0
          };
        })
      })),
    []
  );

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
        // fallback to local cache for compatibility
        if (!storageKey) {
          if (!cancelled) setSessions([]);
          return;
        }
        try {
          const raw = localStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          if (!cancelled) {
            setSessions(Array.isArray(parsed) ? parsed : []);
          }
        } catch (_parseErr) {
          if (!cancelled) {
            setSessions([]);
          }
        }
      }
    };

    loadSessions();

    return () => {
      cancelled = true;
    };
  }, [api, storageKey, user?.id]);

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
    if (!card?.simId || !simulations[card.simId]) {
      return;
    }
    setActiveSimId(card.simId);
    setActiveSimLabel(card.label);
    setSimStep(0);
  };

  const closeSimulation = () => {
    setActiveSimId(null);
    setSimStep(0);
  };

  const moveStep = (delta) => {
    if (!currentSim) {
      return;
    }
    setSimStep((prev) => Math.max(0, Math.min(currentSim.steps.length - 1, prev + delta)));
  };

  return (
    <div className={`helpdesk-root ${theme === "light" ? "theme-light" : ""}`}>
      {currentSim ? (
        <div className="step-modal-overlay" onClick={closeSimulation}>
          <div className="step-modal" onClick={(e) => e.stopPropagation()}>
            <div className="step-modal-header">
              <div className="step-modal-title">{activeSimLabel} | {currentSim.title}</div>
              <button className="step-modal-close hd-btn-reset" onClick={closeSimulation}>
                X
              </button>
            </div>
            <div className="step-modal-progress-wrap">
              <div className="step-modal-progress-info">
                <span>Step {simStep + 1} of {simTotalSteps}</span>
                <span>{simProgress}%</span>
              </div>
              <div className="step-modal-progress-track">
                <div className="step-modal-progress-fill" style={{ width: `${simProgress}%` }} />
              </div>
            </div>
            <div className="step-modal-body">
              <div className="step-modal-left">
                <h3>Simulation Steps</h3>
                <div className="step-modal-list">
                  {currentSim.steps.map((step, idx) => (
                    <button
                      key={`${step.title}-${idx}`}
                      className={`step-modal-item hd-btn-reset ${idx === simStep ? "active" : ""}`}
                      onClick={() => setSimStep(idx)}
                    >
                      <span className="step-modal-item-num">{idx + 1}</span>
                      <span className="step-modal-item-text">{step.title}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="step-modal-right">
                <h3>Simulation Walkthrough</h3>
                <div className="step-modal-current">
                  <div className="step-modal-current-label">Current Step</div>
                  <div className="step-modal-current-head">
                    <span className="step-modal-current-num">{simStep + 1}</span>
                    <span className="step-modal-current-title">{currentSim.steps[simStep].title}</span>
                  </div>
                  <div
                    className="step-modal-current-text"
                    dangerouslySetInnerHTML={{ __html: currentSim.steps[simStep].desc }}
                  />
                </div>
                <div className="sim-step-card">
                  <div className="sim-step-num">SIMULATED SCREEN</div>
                  <div className="sim-screen">
                    <pre>{currentSim.steps[simStep].screen}</pre>
                  </div>
                  <div className="sim-action">
                    <strong>Action</strong>
                    {currentSim.steps[simStep].action}
                  </div>
                  {currentSim.steps[simStep].result ? (
                    <div className="sim-result">OK {currentSim.steps[simStep].result}</div>
                  ) : null}
                </div>
                <div className="step-modal-footer">
                  <div className="step-modal-nav">
                    <button className="step-modal-nav-btn hd-btn-reset" disabled={simStep <= 0} onClick={() => moveStep(-1)}>
                      Previous
                    </button>
                    <button
                      className="step-modal-nav-btn primary hd-btn-reset"
                      disabled={simStep >= simTotalSteps - 1}
                      onClick={() => moveStep(1)}
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
              <div className="sidebar-logo-icon">HS</div>
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
                  <span className="avatar-theme-label">Light Mode</span>
                  <button
                    className={`avatar-theme-switch hd-btn-reset ${theme === "light" ? "is-on" : ""}`}
                    onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                    aria-label="Toggle light mode"
                    aria-pressed={theme === "light"}
                  >
                    <span className="avatar-theme-track">
                      <span className="avatar-theme-thumb" />
                    </span>
                    <span className="avatar-theme-state">{theme === "light" ? "On" : "Off"}</span>
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
                {catalog.map((group) => (
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
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
