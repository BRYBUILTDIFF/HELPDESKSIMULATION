import TerminalStepGuide from '../users/Modules/TerminalStepGuide';
import AdminDraftWalkthrough from './AdminDraftWalkthrough';
import DraftStepList from './DraftStepList';
import {useEffect, useRef, useState} from 'react';
import {useAxios} from '../../hooks/useAxios';
import TerminalEmulator from '../users/Modules/TerminalEmulator';
export default function TerminalModuleTester({definition,onSave,existing,onChange,saveStatus,initialTest}) {
 const api=useAxios();const [draft,setDraft]=useState(definition);const [catalog,setCatalog]=useState({});
 const [selected,setSelected]=useState(0);const [reorderNotice,setReorderNotice]=useState('');const [revision,setRevision]=useState(0);
 const [run,setRun]=useState(initialTest || null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const actions=useRef([]);const pending=useRef(false);
 useEffect(()=>{api.get('/api/admin/simulation-modules/actions').then(r=>setCatalog(r.data.actions)).catch(()=>setError('Could not load supported actions.'));},[api]);
 const edit=(i,id)=>{const action=catalog[id];changeDraft({...draft,steps:draft.steps.map((step,index)=>index===i?{...step,actionId:id,type:action.type,expectedCommands:action.command?[action.command]:[],command:action.command||'',expectedOutput:'',action:action.command||'Use the checkpoint button.'}:step)});};
 const test=async(command,kind='command')=>{
  if(pending.current)return {output:'Please wait for verification.'};pending.current=true;setBusy(true);setError('');
  const nextActions=command===undefined?[]:[...actions.current,{command,kind,step:run?.nextStep||0}];
  try{const {data}=await api.post('/api/admin/simulation-modules/test',{simulation:draft,actions:nextActions});actions.current=nextActions;setRun(data);setSelected(Math.min(data.nextStep,data.definition.steps.length-1));if(command===undefined)setRevision(v=>v+1);return {output:data.output};}
  catch(e){const message=e.response?.data?.message||'Test could not run.';setError(message);return {output:message};}finally{pending.current=false;setBusy(false);}
 };
 const changeDraft = (next) => {setDraft(next);onChange?.(next);setSelected(i=>Math.max(0,Math.min(i,next.steps.length-1))); actions.current=[];setRun(null);setRevision(v=>v+1);setError('');};
 const moveStep=(from,to)=>{
  if(busy || from===to || from<0 || to<0 || from>=draft.steps.length || to>=draft.steps.length)return;
  const steps=[...draft.steps];
  const [moved]=steps.splice(from,1);steps.splice(to,0,moved);
  const nextSelected=selected===from?to:from<selected && to>=selected?selected-1:from>selected && to<=selected?selected+1:selected;
  changeDraft({...draft,steps});setSelected(nextSelected);
  setReorderNotice((moved.title || 'Step')+' moved to step '+(to+1)+'. Verification reset.');
 };
 const current=run ? run.definition?.steps?.[run.nextStep] : draft.steps[0];
 return <><section className="terminal-module-tester draft-content-editor">
  <AdminDraftWalkthrough terminal notice={reorderNotice} />
  <div className="sim-runtime-body draft-workspace-body"><DraftStepList steps={draft.steps} selected={selected} busy={busy} verified={run?.nextStep || 0} onSelect={setSelected} onMove={moveStep}
 onAdd={after=>{const steps=[...draft.steps];steps.splice(after+1,0,{title:'New step',desc:'',type:'command',actionId:'system.identity',expectedCommands:['whoami'],command:'whoami',action:'whoami',screen:'',result:''});changeDraft({...draft,steps});setSelected(after+1);setReorderNotice('Step added at position '+(after+2)+'.');}}
 onRemove={index=>{changeDraft({...draft,steps:draft.steps.filter((_,i)=>i!==index)});setSelected(selected>index?selected-1:Math.min(selected,draft.steps.length-2));setReorderNotice('Step '+(index+1)+' deleted.');}} /><section className="sim-runtime-canvas"><header className="draft-content-heading"><h3>Step content</h3><span>Step {selected+1} of {draft.steps.length}</span></header><div className="sim-runtime-current">
  <div className="terminal-step-editor"><ol>{draft.steps.map((step,i)=>i===Math.min(selected,draft.steps.length-1)?<li key={i}><label className="draft-title-field draft-full-field">Step title<input name="terminal-module-tester-step-title" value={step.title} disabled={busy} onChange={e=>changeDraft({...draft,steps:draft.steps.map((s,j)=>j===i?{...s,title:e.target.value}:s)})} /></label><label className="draft-full-field">Instruction<textarea name="terminal-module-tester-step-instruction" value={step.instruction ?? step.desc ?? ''} disabled={busy} onChange={e=>changeDraft({...draft,steps:draft.steps.map((s,j)=>j===i?{...s,desc:e.target.value,instruction:e.target.value}:s)})} /></label><label>Supported action<select name="terminal-module-tester-step-action-id" aria-label={'Action for step '+(i+1)} value={step.actionId||''} disabled={busy} onChange={e=>edit(i,e.target.value)}><option value="" disabled>Choose an executable action</option>{Object.entries(catalog).filter(([,a])=>a.surface==='any'||a.surface===draft.surface).map(([id,a])=><option key={id} value={id}>{id} ({a.type})</option>)}</select></label><label className="draft-code-field">Command<textarea name="terminal-module-tester-step-command" value={step.command ?? step.expectedCommands?.[0] ?? ''} disabled={busy || step.type==='checkpoint'} onChange={e=>changeDraft({...draft,steps:draft.steps.map((s,j)=>j===i?{...s,command:e.target.value,expectedCommands:e.target.value.trim()?[e.target.value]:[]}:s)})} /></label><label className="draft-code-field draft-full-field">Expected output<textarea name="terminal-module-tester-step-expected-output" value={step.expectedOutput ?? ''} placeholder="Leave blank to generate from the simulated state" disabled={busy} onChange={e=>changeDraft({...draft,steps:draft.steps.map((s,j)=>j===i?{...s,expectedOutput:e.target.value}:s)})} /></label></li>:null)}</ol></div> </div>

  <section className="draft-test-workspace" aria-label="Test terminal module"><header className="draft-content-heading"><h3>Test the module</h3><button className="btn-sm" type="button" disabled={busy} onClick={()=>test(undefined)}>Validate and restart test</button></header>
  {error?<p role="alert">{error}</p>:null}
  <p role="status">{run ? 'Verified: '+run.nextStep+' / '+run.definition.steps.length+'. Mistakes: '+run.mistakes : 'Ready to test. Editing resets verification.'} {current ? 'Test step: '+current.title : ''}</p>
  {current ? <div className="draft-test-step-preview"><h4>Test step {(run?.nextStep || 0)+1}: {current.title}</h4><TerminalStepGuide iconOnly key={revision+'-'+(run?.nextStep || 0)} step={current} /></div> : run?.testToken ? <p role="status">All steps passed. Save the tested draft using the footer below.</p> : null}
  {current?.type==='checkpoint'?<button className="btn-sm" type="button" disabled={busy} onClick={()=>test('', 'checkpoint')}>Perform simulated checkpoint</button>:null}
  <TerminalEmulator key={revision} platform={draft.surface} initialPath={draft.surface === 'mac-terminal' ? '/Users/student' : 'C:\\Users\\student'} className="admin-verified-terminal" initialMessage="Training terminal. Type help for the required action." executeCommand={command=>test(command)} />
  </section></section></div></section><footer className="sim-preview-footer draft-editor-footer"><span role="status">{saveStatus}</span>
  <button className="btn-sm draft-save-module" type="button" disabled={busy||!run?.testToken} onClick={async()=>{setBusy(true);try{await onSave(run.definition,run.testToken);}catch(e){setError(e.response?.data?.message||'Unable to save module.');}finally{setBusy(false);}}}>{existing?'Publish tested module':'Save tested module'}</button>
 </footer></>;
}
