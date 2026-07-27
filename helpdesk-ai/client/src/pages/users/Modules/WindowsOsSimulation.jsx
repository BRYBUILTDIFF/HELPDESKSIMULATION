import { useCallback, useEffect, useRef, useState } from "react";

function messageFrom(error, fallback) {
  return error?.response?.data?.message || fallback;
}

export default function WindowsOsSimulation({ api, moduleId, title, onEnded }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("IDLE");
  const [error, setError] = useState("");
  const startedRef = useRef(false);

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
      {status === "ACTIVE" && session?.guacamoleUrl ? <iframe className="windows-os-frame" title="Windows Help Desk Lab" src={session.guacamoleUrl} allow="clipboard-read; clipboard-write; fullscreen" referrerPolicy="no-referrer" /> : null}
      {status === "FAILED" ? <div className="windows-os-status is-error"><h3>Windows workspace unavailable</h3><p>{error || "The workspace could not be started."}</p><div className="windows-os-error-actions"><button type="button" className="btn-sm" onClick={retry}>Try Again</button><button type="button" className="btn-sm" onClick={onEnded}>Return to Modules</button></div></div> : null}
    </section>
  </div>;
}
