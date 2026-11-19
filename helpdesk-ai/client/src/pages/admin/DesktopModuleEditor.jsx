import AdminDraftWalkthrough from './AdminDraftWalkthrough';
import DraftStepList from './DraftStepList';
import { useState } from 'react';

export default function DesktopModuleEditor({ definition, onChange, busy }) {
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState('');
  const steps = definition.steps || [];
  const index = Math.max(0, Math.min(selected, steps.length - 1));
  const step = steps[index];
  const update = (patch) => onChange({ ...definition, steps: steps.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const move = (from, to) => {
    if (busy || from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return;
    const next = [...steps];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ ...definition, steps: next });
    setSelected(index === from ? to : from < index && to >= index ? index - 1 : from > index && to <= index ? index + 1 : index);
    setNotice(`${item.title || 'Step'} moved to step ${to + 1}.`);
  };
  return <section className="desktop-module-editor draft-content-editor">
    <AdminDraftWalkthrough notice={notice} />
    <div className="sim-runtime-body draft-workspace-body">
      <DraftStepList steps={steps} selected={index} busy={busy} minimum={3} onSelect={setSelected} onMove={move}
        onAdd={after=>{const next=[...steps];next.splice(after+1,0,{title:'New step',desc:'',instruction:'',action:'',screen:'',result:''});onChange({...definition,steps:next});setSelected(after+1);setNotice('Step added at position '+(after+2)+'.');}}
        onRemove={removed=>{onChange({...definition,steps:steps.filter((_,i)=>i!==removed)});setSelected(index>removed?index-1:Math.min(index,steps.length-2));setNotice('Step '+(removed+1)+' deleted.');}} />
      <section className="sim-runtime-canvas">
        <header className="draft-content-heading"><h3>Step content</h3><span>Step {index+1} of {steps.length}</span></header>
        {step ? <div className="sim-runtime-current terminal-step-editor"><ol><li>
          <label className="draft-title-field draft-full-field">Step title<input name="desktop-module-editor-step-title" value={step.title || ''} disabled={busy} onChange={event => update({ title: event.target.value })} /></label>
          <label className="draft-full-field">Instruction<textarea name="desktop-module-editor-step-instruction" value={step.instruction ?? step.action ?? ''} disabled={busy} onChange={event => update({ instruction: event.target.value, action: event.target.value })} /></label>
          <label className="draft-full-field">Description<textarea name="desktop-module-editor-step-desc" value={step.desc ?? step.description ?? ''} disabled={busy} onChange={event => update({ desc: event.target.value, description: event.target.value })} /></label>
          <label>Scenario / screen<textarea name="desktop-module-editor-step-screen" value={step.screen || ''} disabled={busy} onChange={event => update({ screen: event.target.value })} /></label>
          <label>Expected result<textarea name="desktop-module-editor-step-result" value={step.result || ''} disabled={busy} onChange={event => update({ result: event.target.value })} /></label>

        </li></ol></div> : null}
      </section>
    </div>
  </section>;
}
