import { passwordAllowed } from "../../utils/passwordPolicy";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import helpdeskLogo from "../../IMG/HELPDESKAI.png";
import "./change-password.css";

export default function ChangePasswordPage() {
  const api = useAxios();
  const { refreshAccessToken, fetchMe } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [visible, setVisible] = useState({});
  const requirements = [
    ["At least 12 characters", passwords.newPassword.length >= 12],
    ["At most 72 UTF-8 bytes", new TextEncoder().encode(passwords.newPassword).length <= 72],
    ["Avoid common passwords", passwordAllowed(passwords.newPassword)]
  ];
  const matches = passwords.newPassword === passwords.confirmPassword;
  const canSubmit = passwords.currentPassword && requirements.every(([, met]) => met) && passwords.confirmPassword && matches;
  async function submit(event) {
    event.preventDefault();
    if (busy || !canSubmit) return;
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirmPassword")) return setError("Passwords do not match.");
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/change-password", { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") });
      const token = await refreshAccessToken();
      await fetchMe(token);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to change password. Please try again.");
    } finally { setBusy(false); }
  }
  return <main className="password-setup-page">
    <div className="password-setup-container">
      <div className="password-setup-brand"><img src={helpdeskLogo} alt="" /><div><strong>HELPDESK SIMULATION</strong><span>IT Support Platform</span></div></div>
      <form className="password-setup-card" onSubmit={submit} aria-labelledby="password-setup-title" aria-busy={busy}>
        <div className="password-setup-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg></div>
        <span className="password-setup-eyebrow">ACCOUNT SETUP</span>
        <h1 id="password-setup-title">Set your password</h1>
        <p className="password-setup-intro">Welcome! Create a personal password to secure your account before continuing.</p>
        {error ? <div className="password-setup-error" role="alert">{error}</div> : null}
        {[["currentPassword", "Current password", "Enter your current password"], ["newPassword", "New password", "Create a new password"], ["confirmPassword", "Confirm new password", "Re-enter your new password"]].map(([name, label, placeholder]) => <div className="password-setup-field" key={name}>
          <label htmlFor={`setup-${name}`}>{label}</label>
          <div className="password-setup-input">
            <input id={`setup-${name}`} name={name} type={visible[name] ? "text" : "password"} autoComplete={name === "currentPassword" ? "current-password" : "new-password"} placeholder={placeholder} value={passwords[name]} onChange={(event) => setPasswords((previous) => ({ ...previous, [name]: event.target.value }))} minLength={name === "currentPassword" ? undefined : 12} required disabled={busy} aria-describedby={name === "newPassword" ? "setup-requirements" : name === "confirmPassword" && passwords.confirmPassword ? "setup-match" : undefined} aria-invalid={name === "confirmPassword" && !!passwords.confirmPassword && !matches} />
            <button type="button" className="password-setup-toggle" onClick={() => setVisible((previous) => ({ ...previous, [name]: !previous[name] }))} aria-label={`${visible[name] ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={!!visible[name]} disabled={busy}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible[name] ? <path d="m3 3 18 18" /> : null}</svg></button>
          </div>
          {name === "currentPassword" ? <small>Use the password provided by your administrator.</small> : null}
          {name === "newPassword" ? <ul className="password-setup-requirements" id="setup-requirements">{requirements.map(([text, met]) => <li key={text} className={met ? "is-met" : ""}><span aria-hidden="true">{met ? "✓" : "○"}</span><span className="password-setup-sr-only">{met ? "Met: " : "Required: "}</span>{text}</li>)}</ul> : null}
          {name === "confirmPassword" && passwords.confirmPassword ? <small id="setup-match" className={matches ? "password-setup-match" : "password-setup-mismatch"} aria-live="polite">{matches ? "Passwords match." : "Passwords do not match yet."}</small> : null}
        </div>)}
        <button className="password-setup-submit" type="submit" disabled={busy || !canSubmit}>{busy ? "Saving password…" : "Save password & continue"}<span aria-hidden="true">→</span></button>
        <p className="password-setup-note">You can update your password anytime in your account settings.</p>
      </form>
      <p className="password-setup-footer">HelpDesk AI · Your IT support workspace</p>
    </div>
  </main>;
}
