import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function SimulationWalkthrough({ type = "terminal", onDone }) {
  const [step, setStep] = useState(0);
  const windows = type === "windows";
  const dashboardTerminal = type === "dashboard-terminal";
  const items = useMemo(() => windows
    ? [
        [".windows-os-guide", "Simulation steps", "Follow the highlighted list on the left. The active step is marked in blue."],
        [".windows-os-instruction", "Current instructions", "Read this instruction before performing the task in the Windows workspace."],
        [".windows-os-frame", "Windows workspace", "Complete the hands-on task inside the remote Windows desktop."],
        [".windows-os-footer", "Previous and Next", "Use these controls to move through the guide and review a previous step."],
        [".windows-os-controls", "Complete or end", "Complete the simulation when finished, or end it to leave without completing it."]
      ]
    : dashboardTerminal ? [
        [".step-modal-left", "Simulation steps", "This list is your roadmap. Follow the highlighted step and its required command."],
        [".step-modal-current", "Current step", "Read the instruction here before using the terminal."],
        [".terminal-shell", "Terminal workspace", "Use the terminal to perform the task. The terminal will become interactive after this walkthrough."],
        [".step-modal-footer", "Previous and Next", "Use these controls to move through the simulation steps."],
        [".terminal-simulation-header-actions", "Complete or end", "End the simulation when leaving, or complete it after finishing the required steps."]
      ] : [
        [".sim-runtime-steps", "Simulation steps", "This list is your roadmap. Select a step to read its task."],
        [".sim-runtime-current", "Current step", "Read the highlighted instruction and follow it in the simulation canvas."],
        [".sim-runtime-terminal", "Simulation terminal", "Practice the support commands here. Type help to see available commands."],
        [".sim-runtime-footer", "Move through the guide", "Use the step controls to go Previous or Next as you work."],
        [".sim-preview-topbar-right", "Finish the simulation", "When you reach the final step, close the simulation from the top-right corner."]
      ], [windows]);
  const [target, setTarget] = useState(null);
  useEffect(() => {
    const update = () => {
      const element = document.querySelector(items[step][0]);
      if (element) setTarget(element.getBoundingClientRect());
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [items, step]);
  const last = step === items.length - 1;
  const walkthrough = <div className="simulation-walkthrough" role="dialog" aria-modal="true" aria-label="Simulation walkthrough">
    <div className="simulation-walkthrough-backdrop" />
    {target ? <div className="simulation-walkthrough-spotlight" style={{ top: target.top - 8, left: target.left - 8, width: target.width + 16, height: target.height + 16 }} /> : null}
    <div className="simulation-walkthrough-callout" style={target ? { top: Math.min(window.innerHeight - 190, Math.max(18, target.bottom + 18)), left: Math.max(18, Math.min(window.innerWidth - 388, target.left)) } : undefined}>
      <div className="simulation-walkthrough-kicker">Guide · {step + 1} of {items.length}</div>
      <h2>{items[step][1]}</h2>
      <p>{items[step][2]}</p>
      <div className="simulation-walkthrough-progress">{items.map((_, index) => <i key={index} className={index <= step ? "active" : ""} />)}</div>
      <div className="simulation-walkthrough-actions">
        <button type="button" className="btn-sm simulation-walkthrough-skip" onClick={() => onDone?.()}>Skip all</button>
        <button type="button" className="btn-sm" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>← Previous</button>
        <button type="button" className="btn-sm is-primary" onClick={() => last ? onDone?.() : setStep((current) => current + 1)}>{last ? "Start Simulation" : "Next →"}</button>
      </div>
    </div>
  </div>;
  return typeof document !== "undefined" ? createPortal(walkthrough, document.body) : walkthrough;
}
