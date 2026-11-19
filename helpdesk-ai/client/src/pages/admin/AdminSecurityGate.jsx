import {useEffect, useState} from 'react';
import {useAxios} from '../../hooks/useAxios';
import {useAuth} from '../../hooks/useAuth';
import {setAdminVerification} from '../../utils/adminVerification';
import './admin-security.css';

export default function AdminSecurityGate({children}) {
  const api = useAxios();
  const {user, logout} = useAuth();
  const [status, setStatus] = useState(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api.get('/api/auth/admin-mfa/status').then(response => {if(active)setStatus(response.data);}).catch(() => {if(active)setError('Unable to check administrator security. Retry before continuing.');});
    const verify = event => {setStatus(previous=>({...previous,verified:false}));setError(event.detail);setCode('');setPassword('');};
    window.addEventListener('admin-verification-required', verify);
    return () => {active=false;window.removeEventListener('admin-verification-required',verify);};
  }, [api]);
  async function submit(event) {
    event.preventDefault(); setError('');setBusy(true);
    try {
      if (recovery) {
        const response = await api.post('/api/auth/admin-mfa/recover',{password,code:code.trim()});
        window.alert(response.data.message); await logout(); window.location.assign('/login'); return;
      }
      if (!status.enrolled && !secret) {
        const response = await api.post('/api/auth/admin-mfa/enroll',{password});
        setSecret(response.data.secret); setCode(''); return;
      }
      const response = await api.post('/api/auth/admin-mfa/verify',{password,code:code.trim()});
      setAdminVerification(user.id,response.data.verificationToken);
      setPassword('');setCode('');setSecret('');
      if(response.data.recoveryCodes)setRecoveryCodes(response.data.recoveryCodes);
      setStatus({...status,enrolled:true,verified:true});
    } catch(error) {setError(error.response?.data?.message || 'Verification failed. Check your code and try again.');}
    finally {setBusy(false);}
  }
  if(status && (!status.required || status.verified) && !recoveryCodes)return children;
  return <main className="admin-security-shell"><section className="admin-security-panel" aria-labelledby="admin-security-title">
    <p className="admin-security-brand">HelpDesk AI · Administration</p>
    <h1 id="admin-security-title">{recoveryCodes ? 'Save your recovery codes' : recovery ? 'Recover administrator access' : status?.enrolled ? 'Verify your identity' : 'Protect your administrator account'}</h1>
    {error && <p className="admin-security-error" role="alert">{error}</p>}
    {!status ? <><p role="status">Checking account security…</p>{error && <button onClick={()=>window.location.reload()}>Retry</button>}</> : recoveryCodes ? <>
      <p>Store these codes in a password manager. Each recovery resets your authenticator and signs out your sessions. These codes are shown only once.</p>
      <ul className="admin-recovery-codes">{recoveryCodes.map(value=><li key={value}><code>{value}</code></li>)}</ul>
      <button onClick={()=>{setRecoveryCodes(null);}}>I saved my recovery codes</button>
    </> : <form onSubmit={submit} aria-busy={busy}>
      <p>{recovery ? 'Enter your password and an unused recovery code. You will sign in again and enroll a new authenticator.' : status.enrolled ? 'Use your account password and the current six-digit code from your authenticator app. Verification is required again before changes after five minutes.' : 'Add HelpDesk AI to your authenticator app. Enter the setup key manually as a time-based, six-digit account.'}</p>
      {secret && <div className="admin-security-key"><strong>Authenticator setup key</strong><code>{secret}</code><span>Account: {user.email} · Time-based (30 seconds)</span></div>}
      <label htmlFor="admin-security-password">Current password</label>
      <input id="admin-security-password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required maxLength={72} disabled={busy}/>
      {(status.enrolled || secret || recovery) && <><label htmlFor="admin-security-code">{recovery?'Recovery code':'Authenticator code'}</label>
        <input id="admin-security-code" autoComplete="one-time-code" inputMode={recovery?'text':'numeric'} value={code} onChange={event=>setCode(event.target.value)} required minLength={recovery?24:6} maxLength={recovery?24:6} disabled={busy}/></>}
      <button type="submit" disabled={busy}>{busy?'Verifying…':recovery?'Recover account':!status.enrolled&&!secret?'Set up authenticator':'Verify and continue'}</button>
      {status.enrolled && <button type="button" className="admin-security-secondary" disabled={busy} onClick={()=>{setRecovery(!recovery);setCode('');setError('');}}>{recovery?'Use authenticator instead':'Use a recovery code'}</button>}
    </form>}
    <button type="button" className="admin-security-secondary" onClick={logout}>Sign out</button>
  </section></main>;
}
