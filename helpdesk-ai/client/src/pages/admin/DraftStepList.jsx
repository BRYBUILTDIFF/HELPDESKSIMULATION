import { useState } from 'react';

export default function DraftStepList({ steps, selected, busy, minimum = 1, verified = 0, onSelect, onMove, onAdd, onRemove }) {
  const [dragged, setDragged] = useState(null);
  const [target, setTarget] = useState(null);
  return <aside className="sim-runtime-steps">
    <h3>Simulation Steps</h3>
    <p className="draft-reorder-help">Drag to reorder. Alt + Up or Down moves a focused step.</p>
    <div className="sim-runtime-step-list">{steps.map((step, index) => <div className="draft-step-entry" key={index}>
      <div className={`draft-step-row ${target === index && dragged !== index ? 'is-drop-target' : ''}`}
        onDragOver={event => { if (dragged === null || busy) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setTarget(index); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setTarget(null); }}
        onDrop={event => { event.preventDefault(); if (dragged !== null) onMove(dragged, index); setDragged(null); setTarget(null); }}>
        <button type="button" disabled={busy} draggable={!busy} aria-current={selected === index ? 'step' : undefined}
          className={`sim-runtime-step ${selected === index ? 'active' : ''} ${dragged === index ? 'is-dragging' : ''}`}
          onClick={() => onSelect(index)}
          onDragStart={event => { setDragged(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
          onDragEnd={() => { setDragged(null); setTarget(null); }}
          onKeyDown={event => {
            if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const to = index + (event.key === 'ArrowUp' ? -1 : 1);
            if (to < 0 || to >= steps.length) return;
            const list = event.currentTarget.closest('.sim-runtime-step-list');
            onMove(index, to);
            requestAnimationFrame(() => list.querySelectorAll('.sim-runtime-step')[to]?.focus());
          }}>
          <span className="sim-runtime-step-num">{index + 1}</span>
          <span className="sim-runtime-step-copy"><span className="sim-runtime-step-title">{step.title || 'Untitled step'}</span><span className="sim-runtime-step-sub">{index < verified ? 'Verified' : step.command || step.action || step.instruction}</span></span>
        </button>
        <button className="draft-step-delete" type="button" disabled={busy || steps.length <= minimum} onClick={() => onRemove(index)} aria-label={`Delete step ${index + 1}: ${step.title || 'Untitled step'}`} title={steps.length <= minimum ? `Keep at least ${minimum} step${minimum === 1 ? '' : 's'}` : `Delete step ${index + 1}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
        </button>
      </div>

    </div>)}</div>
    <div className="draft-step-count">
      <button className="draft-step-insert" type="button" disabled={busy || steps.length >= 12} onClick={() => onAdd(steps.length - 1)} aria-label="Add step at the end">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add step
      </button>
      <span>{steps.length} / 12 steps</span>
    </div>
  </aside>;
}
