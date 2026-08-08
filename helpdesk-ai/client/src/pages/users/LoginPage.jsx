import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import helpdeskLogo from "../../IMG/HELPDESKAI.png";
import workspaceHero from "../../IMG/login-workspace-hero.png";

function parseError(error) {
  if (!error.response) {
    return "Connection error. Please try again.";
  }
  if (error.response.data?.message === "Account inactive") {
    return "Your account is inactive. Please contact an administrator.";
  }
  if (error.response.status === 401) {
    return "Invalid email or password.";
  }
  return "Unable to login. Please try again.";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
    remember: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordHelpOpen, setPasswordHelpOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => form.email.trim() && form.password.trim(), [form.email, form.password]);

  if (user) {
    return <Navigate to={user.role === "ADMIN" ? "/admin" : "/dashboard"} replace />;
  }

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || loading) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const loggedInUser = await login({ email: form.email.trim(), password: form.password });
      setSigningIn(true);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      navigate(loggedInUser?.role === "ADMIN" ? "/admin" : "/dashboard", {
        replace: true,
        state: loggedInUser?.role === "ADMIN" ? undefined : { startNewChat: true }
      });
    } catch (err) {
      setSigningIn(false);
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-grid">
        <section className="login-brand">
          <div className="login-logo">
            <img className="login-logo-mark" src={helpdeskLogo} alt="HelpDesk AI" />
            <div>
              <h2>HELPDESK SIMULATION</h2>
              <p>IT Support Platform</p>
            </div>
          </div>
          <h1>Professional IT troubleshooting assistant</h1>
          <p className="login-brand-sub">
            Manage support sessions, run guided simulations, and resolve technical issues with policy-aware AI guidance.
          </p>
          <div className="login-brand-points">
            <span>◈&nbsp; Role-based access</span>
            <span>◷&nbsp; Session history</span>
            <span>♧&nbsp; Simulation workflow</span>
          </div>
          <img className="login-workspace-hero" src={workspaceHero} alt="IT support workspace with laptop and headset" />
          <div className="demo-credentials">
            <div className="demo-credentials-title"><span>♙</span> Demo accounts <small>Use the credentials below to explore the platform.</small></div>
            <div className="demo-credentials-grid">
              <div className="demo-cred-item">
                <div className="demo-cred-role"><span>♛</span> Admin</div>
                <div className="demo-cred-row">
                  <span>Email:</span> <code>admin@helpdesk.com</code>
                </div>
                <div className="demo-cred-row">
                  <span>Password:</span> <code>Admin@1234</code>
                </div>
              </div>
              <div className="demo-cred-item">
                <div className="demo-cred-role user"><span>♙</span> User</div>
                <div className="demo-cred-row">
                  <span>Email:</span> <code>user@helpdesk.com</code>
                </div>
                <div className="demo-cred-row">
                  <span>Password:</span> <code>User@1234</code>
                </div>
              </div>
            </div>
          </div>
        </section>

        <form className="login-card" onSubmit={onSubmit}>
          <div className="login-form-heading">
            <span className="login-lock-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" /></svg>
            </span>
            <div><h3>Sign in</h3><p>Use your account credentials to continue.</p></div>
          </div>

          {error ? <p className="login-error" role="alert">{error}</p> : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={form.email}
              onChange={onChange}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="password-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={form.password}
                onChange={onChange}
              />
              <button
                className="login-toggle-btn login-eye-btn"
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 4.5L20 21.5" />
                    <path d="M9.7 9.9A3 3 0 0 1 14 14.2" />
                    <path d="M10.6 5.3A10.9 10.9 0 0 1 12 5.2c5.5 0 9.6 4.2 10.9 6.8a1 1 0 0 1 0 .9 12 12 0 0 1-5.2 5.2" />
                    <path d="M6.6 7.2A12 12 0 0 0 1.1 12a1 1 0 0 0 0 .9A12 12 0 0 0 12 18.8c1 0 2-.1 2.9-.4" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M1.1 12a1 1 0 0 1 0-.9C2.4 8.4 6.5 4.2 12 4.2s9.6 4.2 10.9 6.8a1 1 0 0 1 0 .9c-1.3 2.7-5.4 6.9-10.9 6.9S2.4 14.6 1.1 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="row-between login-row">
            <label className="login-remember">
              <input name="remember" type="checkbox" checked={form.remember} onChange={onChange} /> Remember me
            </label>
            <button className="login-forgot" type="button" onClick={() => setPasswordHelpOpen(true)}>Forgot password?</button>
          </div>

          <button className="btn login-submit" type="submit" disabled={!canSubmit || loading}>
            {loading ? "Signing in..." : "Login"}
          </button>

          <div className="login-divider"><span>or</span></div>
          <details className="mobile-demo-credentials">
            <summary>View demo accounts</summary>
            <div className="mobile-demo-account">
              <strong>Administrator</strong>
              <code>admin@helpdesk.com</code>
              <code>Admin@1234</code>
            </div>
            <div className="mobile-demo-account">
              <strong>User</strong>
              <code>user@helpdesk.com</code>
              <code>User@1234</code>
            </div>
          </details>
          <p className="auth-footer login-footer">♢&nbsp; Account creation is managed by administrators.</p>
        </form>
      </div>
      {passwordHelpOpen ? (
        <div className="password-help-overlay" onClick={() => setPasswordHelpOpen(false)}>
          <section
            className="password-help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="password-help-close" type="button" onClick={() => setPasswordHelpOpen(false)} aria-label="Close password help">×</button>
            <div className="password-help-icon" aria-hidden="true">?</div>
            <h3 id="password-help-title">Forgot your password?</h3>
            <p>Please contact your administrator to have your password reset.</p>
            <button className="password-help-confirm" type="button" onClick={() => setPasswordHelpOpen(false)}>Got it</button>
          </section>
        </div>
      ) : null}
      {signingIn ? (
        <div className="signin-loading-overlay" role="status" aria-live="polite">
          <div className="signin-loading-card">
            <span className="signin-spinner" aria-hidden="true" />
            <strong>Signing you in...</strong>
            <span>Preparing your workspace</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
