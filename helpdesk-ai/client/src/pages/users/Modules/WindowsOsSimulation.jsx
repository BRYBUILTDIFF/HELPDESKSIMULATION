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

export default function WindowsOsSimulation({ api, moduleId, title, steps = [], completedStepIndexes = [], walkthroughOnOpen = true, onEnded, onSessionReady, onStepProgress }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("IDLE");
  const [guacamoleUrl, setGuacamoleUrl] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(() => new Set(completedStepIndexes));
  const [completing, setCompleting] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(walkthroughOnOpen);
  const startedRef = useRef(false);
  const connectInFlightRef = useRef(false);
  const desktopFrameRef = useRef(null);
  const retryDeadlineRef = useRef(Date.now() + 8 * 60 * 1000);
  const guidedSteps = Array.isArray(steps) ? steps : [];
  const currentStep = guidedSteps[activeStep];
  const currentStepAction = plainText(currentStep?.action || currentStep?.instruction);
  const currentStepDescription = plainText(currentStep?.desc || currentStep?.description);

  const start = useCallback(async () => {
    retryDeadlineRef.current = Date.now() + 8 * 60 * 1000;
    connectInFlightRef.current = false;
    setError(""); setGuacamoleUrl(""); setSession(null); setStatus("PROVISIONING");
    try {
      const response = await api.post("/api/simulation-sessions", { moduleId });
      setSession(response.data); setStatus(response.data?.status || "PROVISIONING");
      onSessionReady?.(response.data);
    } catch (err) {
      setStatus("FAILED"); setError(messageFrom(err, "Unable to prepare your Windows workspace."));
    }
  }, [api, moduleId, onSessionReady]);

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
        setGuacamoleUrl(connectionUrl.href);
        setConnectionAttempt((attempt) => attempt + 1);
        setStatus("CONNECTING");
        onSessionReady?.(response.data);
      })
      .catch((err) => {
        connectInFlightRef.current = false;
        setStatus("FAILED");
        setError(messageFrom(err, "Unable to connect to your Windows workspace."));
      });
  }, [api, guacamoleUrl, onSessionReady, session?.id, status]);

  useEffect(() => {
    if (!guacamoleUrl || !session?.id || !["CONNECTING", "ACTIVE"].includes(status)) return undefined;
    const expectedOrigin = new URL(guacamoleUrl).origin;
    let retryTimer;
    const receiveState = (event) => {
      if (event.source !== desktopFrameRef.current?.contentWindow || event.origin !== expectedOrigin || event.data?.type !== "helpdesk-lab-state") return;
      if (event.data.state === "CONNECTED") {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
        retryDeadlineRef.current = Date.now() + 8 * 60 * 1000;
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
  }, [api, completing, end, guidedSteps.length, moduleId, session?.id]);
  const reconnect = () => {
    retryDeadlineRef.current = Date.now() + 8 * 60 * 1000;
    connectInFlightRef.current = false;
    setError("");
    setGuacamoleUrl("");
    setStatus("READY");
  };
  const retry = () => { if (session?.id) reconnect(); else { startedRef.current = true; start(); } };
  const remainingMinutes = session?.expiresAt ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 60000)) : null;

  return <div className="windows-os-overlay" aria-label="Windows OS simulation">
    <section className="windows-os-shell">
      <header className="windows-os-header"><div><span className="windows-os-kicker">Windows OS Simulation</span><h2>{title}</h2></div><div className="windows-os-controls">{remainingMinutes !== null ? <span>{remainingMinutes} min remaining</span> : null}<button type="button" className="windows-os-end-btn btn-sm" onClick={end}>End Simulation</button><button type="button" className="windows-os-complete-btn btn-sm" onClick={complete} disabled={!session?.id || completing} title={!session?.id ? "A live workspace is required to record completion" : "Complete simulation"}>✓ <span>{completing ? "Completing..." : "Complete Simulation"}</span></button></div></header>
      {["IDLE", "PROVISIONING", "READY", "TERMINATING"].includes(status) ? <div className="windows-os-status"><div className="windows-os-spinner" aria-hidden="true" /><h3>{status === "TERMINATING" ? "Ending your Windows Server 2025 workspace..." : "Preparing your Windows Server 2025 workspace..."}</h3><p>Your private simulation environment is being prepared. This usually takes a few minutes.</p></div> : null}
      {["CONNECTING", "ACTIVE"].includes(status) && guacamoleUrl ? <div className="windows-os-workspace">
        <aside className="windows-os-guide" aria-label="Simulation steps">
          <div className="windows-os-guide-heading"><span>Simulation Steps</span><small>{guidedSteps.length ? `${activeStep + 1} of ${guidedSteps.length}` : "No steps"}</small></div>
          {guidedSteps.length ? <div className="windows-os-step-list">
            {guidedSteps.map((step, index) => <button type="button" key={`${step?.id || step?.title || "step"}-${index}`} className={`windows-os-step${index === activeStep ? " is-active" : ""}${completedSteps.has(index) ? " is-complete" : ""}`} onClick={() => setActiveStep(index)}>
              <span className="windows-os-step-number">{completedSteps.has(index) ? "✓" : index + 1}</span>
              <span><strong>{step?.title || `Step ${index + 1}`}</strong><small>{plainText(step?.action || step?.instruction || step?.desc || step?.description) || "Follow the task instructions."}</small></span>
            </button>)}
          </div> : <p className="windows-os-no-steps">This module does not include guided steps yet.</p>}
          <div className="windows-os-help-card"><strong>◌&nbsp; Need Help?</strong><span>Follow each step carefully. You can navigate back and forth between steps at any time.</span></div>
        </aside>
        <section className="windows-os-desktop">
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
          <iframe ref={desktopFrameRef} key={`${session.id}-${connectionAttempt}`} className="windows-os-frame" title="Windows Server 2025 Help Desk Lab" src={guacamoleUrl} allow="clipboard-read; clipboard-write; fullscreen" referrerPolicy="no-referrer" />
        </section>
      </div> : null}
      {["CONNECTING", "ACTIVE"].includes(status) && guacamoleUrl ? <footer className="windows-os-footer">
        <button type="button" className="windows-os-nav-btn btn-sm" disabled={!currentStep || activeStep === 0} onClick={() => setActiveStep((step) => step - 1)}>← <span>Previous Step</span></button>
        <div className="windows-os-footer-progress"><span>{completedSteps.size} of {guidedSteps.length} complete</span><div className="windows-os-progress-line">{guidedSteps.map((_, index) => <i key={index} className={completedSteps.has(index) ? "done" : index === activeStep ? "active" : ""} />)}</div></div>
        <button type="button" className="windows-os-nav-btn is-next btn-sm" disabled={!currentStep || activeStep === guidedSteps.length - 1} onClick={() => setActiveStep((step) => step + 1)}><span>Next Step</span> →</button>
      </footer> : null}
      {status === "FAILED" ? <div className="windows-os-status is-error" role="alert"><h3>We could not start the live Windows lab</h3><p>{error || "The Windows workspace failed to start. Please try again."}</p><div className="windows-os-error-actions"><button type="button" className="btn-sm" onClick={retry}>Try Again</button><button type="button" className="btn-sm" onClick={onEnded}>Return to Modules</button></div></div> : null}
      {error && status === "ACTIVE" ? <div className="windows-os-completion-error" role="alert">{error}</div> : null}
      {status === "ACTIVE" && guacamoleUrl && showWalkthrough ? <SimulationWalkthrough type="windows" onDone={() => setShowWalkthrough(false)} /> : null}
    </section>
  </div>;
}
