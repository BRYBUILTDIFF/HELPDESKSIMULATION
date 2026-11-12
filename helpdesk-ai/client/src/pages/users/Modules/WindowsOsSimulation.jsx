import { useCallback, useEffect, useRef, useState } from "react";
import SimulationWalkthrough from "./SimulationWalkthrough";

function messageFrom(error, fallback) {
  if (!error?.response && error?.isAxiosError) {
    return "Cannot reach the HelpDesk server. Check that the backend is running and try again.";
  }
  return error?.response?.data?.message || fallback;
}

function plainText(value) {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

export default function WindowsOsSimulation({ api, moduleId, chatSessionId, title, steps = [], completedStepIndexes = [], walkthroughOnOpen = true, onEnded, onSessionReady, onStepProgress }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("IDLE");
  const [guacamoleUrl, setGuacamoleUrl] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [revealAt, setRevealAt] = useState(() => Date.now() + 8 * 60 * 1000);
  const [desktopRevealed, setDesktopRevealed] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDesktopRevealed(true), Math.max(0, revealAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [revealAt]);
  const [error, setError] = useState("");
  const [launchNotice, setLaunchNotice] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(() => new Set(completedStepIndexes));
  const [completing, setCompleting] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(walkthroughOnOpen);
  const startedRef = useRef(false);
  const connectInFlightRef = useRef(false);
  const desktopFrameRef = useRef(null);
  const connectionIssuedAtRef = useRef(0);
  const refreshedAtRevealRef = useRef(null);
  const retryDeadlineRef = useRef(Date.now() + 10 * 60 * 1000);
  const guidedSteps = Array.isArray(steps) ? steps : [];
  const currentStep = guidedSteps[activeStep];
  const currentStepAction = plainText(currentStep?.action || currentStep?.instruction);
  const currentStepDescription = plainText(currentStep?.desc || currentStep?.description);

  const start = useCallback(async () => {
    setRevealAt(Date.now() + 8 * 60 * 1000);
    setDesktopRevealed(false);
    retryDeadlineRef.current = Date.now() + 10 * 60 * 1000;
    connectInFlightRef.current = false;
    setLaunchNotice(null);
    setError(""); setGuacamoleUrl(""); setSession(null); setStatus("PROVISIONING");
    try {
      const response = await api.post("/api/simulation-sessions", { moduleId, ...(chatSessionId ? {chatSessionId} : {}) });
      if (response.data?.revealAt) {
        const deadline = new Date(response.data.revealAt).getTime();
        if (Number.isFinite(deadline)) {
          setRevealAt(deadline);
          setDesktopRevealed(Date.now() >= deadline);
        }
      }
      setSession(response.data); setStatus(response.data?.status || "PROVISIONING");
      onSessionReady?.(response.data);
    } catch (err) {
      if ([409, 429].includes(err.response?.status)) {
        setLaunchNotice({
          dailyLimit: err.response?.data?.code === "SIMULATION_DAILY_LIMIT",
          message: messageFrom(err, "Windows labs are temporarily unavailable. Please try again later.")
        });
      }
      setStatus("FAILED"); setError(messageFrom(err, "Unable to prepare your Windows workspace."));
    }
  }, [api, moduleId, chatSessionId, onSessionReady]);

  useEffect(() => { if (!startedRef.current) { startedRef.current = true; start(); } }, [start]);
  useEffect(() => {
    if (!session?.id || status !== "PROVISIONING") return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const response = await api.get(`/api/simulation-sessions/${session.id}`);
        if (cancelled) return;
        setError("");
        setSession(response.data);
        setStatus(response.data.status);
        onSessionReady?.(response.data);
        if (response.data.status === "PROVISIONING") {
          timer = window.setTimeout(poll, 4000);
        }
      } catch (err) {
        if (!cancelled) {
          if (!err?.response || err.response.status >= 500 || err.response.status === 429) {
            setError("Still waiting for your workspace. Retrying automatically...");
            timer = window.setTimeout(poll, 5000);
          } else {
            setStatus("FAILED"); setError(messageFrom(err, "Unable to connect to your Windows workspace."));
          }
        }
      }
    };
    timer = window.setTimeout(poll, 4000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, onSessionReady, session?.id, status]);

  useEffect(() => {
    if (!session?.id || guacamoleUrl || !["READY", "ACTIVE"].includes(status) || connectInFlightRef.current) return;
    connectInFlightRef.current = true;
    api.post(`/api/simulation-sessions/${session.id}/connect`)
      .then((response) => {
        setSession(response.data);
        const connectionUrl = new URL(response.data.guacamoleUrl);
        connectionUrl.searchParams.set("parentOrigin", window.location.origin);
        connectionUrl.searchParams.set("revealAt", String(revealAt));
        setGuacamoleUrl(connectionUrl.href);
        connectionIssuedAtRef.current = Date.now();
        setConnectionAttempt((attempt) => attempt + 1);
        setStatus("CONNECTING");
        onSessionReady?.(response.data);
      })
      .catch((err) => {
        connectInFlightRef.current = false;
        setStatus("FAILED");
        setError(messageFrom(err, "Unable to connect to your Windows workspace."));
      });
  }, [api, guacamoleUrl, onSessionReady, session?.id, status, revealAt]);

  useEffect(() => {
    if (!desktopRevealed || !session?.id || !guacamoleUrl || !["CONNECTING", "ACTIVE"].includes(status)) return;
    if (refreshedAtRevealRef.current === session.id) return;
    refreshedAtRevealRef.current = session.id;
    // A token issued during boot may already have expired when the cover lifts.
    // Request a fresh URL once, preserving the VM, steps, and session deadline.
    if (connectionIssuedAtRef.current < revealAt) {
      connectInFlightRef.current = false;
      setGuacamoleUrl("");
      setStatus("READY");
    }
  }, [desktopRevealed, session?.id, guacamoleUrl, status, revealAt]);

  useEffect(() => {
    if (!guacamoleUrl || !session?.id || !["CONNECTING", "ACTIVE"].includes(status)) return undefined;
    const expectedOrigin = new URL(guacamoleUrl).origin;
    let retryTimer;
    const receiveState = (event) => {
      if (event.source !== desktopFrameRef.current?.contentWindow || event.origin !== expectedOrigin || event.data?.type !== "helpdesk-lab-state") return;
      if (event.data.state === "CONNECTED") {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
        retryDeadlineRef.current = Date.now() + 10 * 60 * 1000;
        setStatus("ACTIVE");
        return;
      }
      if (event.data.state !== "RETRY" || retryTimer) return;
      const expired = new Date(session.expiresAt).getTime() <= Date.now();
      if (expired || Date.now() >= retryDeadlineRef.current) {
        setGuacamoleUrl("");
        setStatus("FAILED");
        setError(expired ? "This lab has expired. End it and start a new simulation." : "Windows did not become reachable. Try Again or end this simulation.");
        return;
      }
      retryTimer = window.setTimeout(() => {
        connectInFlightRef.current = false;
        setGuacamoleUrl("");
        setStatus("READY");
      }, 10000);
    };
    window.addEventListener("message", receiveState);
    return () => { window.removeEventListener("message", receiveState); window.clearTimeout(retryTimer); };
  }, [guacamoleUrl, session?.id, session?.expiresAt, status]);

  useEffect(() => {
    setActiveStep((current) => Math.min(current, Math.max(guidedSteps.length - 1, 0)));
  }, [guidedSteps.length]);

  useEffect(() => {
    setCompletedSteps(new Set(completedStepIndexes));
  }, [completedStepIndexes]);

  const markCurrentStepComplete = () => {
    if (!currentStep) return;
    setCompletedSteps((previous) => {
      const next = new Set(previous);
      next.add(activeStep);
      onStepProgress?.(Array.from(next).sort((a, b) => a - b));
      return next;
    });
    if (activeStep < guidedSteps.length - 1) {
      setActiveStep((step) => step + 1);
    }
  };

  const end = useCallback(async () => {
    setGuacamoleUrl("");
    setStatus("TERMINATING");
    if (session?.id) {
      try {
        await api.post(`/api/simulation-sessions/${session.id}/end`);
      } catch (err) {
        setStatus("FAILED");
        setError(messageFrom(err, "Unable to end the workspace. Use End Simulation to retry."));
        return;
      }
    }
    setSession(null);
    onEnded?.();
  }, [api, onEnded, session?.id]);
  const complete = useCallback(async () => {
    if (!session?.id || completing) return;
    setCompleting(true);
    setError("");
    try {
      await api.post(`/api/simulations/modules/${moduleId}/complete`, {
        attemptKey: `windows-os:${session.id}`,
        surface: "windows-os",
        stepsCompleted: guidedSteps.length > 0 ? activeStep + 1 : 0
      });
      await end();
    } catch (err) {
      setError(messageFrom(err, "Unable to record this completed simulation."));
    } finally {
      setCompleting(false);
    }
  }, [api, completing, end, guidedSteps.length, activeStep, moduleId, session?.id]);
  const retry = () => { startedRef.current = true; start(); };
  const remainingMinutes = desktopRevealed && session?.expiresAt ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - clockNow) / 60000)) : null;

  return <div className="windows-os-overlay" aria-label="Windows OS simulation">
    <section className="windows-os-shell">
      <header className="windows-os-header"><div><h2>{title}</h2><span className="windows-os-lab-label">Windows lab</span></div><div className="windows-os-controls">{remainingMinutes !== null ? <span>{remainingMinutes} min remaining</span> : null}<button type="button" className="windows-os-end-btn btn-sm" onClick={end}>End Simulation</button><button type="button" className="windows-os-complete-btn btn-sm" onClick={complete} disabled={!session?.id || completing} title={!session?.id ? "A live workspace is required to record completion" : "Complete simulation"}>✓ <span>{completing ? "Completing..." : "Complete Simulation"}</span></button></div></header>
      {["IDLE", "PROVISIONING", "READY", "TERMINATING"].includes(status) ? <div className="windows-os-status" role="status"><div className="windows-os-spinner" aria-hidden="true" /><h3>{status === "TERMINATING" ? "Ending your Windows Server 2025 workspace..." : "Preparing your Windows Server 2025 workspace..."}</h3><p>We are getting your lab ready. This may take a few minutes. Please keep this page open.</p></div> : null}
      {["CONNECTING", "ACTIVE"].includes(status) && guacamoleUrl ? <div className="windows-os-workspace" style={{ position: "relative" }}>
        {!desktopRevealed ? <div className="windows-os-status" role="status" style={{ position: "absolute", inset: 0, zIndex: 10, background: "var(--bg2, #ffffff)" }}>
          <div className="windows-os-spinner" aria-hidden="true" />
          <h3>Preparing your Windows Server 2025 workspace...</h3>
          <p>We are getting your lab ready. This may take a few minutes. Please keep this page open.</p>
        </div> : null}
        <aside inert={!desktopRevealed ? "" : undefined} className="windows-os-guide" aria-label="Simulation steps">
          <div className="windows-os-guide-heading"><span>Simulation Steps</span><small>{guidedSteps.length ? `${activeStep + 1} of ${guidedSteps.length}` : "No steps"}</small></div>
          {guidedSteps.length ? <div className="windows-os-step-list">
            {guidedSteps.map((step, index) => <button type="button" key={`${step?.id || step?.title || "step"}-${index}`} className={`windows-os-step${index === activeStep ? " is-active" : ""}${completedSteps.has(index) ? " is-complete" : ""}`} onClick={() => setActiveStep(index)}>
              <span className="windows-os-step-number">{completedSteps.has(index) ? "✓" : index + 1}</span>
              <span><strong>{step?.title || `Step ${index + 1}`}</strong><small>{plainText(step?.action || step?.instruction || step?.desc || step?.description) || "Follow the task instructions."}</small></span>
            </button>)}
          </div> : <p className="windows-os-no-steps">This module does not include guided steps yet.</p>}
          <div className="windows-os-help-card"><strong>Working through the guide</strong><span>Follow each step carefully. You can navigate back and forth between steps at any time.</span></div>
        </aside>
        <section inert={!desktopRevealed ? "" : undefined} className="windows-os-desktop">
          {currentStep ? <div className="windows-os-instruction">
            <span>Current Step</span>
            <h3>{currentStep.title || `Step ${activeStep + 1}`}</h3>
            <p className="windows-os-step-action">{currentStepAction || "Complete this task in the Windows workspace."}</p>
            {currentStepDescription && currentStepDescription !== currentStepAction ? (
              <p className="windows-os-step-description">{currentStepDescription}</p>
            ) : null}
            <button type="button" className="windows-os-mark-step btn-sm" onClick={markCurrentStepComplete} disabled={completedSteps.has(activeStep)}>
              {completedSteps.has(activeStep) ? "Completed" : activeStep === guidedSteps.length - 1 ? "Complete final step" : "Complete step"}
            </button>
          </div> : null}
          <iframe ref={desktopFrameRef} key={`${session.id}-${connectionAttempt}`} className="windows-os-frame" title="Windows Server 2025 Help Desk Lab" src={guacamoleUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock" allow="clipboard-read; clipboard-write; fullscreen" referrerPolicy="no-referrer" />
        </section>
      </div> : null}
      {desktopRevealed && guacamoleUrl ? <footer className="windows-os-footer">
        <button type="button" className="windows-os-nav-btn btn-sm" disabled={!currentStep || activeStep === 0} onClick={() => setActiveStep((step) => step - 1)}>← <span>Previous Step</span></button>
        <div className="windows-os-footer-progress"><span>{completedSteps.size} of {guidedSteps.length} complete</span><div className="windows-os-progress-line">{guidedSteps.map((_, index) => <i key={index} className={completedSteps.has(index) ? "done" : index === activeStep ? "active" : ""} />)}</div></div>
        <button type="button" className="windows-os-nav-btn is-next btn-sm" disabled={!currentStep || activeStep === guidedSteps.length - 1} onClick={() => setActiveStep((step) => step + 1)}><span>Next Step</span> →</button>
      </footer> : null}
      {status === "FAILED" ? <div className="windows-os-status is-error" role="alert"><div className="windows-os-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4m0-13v3m0 3h.01" /></svg></div><h3>{launchNotice?.dailyLimit ? "Daily Windows lab limit reached" : launchNotice ? "Windows lab unavailable" : "Your Windows lab could not start"}</h3><p>{launchNotice?.message || "Try again to reconnect. If the problem continues, contact your administrator and share the details below."}</p>{error && !launchNotice ? <details className="windows-os-error-details"><summary>Error details</summary><p>{error}</p></details> : null}<div className="windows-os-error-actions">{!launchNotice?.dailyLimit ? <button type="button" className="btn-sm" onClick={retry}>Try Again</button> : null}<button type="button" className="btn-sm" onClick={end}>Return to Modules</button></div></div> : null}
      {error && status === "ACTIVE" ? <div className="windows-os-completion-error" role="alert">{error}</div> : null}
      {desktopRevealed && guacamoleUrl && showWalkthrough ? <SimulationWalkthrough type="windows" onDone={() => setShowWalkthrough(false)} /> : null}
    </section>
  </div>;
}
