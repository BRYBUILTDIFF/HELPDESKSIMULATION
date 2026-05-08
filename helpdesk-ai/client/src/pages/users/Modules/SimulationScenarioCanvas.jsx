import HardwareScenarioScene from "./HardwareScenarioScene";
import StatusScenarioScene from "./StatusScenarioScene";
import { buildSimulationEnvironment } from "./simulationEnvironment";

function renderActionButtons(actions, onRunAction) {
  return (
    <>
      <div className="step-modal-tools-title">Dedicated Tools</div>
      <div className="step-modal-actions-grid">
        {actions.map((action) => (
          <button key={action.label} className="step-modal-action-btn hd-btn-reset" onClick={() => onRunAction(action)}>
            <span>{action.label}</span>
            <small>{action.output}</small>
          </button>
        ))}
      </div>
    </>
  );
}

export default function SimulationScenarioCanvas({
  scenarioType,
  currentStepText,
  canvasState,
  stepIndex,
  actions,
  hardwareControls,
  onRunAction,
  onRunHardwareControl
}) {
  const environment = buildSimulationEnvironment(scenarioType, currentStepText, canvasState, stepIndex);
  const normalizedScenario = scenarioType || "general";

  return (
    <>
      <div className="step-modal-env-name">{environment.title}</div>
      <div className="step-modal-env-metrics">
        {environment.metrics.map((metric) => (
          <div key={metric.label} className="step-modal-env-metric">
            <div className="step-modal-env-metric-label">{metric.label}</div>
            <div className="step-modal-env-metric-value">{metric.value}</div>
          </div>
        ))}
      </div>
      <div className="step-modal-env-output">
        <span>Latest Output</span>
        <p>{environment.latestOutput}</p>
      </div>

      {normalizedScenario === "hardware" ? (
        <HardwareScenarioScene
          environmentState={canvasState?.environmentState}
          controls={hardwareControls}
          onRunHardwareControl={onRunHardwareControl}
        />
      ) : null}

      {normalizedScenario === "network" || normalizedScenario === "email" || normalizedScenario === "printer" ? (
        <StatusScenarioScene scenarioType={normalizedScenario} environmentState={canvasState?.environmentState} />
      ) : null}

      {normalizedScenario === "hardware" ? null : renderActionButtons(actions, onRunAction)}
    </>
  );
}

export {
  applyActionToEnvironment,
  applyHardwareControlToEnvironment,
  createEnvironmentStateForScenario,
  getHardwareSceneControls,
  normalizeEnvironmentStateForScenario
} from "./simulationEnvironment";
