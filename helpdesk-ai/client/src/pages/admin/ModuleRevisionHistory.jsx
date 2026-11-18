import { useState } from 'react';
import { useAxios } from '../../hooks/useAxios';

export default function ModuleRevisionHistory({ moduleId }) {
  const api=useAxios();
  const [rows,setRows]=useState(null);
  const [error,setError]=useState('');
  return <details className="module-revision-history" onToggle={async event=>{
    if(!event.currentTarget.open || rows)return;
    try{const {data}=await api.get(`/api/admin/simulation-modules/${moduleId}/revisions`);setRows(data.revisions);setError('');}
    catch{setError('Could not load revision history. Close and reopen to retry.');}
  }}><summary>Revision history</summary>
    {error?<p role="alert">{error}</p>:rows?rows.map(row=><details key={row.id} className="module-revision-row"><summary>Revision {row.revision} · {row.actorId ? `Admin #${row.actorId}` : 'Legacy baseline'} · {new Date(row.createdAt).toLocaleString()} · {row.testReceiptId?'Test recorded':'No recorded test'}</summary><p>{row.snapshot.title} · {row.snapshot.enabled?'Enabled':'Disabled'}</p><ol>{row.snapshot.simulation?.steps?.map((step,index)=><li key={index}><strong>{step.title}</strong><p>{step.instruction || step.desc}</p>{step.desc && step.desc!==step.instruction?<p>{step.desc}</p>:null}{step.command?<pre>{step.command}</pre>:null}<pre>{step.expectedOutput || step.result}</pre></li>)}</ol></details>):<p role="status">Loading revisions...</p>}
  </details>;
}
