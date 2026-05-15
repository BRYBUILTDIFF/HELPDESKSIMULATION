import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import "./admin.css";

function fmtDateTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch (_err) {
    return "-";
  }
}

function getErrorMessage(error) {
  if (!error.response) {
    return "Connection error. Please try again.";
  }
  return error.response.data?.message || "Request failed.";
}

export default function AdminPage() {
  const { user } = useAuth();
  const api = useAxios();

  const [activeTab, setActiveTab] = useState("overview");
  const [users, setUsers] = useState([]);
  const [policySummary, setPolicySummary] = useState({
    total: 0,
    blocked: 0,
    allowed: 0,
    blockRate: 0,
    last24h: 0,
    byCode: {}
  });
  const [policyEvents, setPolicyEvents] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState(null);

  const loadUsers = useCallback(async () => {
    const response = await api.get("/api/admin/users");
    setUsers(response.data.users || []);
  }, [api]);

  const loadPolicy = useCallback(async () => {
    const [summaryRes, eventsRes] = await Promise.all([
      api.get("/api/admin/policy/summary"),
      api.get("/api/admin/policy/events?limit=120")
    ]);
    setPolicySummary(summaryRes.data.summary || {});
    setPolicyEvents(eventsRes.data.events || []);
  }, [api]);

  const loadModules = useCallback(async () => {
    const response = await api.get("/api/admin/simulation-modules");
    setModules(response.data.modules || []);
  }, [api]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      await Promise.all([loadUsers(), loadPolicy(), loadModules()]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadModules, loadPolicy, loadUsers]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const userStats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const admins = users.filter((u) => u.role === "ADMIN").length;
    return { total, active, admins };
  }, [users]);

  const moduleStats = useMemo(() => {
    const total = modules.length;
    const enabled = modules.filter((m) => m.enabled).length;
    const hard = modules.filter((m) => m.difficulty === "Hard").length;
    return { total, enabled, hard };
  }, [modules]);

  const updateUser = async (id, payload, confirmText) => {
    if (!window.confirm(confirmText)) {
      return;
    }
    setPendingId(`user-${id}`);
    try {
      await api.patch(`/api/admin/users/${id}`, payload);
      await loadUsers();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  const deactivate = async (id) => {
    if (!window.confirm("Deactivate this user?")) {
      return;
    }
    setPendingId(`user-${id}`);
    try {
      await api.delete(`/api/admin/users/${id}`);
      await loadUsers();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  const updateModule = async (id, patch) => {
    setPendingId(`module-${id}`);
    try {
      await api.patch(`/api/admin/simulation-modules/${id}`, patch);
      await loadModules();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark">HS</div>
          <div>
            <h1>Admin Console</h1>
            <p>{user?.firstName} {user?.lastName}</p>
          </div>
        </div>

        <nav className="admin-nav">
          <button className={`admin-nav-btn ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
            Overview
          </button>
          <button className={`admin-nav-btn ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")}>
            User Management
          </button>
          <button className={`admin-nav-btn ${activeTab === "policy" ? "active" : ""}`} onClick={() => setActiveTab("policy")}>
            Policy Monitor
          </button>
          <button className={`admin-nav-btn ${activeTab === "modules" ? "active" : ""}`} onClick={() => setActiveTab("modules")}>
            Simulation Modules
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-mini-btn" onClick={loadAll}>Refresh Data</button>
          <Link to="/dashboard" className="admin-mini-btn ghost">Go to User Dashboard</Link>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h2>
              {activeTab === "overview" && "Overview Dashboard"}
              {activeTab === "users" && "User Management"}
              {activeTab === "policy" && "Policy Monitor"}
              {activeTab === "modules" && "Simulation Modules"}
            </h2>
            <p>Helpdesk AI administration workspace</p>
          </div>
          <div className="admin-status">
            <span className="dot" />
            System Online
          </div>
        </header>

        {error ? <p className="admin-error">{error}</p> : null}
        {loading ? <p className="admin-loading">Loading admin data...</p> : null}

        {!loading && activeTab === "overview" ? (
          <section className="admin-section">
            <div className="admin-cards">
              <article className="admin-card">
                <small>Users</small>
                <strong>{userStats.total}</strong>
                <span>{userStats.active} active · {userStats.admins} admins</span>
              </article>
              <article className="admin-card">
                <small>Policy Decisions</small>
                <strong>{policySummary.total || 0}</strong>
                <span>{policySummary.blocked || 0} blocked · {policySummary.blockRate || 0}% block rate</span>
              </article>
              <article className="admin-card">
                <small>Last 24 Hours</small>
                <strong>{policySummary.last24h || 0}</strong>
                <span>Policy evaluations recorded</span>
              </article>
              <article className="admin-card">
                <small>Simulation Modules</small>
                <strong>{moduleStats.enabled}/{moduleStats.total}</strong>
                <span>{moduleStats.hard} hard-difficulty modules</span>
              </article>
            </div>

            <div className="admin-panel">
              <h3>Top Policy Codes</h3>
              <div className="admin-code-grid">
                {Object.entries(policySummary.byCode || {}).slice(0, 8).map(([code, count]) => (
                  <div key={code} className="admin-code-item">
                    <span>{code}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "users" ? (
          <section className="admin-section">
            <div className="admin-panel">
              <h3>Users</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === user?.id;
                    return (
                      <tr key={u.id}>
                        <td>{u.firstName} {u.lastName}</td>
                        <td>{u.email}</td>
                        <td>
                          <span className={`badge ${u.role === "ADMIN" ? "badge-admin" : "badge-user"}`}>{u.role}</span>
                        </td>
                        <td>
                          <span className={`badge ${u.isActive ? "badge-active" : "badge-inactive"}`}>
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>{fmtDateTime(u.createdAt)}</td>
                        <td>
                          <div className="admin-actions">
                            <button
                              className="admin-mini-btn"
                              disabled={pendingId === `user-${u.id}` || isSelf}
                              onClick={() =>
                                updateUser(
                                  u.id,
                                  { role: u.role === "ADMIN" ? "USER" : "ADMIN" },
                                  `Change role for ${u.email}?`
                                )
                              }
                            >
                              {u.role === "ADMIN" ? "Demote" : "Promote"}
                            </button>
                            {u.isActive ? (
                              <button className="admin-mini-btn danger" disabled={pendingId === `user-${u.id}` || isSelf} onClick={() => deactivate(u.id)}>
                                Deactivate
                              </button>
                            ) : (
                              <button
                                className="admin-mini-btn"
                                disabled={pendingId === `user-${u.id}`}
                                onClick={() => updateUser(u.id, { isActive: true }, `Activate ${u.email}?`)}
                              >
                                Activate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "policy" ? (
          <section className="admin-section">
            <div className="admin-panel">
              <h3>Policy Events</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Prompt</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {policyEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No policy events yet.</td>
                    </tr>
                  ) : (
                    policyEvents.map((e) => (
                      <tr key={e.id}>
                        <td>{fmtDateTime(e.at)}</td>
                        <td>{e.userEmail}</td>
                        <td><code>{e.code}</code></td>
                        <td>
                          <span className={`badge ${e.blocked ? "badge-inactive" : "badge-active"}`}>
                            {e.blocked ? "Blocked" : "Allowed"}
                          </span>
                        </td>
                        <td>{e.message}</td>
                        <td>{e.reason || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "modules" ? (
          <section className="admin-section">
            <div className="admin-mod-grid">
              {modules.map((m) => (
                <article key={m.id} className="admin-mod-card">
                  <div className="admin-mod-head">
                    <h4>{m.title}</h4>
                    <span className={`badge ${m.enabled ? "badge-active" : "badge-inactive"}`}>
                      {m.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p>{m.category}</p>
                  <div className="admin-mod-controls">
                    <label>
                      Difficulty
                      <select
                        value={m.difficulty}
                        disabled={pendingId === `module-${m.id}`}
                        onChange={(e) => updateModule(m.id, { difficulty: e.target.value })}
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </label>
                    <button
                      className={`admin-mini-btn ${m.enabled ? "danger" : ""}`}
                      disabled={pendingId === `module-${m.id}`}
                      onClick={() => updateModule(m.id, { enabled: !m.enabled })}
                    >
                      {m.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

