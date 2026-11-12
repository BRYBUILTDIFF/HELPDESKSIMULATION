import {useState} from 'react';
import {copyText} from '../../../utils/clipboard';
export default function TerminalStepGuide({step, iconOnly = false}) {
 const [copyStatus,setCopyStatus]=useState('');
 const command=step.command ?? step.expectedCommands?.[0] ?? '';
 return <div className="terminal-step-guide">
  <div><h4>Instruction</h4><p>{step.instruction || step.desc || step.title}</p></div>
  <div><h4>Command</h4>{command?<><div className={iconOnly ? "terminal-command-row" : undefined}><pre>{command}</pre><button className={iconOnly ? "terminal-command-copy" : undefined} type="button" aria-label="Copy command" title={copyStatus === "Copied" ? "Copied" : "Copy command"} onClick={async()=>{try{await copyText(command);setCopyStatus('Copied');}catch{setCopyStatus('Select the command above and copy it.');}}}>{iconOnly ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg> : "Copy command"}</button></div><span role="status">{copyStatus}</span></>:<p>Use the simulated checkpoint button. No command is required.</p>}</div>
  <div><h4>Expected output</h4><pre>{step.expectedOutput || 'Expected output will be supplied by the verified simulation.'}</pre></div>
 </div>;
}
