export default function HardwareScenarioScene({ environmentState, controls, onRunHardwareControl }) {
  return (
    <>
      <div className="step-modal-tools-title">Recovery Scene</div>
      <div className="hardware-scene-wrap is-immersive">
        <div className="hardware-rig">
          <div className="hardware-rig-monitor">
            <div className="hardware-scene-label">Monitor</div>
            <div className={`hardware-rig-screen ${environmentState?.monitorSignal ? "is-ok" : ""}`}>
              {environmentState?.safeModeLaunched
                ? "SAFE MODE"
                : environmentState?.recoveryMenuOpen
                  ? "RECOVERY ENV"
                  : "BSOD / BOOT LOOP"}
            </div>
          </div>
          <div className="hardware-rig-tower">
            <div className="hardware-scene-label">PC Unit</div>
            <div className="hardware-rig-power-btn" />
            <div className="hardware-rig-slots" />
            <div className="hardware-rig-signals">
              <span className={`hardware-scene-pill ${environmentState?.towerPowered ? "is-on" : ""}`}>Power</span>
              <span className={`hardware-scene-pill ${environmentState?.bootInterruptDone ? "is-on" : ""}`}>Boot Interrupt</span>
              <span className={`hardware-scene-pill ${environmentState?.startupSettingsOpen ? "is-on" : ""}`}>Startup Settings</span>
              <span className={`hardware-scene-pill ${environmentState?.safeModeLaunched ? "is-on" : ""}`}>Safe Mode</span>
            </div>
          </div>
          <div className="hardware-rig-outlet">
            <div className="hardware-scene-label">Outlet</div>
            <div className={`hardware-rig-outlet-box ${environmentState?.outletPowered ? "is-ok" : ""}`} />
          </div>
        </div>
        <div className="hardware-scene-desk-line" />
        <div className="module-toolkit">
          <div className="module-toolkit-title">Technician Toolkit</div>
          <div className="module-tool-grid">
            <div className="module-tool">Power Cable</div>
            <div className="module-tool">Display Cable</div>
            <div className="module-tool">RAM Stick</div>
            <div className="module-tool">Multimeter</div>
          </div>
        </div>
      </div>
      <div className="step-modal-tools-title">Step Controls</div>
      <div className="step-modal-actions-grid">
        {controls.map((control) => (
          <button
            key={control.id}
            className={`step-modal-action-btn hd-btn-reset ${control.enabled ? "" : "is-disabled"}`}
            onClick={() => onRunHardwareControl(control)}
            disabled={!control.enabled}
          >
            <span>{control.label}</span>
            <small>{control.output}</small>
          </button>
        ))}
      </div>
    </>
  );
}
