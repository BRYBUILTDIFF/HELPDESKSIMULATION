import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">404</h1>
        <p className="auth-sub">The page you requested does not exist.</p>
        <Link to="/dashboard">Go to dashboard</Link>
      </div>
    </div>
  );
}
