import { useCallback, useEffect, useRef, useState } from "react";
import SimulationWalkthrough from "./SimulationWalkthrough";

function messageFrom(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function plainText(value) {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

export default function WindowsOsSimulation({ api, moduleId, title, steps = [], completedStepIndexes = [], onEnded, onSessionReady, onStepProgress }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("IDLE");
  const [guacamoleUrl, setGuacamoleUrl] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(() => new Set(completedStepIndexes));
  const [completing, setCompleting] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(true);
  const startedRef = useRef(false);
  const connectInFlightRef = useRef(false);
  const guidedSteps = Array.isArray(steps) ? steps : [];
  const currentStep = guidedSteps[activeStep];
  const currentStepAction = plainText(currentStep?.action || currentStep?.instruction);
  const currentStepDescription = plainText(currentStep?.desc || currentStep?.description);

  const start = useCallback(async () => {
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
    if (!session?.id || !["PROVISIONING", "READY"].includes(status)) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(`/api/simulation-sessions/${session.id}`);
        if (!cancelled) { setSession(response.data); setStatus(response.data.status); onSessionReady?.(response.data); }
      } catch (err) {
        if (!cancelled) { setStatus("FAILED"); setError(messageFrom(err, "Unable to connect to your Windows workspace.")); }
      }
    }, 4000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, onSessionReady, session?.id, status]);

  useEffect(() => {
    if (!session?.id || guacamoleUrl || !["READY", "ACTIVE"].includes(status) || connectInFlightRef.current) return;
    connectInFlightRef.current = true;
    api.post(`/api/simulation-sessions/${session.id}/connect`)
      .then((response) => {
        setSession(response.data);
        setGuacamoleUrl(response.data.guacamoleUrl || "");
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
    if (session?.id) { try { await api.post(`/api/simulation-sessions/${session.id}/end`); } catch (_err) {} }
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
  const retry = () => { startedRef.current = true; start(); };
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
          <iframe key={`${session.id}-${connectionAttempt}`} className="windows-os-frame" title="Windows Server 2025 Help Desk Lab" src={guacamoleUrl} onLoad={() => setStatus("ACTIVE")} allow="clipboard-read; clipboard-write; fullscreen" referrerPolicy="no-referrer" />
        </section>
      </div> : null}
      {["CONNECTING", "ACTIVE"].includes(status) && guacamoleUrl ? <footer className="windows-os-footer">
        <button type="button" className="windows-os-nav-btn btn-sm" disabled={!currentStep || activeStep === 0} onClick={() => setActiveStep((step) => step - 1)}>← <span>Previous Step</span></button>
        <div className="windows-os-footer-progress"><span>{completedSteps.size} of {guidedSteps.length} complete</span><div className="windows-os-progress-line">{guidedSteps.map((_, index) => <i key={index} className={completedSteps.has(index) ? "done" : index === activeStep ? "active" : ""} />)}</div></div>
        <button type="button" className="windows-os-nav-btn is-next btn-sm" disabled={!currentStep || activeStep === guidedSteps.length - 1} onClick={() => setActiveStep((step) => step + 1)}><span>Next Step</span> →</button>
      </footer> : null}
      {status === "FAILED" ? <div className="windows-os-status is-error"><h3>We could not start the live Windows lab</h3><p>Please try starting the Windows workspace again.</p><div className="windows-os-error-actions"><button type="button" className="btn-sm" onClick={retry}>Try Again</button><button type="button" className="btn-sm" onClick={onEnded}>Return to Modules</button></div></div> : null}
      {error && status === "ACTIVE" ? <div className="windows-os-completion-error" role="alert">{error}</div> : null}
      {["CONNECTING", "ACTIVE"].includes(status) && guacamoleUrl && showWalkthrough ? <SimulationWalkthrough type="windows" onDone={() => setShowWalkthrough(false)} /> : null}
    </section>
  </div>;
}
