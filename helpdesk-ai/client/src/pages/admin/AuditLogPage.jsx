import { Fragment, useEffect, useState } from 'react';
import { useAxios } from '../../hooks/useAxios';
import './audit-log.css';

const initialFilters = { actorId:'', result:'all', from:'', to:'', page:1, pageSize:'25' };
const dateFormat = new Intl.DateTimeFormat('en-PH', { timeZone:'Asia/Manila', month:'short', day:'numeric', year:'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-PH', { timeZone:'Asia/Manila', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
function accountName(account, id) {
  return account ? [account.firstName,account.lastName].filter(Boolean).join(' ') || account.email || `Admin #${id}` : `Admin #${id}`;
}
function describeEvent(event) {
  const path = event.path.replace(/^\/api\/admin\/?/, '');
  const parts = path.split('/');
  const verb = { POST:'Create', PATCH:'Update', PUT:'Replace', DELETE:'Delete' }[event.method] || event.method;
  const identity = parts[1] ? decodeSafe(parts[1]) : '';
  if (parts[0] === 'users') return { action:`${verb} user`, resource:identity ? `User #${identity}` : 'User management' };
  if (path === 'simulation-modules/draft') return { action:'Generate AI draft', resource:'Simulation drafts' };
  if (path === 'simulation-modules/test') return { action:'Run module test', resource:'Terminal simulation' };
  if (path.includes('prompt-insights/disregard')) return { action:'Disregard suggestion', resource:'Suggestion queue' };
  if (parts[0] === 'simulation-modules') return { action:`${verb} module`, resource:identity || 'Simulation modules' };
  if (parts[0] === 'simulation-drafts') return { action:`${verb} saved draft`, resource:identity || 'Simulation drafts' };
  if (parts[0] === 'session-restrictions') return { action:'Reset safety restriction', resource:identity ? `User #${identity}` : 'Session restrictions' };
  if (parts[0] === 'simulation-sessions') return { action:'Retry workspace cleanup', resource:identity || 'Windows workspaces' };
  if (parts[0] === 'policy') return { action:parts.includes('reset') ? 'Reset policy defaults' : `${verb} policy`, resource:parts[2] && parts[2] !== 'reset' ? decodeSafe(parts[2]) : 'Policy configuration' };
  return { action:`${event.method} request`, resource:event.path };
}
function decodeSafe(value) { try { return decodeURIComponent(value); } catch { return value; } }
function resultFor(status) {
  if (status === 0) return { label:'Outcome not recorded', kind:'unknown' };
  if (status >= 200 && status < 300) return { label:'Successful', kind:'success' };
  if (status >= 300 && status < 400) return { label:'Redirected', kind:'unknown' };
  if (status >= 400) return { label:'Failed', kind:'failed' };
  return { label:`HTTP ${status}`, kind:'unknown' };
}
function RecordedValues({ title, values }) {
  const entries = Object.entries(values || {});
  return <div><h4>{title}</h4>{entries.length ? <dl className="audit-value-list">{entries.map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl> : <p>Not recorded</p>}</div>;
}
export default function AuditLogPage() {
  const api = useAxios();
  const [filters,setFilters] = useState(initialFilters);
  const [search,setSearch] = useState('');
  const [query,setQuery] = useState('');
  const [actors,setActors] = useState([]);
  const [actorError,setActorError] = useState('');
  const [events,setEvents] = useState([]);
  const [pagination,setPagination] = useState({page:1,total:0,totalPages:1,pageSize:25});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [expanded,setExpanded] = useState(null);
  const [refresh,setRefresh] = useState(0);
  useEffect(() => { const timer=setTimeout(() => setQuery(search.trim()),300); return () => clearTimeout(timer); },[search]);
  useEffect(() => {
    const controller=new AbortController();
    api.get('/api/admin/audit/actors',{signal:controller.signal}).then(({data}) => {setActors(data.actors || []);setActorError('');}).catch(error => {if(!controller.signal.aborted)setActorError('Administrator filters could not load. Refresh to retry.');});
    return () => controller.abort();
  },[api,refresh]);
  useEffect(() => {
    const controller=new AbortController();
    if(filters.from && filters.to && filters.from > filters.to) {setError('Start date must be on or before end date.');setEvents([]);setLoading(false);return () => controller.abort();}
    setLoading(true);setError('');setExpanded(null);
    api.get('/api/admin/audit',{params:{...filters,q:query},signal:controller.signal})
      .then(({data}) => {setEvents(data.events || []);setPagination(data.pagination);})
      .catch(error => {if(!controller.signal.aborted){setEvents([]);setError(error.response?.data?.message || 'Could not load audit records. Refresh to try again.');}})
      .finally(() => {if(!controller.signal.aborted)setLoading(false);});
    return () => controller.abort();
  },[api,query,filters.actorId,filters.result,filters.from,filters.to,filters.page,filters.pageSize,refresh]);
  const update = (name,value) => setFilters(current => ({...current,[name]:value,page:1}));
  const hasFilters = Boolean(search || filters.actorId || filters.result !== 'all' || filters.from || filters.to);
  return <div className="page active audit-log-page">
    <div className="admin-tab-intro audit-page-heading"><div><h1>Audit log</h1><p>Review recorded administrator changes and request outcomes.</p></div><button type="button" className="btn-sm" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>
    <section className="panel audit-log-panel" aria-label="Administrator audit records">
      <div className="audit-filter-bar">
        <label className="audit-search-field">Search<input name="audit-log-page-search" type="search" value={search} maxLength={200} placeholder="Endpoint, name, email or administrator ID" onChange={event => {setSearch(event.target.value);setFilters(current => ({...current,page:1}));}} /></label>
        <label>Administrator<select name="audit-log-page-filters-actor-id" value={filters.actorId} onChange={event => update('actorId',event.target.value)}><option value="">All administrators</option>{actors.map(actor => <option key={actor.id} value={actor.id}>{actor.account ? `${accountName(actor.account,actor.id)} (#${actor.id})` : `Admin #${actor.id} (account unavailable)`}</option>)}</select></label>
        <label>Result<select name="audit-log-page-filters-result" value={filters.result} onChange={event => update('result',event.target.value)}><option value="all">All results</option><option value="success">Successful</option><option value="failed">Failed</option><option value="redirected">Redirected</option><option value="unrecorded">Outcome not recorded</option></select></label>
        <label>From<input name="audit-log-page-filters-from" type="date" value={filters.from} onChange={event => update('from',event.target.value)} /></label>
        <label>Through<input name="audit-log-page-filters-to" type="date" value={filters.to} onChange={event => update('to',event.target.value)} /></label>
      </div>
      <div className="audit-filter-note"><span>Dates and times are in Philippine time (UTC+8).</span>{hasFilters ? <button type="button" onClick={() => {setSearch('');setQuery('');setFilters(initialFilters);}}>Clear filters</button> : null}</div>
      {actorError ? <p className="audit-inline-notice" role="status">{actorError}</p> : null}
      {error ? <div className="admin-alert error" role="alert">{error}</div> : null}
      <div className="audit-table-scroll" aria-busy={loading}>
        <table className="audit-events-table">
          <caption className="audit-sr-only">Administrator write requests. Expand an action to read its recorded details.</caption>
          <thead><tr><th scope="col">Time</th><th scope="col">Administrator</th><th scope="col">Action</th><th scope="col">Resource</th><th scope="col">Result</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5}><div className="audit-empty-state" role="status">Loading audit records...</div></td></tr> : !events.length ? <tr><td colSpan={5}><div className="audit-empty-state"><strong>{error ? 'Audit records unavailable' : hasFilters ? 'No matching activity' : 'No recorded activity yet'}</strong><p>{error ? 'Refresh to retry.' : hasFilters ? 'Adjust your filters to find another action.' : 'Administrator changes will appear here when they are recorded.'}</p></div></td></tr> : events.map(event => {
              const item=describeEvent(event), result=resultFor(event.status), open=expanded === event.id;
              const at=new Date(event.at);
              return <Fragment key={event.id}><tr className={`audit-event-row ${open ? 'audit-row-open' : ''}`}>
                <td data-label="Time"><time dateTime={event.at}>{dateFormat.format(at)}<span>{timeFormat.format(at)}</span></time></td>
                <td data-label="Administrator"><strong>{accountName(event.actor,event.actorId)}</strong><span className="audit-cell-secondary">{event.actor ? `Admin #${event.actorId}` : 'Account no longer available'}</span></td>
                <td data-label="Action"><button type="button" className="audit-expand-button" aria-expanded={open} aria-controls={`audit-details-${event.id}`} onClick={() => setExpanded(open ? null : event.id)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg><span>{item.action}</span></button></td>
                <td data-label="Resource" className="audit-resource-cell">{item.resource}</td>
                <td data-label="Result"><span className={`audit-result audit-result-${result.kind}`}>{result.label}</span>{event.status ? <span className="audit-cell-secondary">HTTP {event.status}</span> : null}</td>
              </tr>{open ? <tr className="audit-detail-row" id={`audit-details-${event.id}`}><td colSpan={5}><div className="audit-details">
                <div className="audit-detail-heading"><h3>Recorded request details</h3><span>Event #{event.id}</span></div>
                <dl className="audit-request-details"><div><dt>Endpoint</dt><dd><code>{event.method} {event.path}</code></dd></div><div><dt>Administrator ID</dt><dd>{event.actorId}</dd></div><div><dt>Recorded role</dt><dd>{event.metadata?.actorRole || 'Not recorded'}</dd></div></dl>
                <div><h4>Changed fields</h4>{event.metadata?.changedFields?.length ? <div className="audit-changed-fields">{event.metadata.changedFields.map((field,index) => <code key={index}>{field}</code>)}</div> : <p>Not recorded</p>}</div>
                <div className="audit-recorded-values"><RecordedValues title="Recorded previous values" values={event.metadata?.before} /><RecordedValues title="Requested values" values={event.metadata?.requestedValues} /></div>
                <p className="audit-detail-disclaimer">Requested values describe the request, not a verified final state. {event.status === 0 ? 'The final response was not recorded; success or failure cannot be determined.' : 'Complete before-and-after values are not available for every action.'}</p>
                {event.actor ? <p className="audit-detail-disclaimer">Account name and email reflect the current account record: {event.actor.email}.</p> : null}
              </div></td></tr> : null}</Fragment>;
            })}
          </tbody>
        </table>
      </div>
      <div className="audit-pagination">
        <span role="status">{loading ? 'Loading...' : error ? 'Records could not be loaded' : pagination.total ? `${(pagination.page-1)*pagination.pageSize+1}-${Math.min(pagination.page*pagination.pageSize,pagination.total)} of ${pagination.total} records` : '0 records'}</span>
        <label>Rows per page<select name="audit-log-page-filters-page-size" value={filters.pageSize} onChange={event => update('pageSize',event.target.value)}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
        <nav aria-label="Audit log pagination"><button type="button" className="btn-sm" disabled={loading || !!error || pagination.page <= 1} onClick={() => setFilters(current => ({...current,page:pagination.page-1}))}>Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button type="button" className="btn-sm" disabled={loading || !!error || pagination.page >= pagination.totalPages} onClick={() => setFilters(current => ({...current,page:pagination.page+1}))}>Next</button></nav>
      </div>
    </section>
    <p className="audit-page-footnote">Read-only history of authenticated administrator write requests. Sign-ins and page views are not included. Older records may contain limited details.</p>
  </div>;
}
