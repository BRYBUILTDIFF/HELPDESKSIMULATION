export default function StatusScenarioScene({ scenarioType, environmentState }) {
  const network = scenarioType === "network";
  const email = scenarioType === "email";
  const printer = scenarioType === "printer";

  return (
    <>
      <div className="step-modal-tools-title">Scenario Scene</div>
      <div className="module-scene-wrap">
        {network ? (
          <div className="module-scene-grid">
            <div className="module-device module-router">
              <div className="module-device-label">Router</div>
              <div className="module-status-row">
                <span className={`module-led ${environmentState?.gatewayReachable ? "is-ok" : "is-pending"}`} />
                <span>{environmentState?.gatewayReachable ? "Gateway Reachable" : "Gateway Pending"}</span>
              </div>
            </div>
            <div className="module-device module-laptop">
              <div className="module-device-label">Workstation</div>
              <div className={`module-screen ${environmentState?.adapterOnline ? "is-ok" : "is-pending"}`}>
                {environmentState?.adapterOnline ? "LINK UP" : "NO LINK"}
              </div>
            </div>
            <div className="module-device module-dns">
              <div className="module-device-label">DNS Resolver</div>
              <div className="module-status-row">
                <span className={`module-led ${environmentState?.dnsHealthy ? "is-ok" : "is-pending"}`} />
                <span>{environmentState?.dnsHealthy ? "Healthy" : "Degraded"}</span>
              </div>
            </div>
          </div>
        ) : null}

        {email ? (
          <div className="module-scene-grid">
            <div className="module-device module-mailbox">
              <div className="module-device-label">Mailbox Server</div>
              <div className="module-status-row">
                <span className={`module-led ${environmentState?.mailboxReachable ? "is-ok" : "is-pending"}`} />
                <span>{environmentState?.mailboxReachable ? "Reachable" : "Pending"}</span>
              </div>
            </div>
            <div className="module-device module-outlook">
              <div className="module-device-label">Outlook Client</div>
              <div className={`module-screen ${environmentState?.outlookConnected ? "is-ok" : "is-pending"}`}>
                {environmentState?.outlookConnected ? "SYNCED" : "DISCONNECTED"}
              </div>
            </div>
            <div className="module-device module-profile">
              <div className="module-device-label">Profile Health</div>
              <div className="module-status-row">
                <span className={`module-led ${environmentState?.profileHealthy ? "is-ok" : "is-pending"}`} />
                <span>{environmentState?.profileHealthy ? "Healthy" : "Needs Repair"}</span>
              </div>
            </div>
          </div>
        ) : null}

        {printer ? (
          <div className="module-scene-grid">
            <div className="module-device module-printer-device">
              <div className="module-device-label">Printer</div>
              <div className={`module-screen ${environmentState?.printerOnline ? "is-ok" : "is-pending"}`}>
                {environmentState?.printerOnline ? "ONLINE" : "OFFLINE"}
              </div>
            </div>
            <div className="module-device module-queue">
              <div className="module-device-label">Print Queue</div>
              <div className="module-status-row">
                <span className={`module-led ${environmentState?.queueClean ? "is-ok" : "is-pending"}`} />
                <span>{environmentState?.queueClean ? "Clear" : "Blocked"}</span>
              </div>
            </div>
            <div className="module-device module-spooler">
              <div className="module-device-label">Spooler Service</div>
              <div className="module-status-row">
                <span className={`module-led ${environmentState?.spoolerRunning ? "is-ok" : "is-pending"}`} />
                <span>{environmentState?.spoolerRunning ? "Running" : "Stopped"}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="module-toolkit">
          <div className="module-toolkit-title">Technician Toolkit</div>
          <div className="module-tool-grid">
            <div className="module-tool">Diagnostics</div>
            <div className="module-tool">Service Reset</div>
            <div className="module-tool">Connectivity Test</div>
            <div className="module-tool">Escalation Draft</div>
          </div>
        </div>
      </div>
    </>
  );
}
