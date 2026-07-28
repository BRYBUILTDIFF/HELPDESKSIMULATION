import { useCallback, useEffect, useRef, useState } from "react";

function messageFrom(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function plainText(value) {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

export default function WindowsOsSimulation({ api, moduleId, title, steps = [], onEnded }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("IDLE");
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const startedRef = useRef(false);
  const guidedSteps = Array.isArray(steps) ? steps : [];
  const currentStep = guidedSteps[activeStep];

  const start = useCallback(async () => {
    setError(""); setStatus("PROVISIONING");
    try {
      const response = await api.post("/api/simulation-sessions", { moduleId });
      setSession(response.data); setStatus(response.data?.status || "PROVISIONING");
    } catch (err) {
      setStatus("FAILED"); setError(messageFrom(err, "Unable to prepare your Windows workspace."));
    }
  }, [api, moduleId]);

  useEffect(() => { if (!startedRef.current) { startedRef.current = true; start(); } }, [start]);
  useEffect(() => {
    if (!session?.id || !["PROVISIONING", "READY"].includes(status)) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(`/api/simulation-sessions/${session.id}`);
        if (!cancelled) { setSession(response.data); setStatus(response.data.status); }
      } catch (err) {
        if (!cancelled) { setStatus("FAILED"); setError(messageFrom(err, "Unable to connect to your Windows workspace.")); }
      }
    }, 4000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, session?.id, status]);

  useEffect(() => {
    setActiveStep((current) => Math.min(current, Math.max(guidedSteps.length - 1, 0)));
  }, [guidedSteps.length]);

  const end = useCallback(async () => {
    if (session?.id) { setStatus("TERMINATING"); try { await api.post(`/api/simulation-sessions/${session.id}/end`); } catch (_err) {} }
    onEnded?.();
  }, [api, onEnded, session?.id]);
  const retry = () => { startedRef.current = true; setSession(null); start(); };
  const remainingMinutes = session?.expiresAt ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 60000)) : null;

  return <div className="windows-os-overlay" role="dialog" aria-modal="true" aria-label="Windows OS simulation">
    <section className="windows-os-shell">
      <header className="windows-os-header"><div><span className="windows-os-kicker">Windows OS Simulation</span><h2>{title}</h2></div><div className="windows-os-controls">{remainingMinutes !== null ? <span>{remainingMinutes} min remaining</span> : null}<button type="button" className="btn-sm danger" onClick={end}>End Simulation</button></div></header>
      {["IDLE", "PROVISIONING", "READY", "TERMINATING"].includes(status) ? <div className="windows-os-status"><div className="windows-os-spinner" aria-hidden="true" /><h3>{status === "TERMINATING" ? "Ending your Windows workspace..." : "Preparing your Windows workspace..."}</h3><p>Your private simulation environment is being prepared. This usually takes a few minutes.</p></div> : null}
      {status === "ACTIVE" && session?.guacamoleUrl ? <div className="windows-os-workspace">
        <aside className="windows-os-guide" aria-label="Simulation steps">
          <div className="windows-os-guide-heading"><span>Simulation Steps</span><small>{guidedSteps.length ? `${activeStep + 1} of ${guidedSteps.length}` : "No steps"}</small></div>
          {guidedSteps.length ? <div className="windows-os-step-list">
            {guidedSteps.map((step, index) => <button type="button" key={`${step?.id || step?.title || "step"}-${index}`} className={`windows-os-step${index === activeStep ? " is-active" : ""}`} onClick={() => setActiveStep(index)}>
              <span className="windows-os-step-number">{index + 1}</span>
              <span><strong>{step?.title || `Step ${index + 1}`}</strong><small>{plainText(step?.instruction || step?.action || step?.description) || "Follow the task instructions."}</small></span>
            </button>)}
          </div> : <p className="windows-os-no-steps">This module does not include guided steps yet.</p>}
          {currentStep ? <div className="windows-os-guide-actions"><button type="button" className="btn-sm" disabled={activeStep === 0} onClick={() => setActiveStep((step) => step - 1)}>Previous</button><button type="button" className="btn-sm" disabled={activeStep === guidedSteps.length - 1} onClick={() => setActiveStep((step) => step + 1)}>Next Step</button></div> : null}
        </aside>
        <section className="windows-os-desktop">
          {currentStep ? <div className="windows-os-instruction"><span>Current Step</span><h3>{currentStep.title || `Step ${activeStep + 1}`}</h3><p>{plainText(currentStep.instruction || currentStep.action || currentStep.description) || "Complete this task in the Windows workspace."}</p></div> : null}
          <iframe className="windows-os-frame" title="Windows Help Desk Lab" src={session.guacamoleUrl} allow="clipboard-read; clipboard-write; fullscreen" referrerPolicy="no-referrer" />
        </section>
      </div> : null}
      {status === "FAILED" ? <div className="windows-os-status is-error"><h3>Windows workspace unavailable</h3><p>{error || "The workspace could not be started."}</p><div className="windows-os-error-actions"><button type="button" className="btn-sm" onClick={retry}>Try Again</button><button type="button" className="btn-sm" onClick={onEnded}>Return to Modules</button></div></div> : null}
    </section>
  </div>;
}
