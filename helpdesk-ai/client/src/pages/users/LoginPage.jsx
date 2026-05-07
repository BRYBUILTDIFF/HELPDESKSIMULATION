import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => form.email.trim() && form.password.trim(), [form.email, form.password]);

  if (user) {
    return <Navigate to="/dashboard" replace />;
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
      await login({ email: form.email.trim(), password: form.password });
      navigate("/dashboard", { replace: true });
    } catch (err) {
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
            <span className="login-logo-mark">HS</span>
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
            <span>Role-based access</span>
            <span>Session history</span>
            <span>Simulation workflow</span>
          </div>
          <div className="demo-credentials">
            <div className="demo-credentials-title">Demo Credentials</div>
            <div className="demo-credentials-grid">
              <div className="demo-cred-item">
                <div className="demo-cred-role">ADMIN</div>
                <div className="demo-cred-row">
                  <span>Email:</span> <code>admin@helpdesk.com</code>
                </div>
                <div className="demo-cred-row">
                  <span>Password:</span> <code>Admin@1234</code>
                </div>
              </div>
              <div className="demo-cred-item">
                <div className="demo-cred-role">USER</div>
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
          <h3>Sign in</h3>
          <p>Use your account credentials to continue.</p>

          {error ? <p className="global-error">{error}</p> : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
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
                value={form.password}
                onChange={onChange}
              />
              <button className="login-toggle-btn" type="button" onClick={() => setShowPassword((prev) => !prev)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="row-between login-row">
            <label className="login-remember">
              <input name="remember" type="checkbox" checked={form.remember} onChange={onChange} /> Remember me
            </label>
          </div>

          <button className="btn login-submit" type="submit" disabled={!canSubmit || loading}>
            {loading ? "Signing in..." : "Login"}
          </button>

          <p className="auth-footer login-footer">
            No account yet? <Link to="/register">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
