import {useEffect, useRef, useState} from 'react';
import {useAxios} from '../../hooks/useAxios';
import TerminalStepGuide from "../users/Modules/TerminalStepGuide";
import TerminalEmulator from '../users/Modules/TerminalEmulator';
export default function TerminalModuleTester({definition,onSave,existing}) {
 const api=useAxios();const [draft,setDraft]=useState(definition);const [catalog,setCatalog]=useState({});
 const [run,setRun]=useState(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const actions=useRef([]);
 useEffect(()=>{api.get('/api/admin/simulation-modules/actions').then(r=>setCatalog(r.data.actions)).catch(()=>setError('Could not load supported actions.'));},[api]);
 const edit=(i,id)=>{const action=catalog[id];setDraft(prev=>({...prev,steps:prev.steps.map((s,index)=>index===i?{...s,actionId:id,type:action.type,expectedCommands:action.command?[action.command]:[],command:action.command,expectedOutput:'',action:action.command||'Use the checkpoint button.'}:s)}));actions.current=[];setRun(null);setError('');};
 const test=async(command,kind='command')=>{
  if(busy)return {output:'Please wait for verification.'};setBusy(true);setError('');
  const nextActions=command===undefined?[]:[...actions.current,{command,kind,step:run?.nextStep||0}];
  try{const {data}=await api.post('/api/admin/simulation-modules/test',{simulation:draft,actions:nextActions});actions.current=nextActions;setRun(data);return {output:data.output};}
  catch(e){const message=e.response?.data?.message||'Test could not run.';setError(message);return {output:message};}finally{setBusy(false);}
 };
 const changeDraft = (next) => {setDraft(next); actions.current=[];setRun(null);setError('');};
 const current=run?.definition?.steps?.[run.nextStep];
 return <section className="terminal-module-tester">
  <h3>Test terminal module</h3><p>Uses the same server actions and fictional state as user practice. Finish the exact definition before publishing. No command runs on your computer.</p>
  <details className="terminal-step-editor"><summary>Edit steps ({draft.steps.length})</summary><ol>{draft.steps.map((step,i)=><li key={i}><label>Step title<input value={step.title} disabled={busy} onChange={e=>changeDraft({...draft,steps:draft.steps.map((s,j)=>j===i?{...s,title:e.target.value}:s)})} /></label><label>Instruction<textarea value={step.instruction ?? step.desc ?? ''} disabled={busy} onChange={e=>changeDraft({...draft,steps:draft.steps.map((s,j)=>j===i?{...s,desc:e.target.value,instruction:e.target.value}:s)})} /></label><label>Supported action<select aria-label={'Action for step '+(i+1)} value={step.actionId||''} disabled={busy} onChange={e=>edit(i,e.target.value)}><option value="" disabled>Choose an executable action</option>{Object.entries(catalog).filter(([,a])=>a.surface==='any'||a.surface===draft.surface).map(([id,a])=><option key={id} value={id}>{id} ({a.type})</option>)}</select></label><label>Command<textarea value={step.command ?? step.expectedCommands?.[0] ?? ''} disabled={busy || step.type==='checkpoint'} onChange={e=>changeDraft({...draft,steps:draft.steps.map((s,j)=>j===i?{...s,command:e.target.value,expectedCommands:e.target.value.trim()?[e.target.value]:[]}:s)})} /></label><label>Expected output<textarea value={step.expectedOutput ?? ''} placeholder="Leave blank to generate from the simulated state" disabled={busy} onChange={e=>changeDraft({...draft,steps:draft.steps.map((s,j)=>j===i?{...s,expectedOutput:e.target.value}:s)})} /></label><button className="btn-sm" type="button" disabled={busy || draft.steps.length===1} onClick={()=>changeDraft({...draft,steps:draft.steps.filter((_,j)=>j!==i)})}>Remove step</button><button className="btn-sm" type="button" disabled={busy || i===0} onClick={()=>{const steps=[...draft.steps];[steps[i-1],steps[i]]=[steps[i],steps[i-1]];changeDraft({...draft,steps});}}>Move earlier</button></li>)}</ol></details>
  <button className="btn-sm" type="button" disabled={busy || draft.steps.length>=12} onClick={()=>changeDraft({...draft,steps:[...draft.steps,{title:'New step',desc:'',type:'command',actionId:'system.identity',expectedCommands:['whoami'],action:'whoami',screen:'',result:''}]})}>Add step</button>
  <button className="btn-sm" type="button" disabled={busy} onClick={()=>test(undefined)}>Validate and restart test</button>
  {error?<p role="alert">{error}</p>:null}
  {run?<><p aria-live="polite">Verified: {run.nextStep} / {run.definition.steps.length}. Mistakes: {run.mistakes}</p><h4>{current?.title||'All steps verified'}</h4>{current ? <TerminalStepGuide key={run.nextStep} step={current} /> : null}
    {current?.type==='checkpoint'?<button className="btn-sm" type="button" disabled={busy} onClick={()=>test('', 'checkpoint')}>Perform simulated checkpoint</button>:null}
    <TerminalEmulator key={run.definition.title} platform={draft.surface} initialPath={draft.surface === "mac-terminal" ? "/Users/student" : "C:\\Users\\student"} className="admin-verified-terminal" initialMessage="Verified training terminal. Type help for the required action." executeCommand={command=>test(command)} />
    <pre aria-live="polite">{run.output}</pre>
  </>:null}
  <button className="btn-sm" type="button" disabled={busy||!run?.testToken} onClick={async()=>{setBusy(true);try{await onSave(run.definition,run.testToken);}catch(e){setError(e.response?.data?.message||'Unable to save module.');}finally{setBusy(false);}}}>{existing?'Publish tested module':'Save tested draft'}</button>
 </section>;
}
