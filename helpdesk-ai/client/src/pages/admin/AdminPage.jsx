import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import "./admin.css";

const PAGE_META = {
  overview: { title: "Overview Dashboard", nav: "Overview" },
  users: { title: "User Management", nav: "User Management" },
  policy: { title: "Policy Monitor", nav: "Policy Monitor" },
  sims: { title: "Simulation Modules", nav: "Simulation Modules" }
};
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const POLICY_LIST_META = {
  greetingPatterns: "Greeting Patterns",
  inScopeKeywords: "In-Scope Keywords",
  outOfScopeKeywords: "Out-of-Scope Keywords",
  inScopeIntentPatterns: "In-Scope Intent Patterns"
};

function buildDefaultUserForm() {
  return {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "USER",
    isActive: true
  };
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day + 6) % 7;
  now.setDate(now.getDate() - diff);
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function formatDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatRelative(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function safeError(error) {
  if (!error?.response) {
    return "Connection error. Please try again.";
  }
  return error.response.data?.message || "Request failed.";
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "").replaceAll('"', '""');
          return `"${text}"`;
        })
        .join(",")
    )
    .join("\n");
}

function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function validateUserForm(mode, form) {
  if (!form.firstName.trim()) return "First name is required.";
  if (!form.lastName.trim()) return "Last name is required.";
  if (!EMAIL_REGEX.test(form.email.trim())) return "Enter a valid email address.";

  if (mode === "create") {
    if (!PASSWORD_REGEX.test(form.password)) {
      return "Password must be at least 8 chars and include uppercase, number, and special character.";
    }
    if (form.password !== form.confirmPassword) {
      return "Passwords do not match.";
    }
  }

  if (mode === "edit" && form.password) {
    if (!PASSWORD_REGEX.test(form.password)) {
      return "Password must be at least 8 chars and include uppercase, number, and special character.";
    }
    if (form.password !== form.confirmPassword) {
      return "Passwords do not match.";
    }
  }

  return "";
}

export default function AdminPage() {
  const { user, logout } = useAuth();
  const api = useAxios();

  const [activePage, setActivePage] = useState("overview");
  const [users, setUsers] = useState([]);
  const [policySummary, setPolicySummary] = useState({ total: 0, blocked: 0, allowed: 0, blockRate: 0, last24h: 0, byCode: {} });
  const [policyEvents, setPolicyEvents] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState("");

  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("ALL");
  const [userStatusFilter, setUserStatusFilter] = useState("ALL");

  const [policyStatusFilter, setPolicyStatusFilter] = useState("ALL");
  const [policyTimeFilter, setPolicyTimeFilter] = useState("ALL");
  const [policyConfig, setPolicyConfig] = useState({
    greetingPatterns: [],
    inScopeKeywords: [],
    outOfScopeKeywords: [],
    inScopeIntentPatterns: [],
    messages: {}
  });
  const [policyConfigDraft, setPolicyConfigDraft] = useState({});
  const [policyEditorError, setPolicyEditorError] = useState("");
  const [policyEditorListInput, setPolicyEditorListInput] = useState({});

  const [moduleDifficultyFilter, setModuleDifficultyFilter] = useState("ALL");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState("create");
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState(buildDefaultUserForm());
  const [userFormError, setUserFormError] = useState("");

  const loadUsers = useCallback(async () => {
    const res = await api.get("/api/admin/users");
    setUsers(Array.isArray(res.data?.users) ? res.data.users : []);
  }, [api]);

  const loadPolicy = useCallback(async () => {
    const [summaryRes, eventsRes, configRes] = await Promise.all([
      api.get("/api/admin/policy/summary"),
      api.get("/api/admin/policy/events?limit=200"),
      api.get("/api/admin/policy/config")
    ]);

    setPolicySummary(summaryRes.data?.summary || { total: 0, blocked: 0, allowed: 0, blockRate: 0, last24h: 0, byCode: {} });
    setPolicyEvents(Array.isArray(eventsRes.data?.events) ? eventsRes.data.events : []);
    const nextConfig = configRes.data?.config || {
      greetingPatterns: [],
      inScopeKeywords: [],
      outOfScopeKeywords: [],
      inScopeIntentPatterns: [],
      messages: {}
    };
    setPolicyConfig(nextConfig);
    setPolicyConfigDraft(nextConfig.messages || {});
    setPolicyEditorError("");
  }, [api]);

  const loadModules = useCallback(async () => {
    const res = await api.get("/api/admin/simulation-modules");
    setModules(Array.isArray(res.data?.modules) ? res.data.modules : []);
  }, [api]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      await Promise.all([loadUsers(), loadPolicy(), loadModules()]);
    } catch (err) {
      setError(safeError(err));
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
    const completions = modules.reduce((sum, m) => sum + Number(m.completions || 0), 0);
    return { total, enabled, hard, completions };
  }, [modules]);

  const todayStart = useMemo(() => startOfToday(), []);
  const weekStart = useMemo(() => startOfWeek(), []);

  const aiChatsToday = useMemo(
    () => policyEvents.filter((event) => new Date(event.at).getTime() >= todayStart).length,
    [policyEvents, todayStart]
  );

  const blockedToday = useMemo(
    () => policyEvents.filter((event) => event.blocked && new Date(event.at).getTime() >= todayStart).length,
    [policyEvents, todayStart]
  );

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();

    return users.filter((u) => {
      const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
      const email = String(u.email || "").toLowerCase();
      const matchesQuery = !query || fullName.includes(query) || email.includes(query);
      const matchesRole = userRoleFilter === "ALL" || u.role === userRoleFilter;
      const matchesStatus =
        userStatusFilter === "ALL" ||
        (userStatusFilter === "ACTIVE" && u.isActive) ||
        (userStatusFilter === "INACTIVE" && !u.isActive);

      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [userQuery, userRoleFilter, userStatusFilter, users]);

  const filteredPolicyEvents = useMemo(() => {
    return policyEvents.filter((event) => {
      const at = new Date(event.at).getTime();
      const statusPass =
        policyStatusFilter === "ALL" ||
        (policyStatusFilter === "ALLOWED" && !event.blocked) ||
        (policyStatusFilter === "BLOCKED" && event.blocked);

      const timePass =
        policyTimeFilter === "ALL" ||
        (policyTimeFilter === "TODAY" && at >= todayStart) ||
        (policyTimeFilter === "WEEK" && at >= weekStart);

      return statusPass && timePass;
    });
  }, [policyEvents, policyStatusFilter, policyTimeFilter, todayStart, weekStart]);

  const policyWeekChart = useMemo(() => {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const points = labels.map((label, idx) => {
      const start = new Date(monday);
      start.setDate(monday.getDate() + idx);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);

      const events = policyEvents.filter((event) => {
        const at = new Date(event.at).getTime();
        return at >= start.getTime() && at < end.getTime();
      });

      return {
        label,
        allowed: events.filter((e) => !e.blocked).length,
        blocked: events.filter((e) => e.blocked).length
      };
    });

    const peak = points.reduce((max, point) => Math.max(max, point.allowed, point.blocked), 1);
    return { points, peak };
  }, [policyEvents]);

  const filteredModules = useMemo(() => {
    if (moduleDifficultyFilter === "ALL") {
      return modules;
    }
    return modules.filter((m) => m.difficulty === moduleDifficultyFilter);
  }, [moduleDifficultyFilter, modules]);

  const topModules = useMemo(() => {
    return [...modules]
      .sort((a, b) => Number(b.completions || 0) - Number(a.completions || 0))
      .slice(0, 4);
  }, [modules]);

  const recentActivity = useMemo(() => {
    const userEvents = users.slice(0, 4).map((u) => ({
      id: `user-${u.id}`,
      at: u.createdAt,
      type: "user",
      text: `${u.firstName || ""} ${u.lastName || ""}`.trim() + " registered"
    }));

    const policyActivity = policyEvents.slice(0, 8).map((event) => ({
      id: `policy-${event.id}`,
      at: event.at,
      type: event.blocked ? "blocked" : "allowed",
      text: event.blocked ? "Policy blocked off-topic prompt" : "AI policy allowed IT prompt"
    }));

    return [...userEvents, ...policyActivity]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 4);
  }, [policyEvents, users]);

  const openCreateUserModal = () => {
    setUserModalMode("create");
    setEditingUserId(null);
    setUserForm(buildDefaultUserForm());
    setUserFormError("");
    setUserModalOpen(true);
  };

  const openEditUserModal = (targetUser) => {
    setUserModalMode("edit");
    setEditingUserId(targetUser.id);
    setUserForm({
      firstName: targetUser.firstName || "",
      lastName: targetUser.lastName || "",
      email: targetUser.email || "",
      password: "",
      confirmPassword: "",
      role: targetUser.role || "USER",
      isActive: Boolean(targetUser.isActive)
    });
    setUserFormError("");
    setUserModalOpen(true);
  };

  const closeUserModal = () => {
    setUserModalOpen(false);
    setUserFormError("");
    setEditingUserId(null);
    setUserForm(buildDefaultUserForm());
  };

  const saveUserModal = async () => {
    const validationMessage = validateUserForm(userModalMode, userForm);
    if (validationMessage) {
      setUserFormError(validationMessage);
      return;
    }

    setPendingKey("user-modal-save");
    setUserFormError("");

    const payload = {
      firstName: userForm.firstName.trim(),
      lastName: userForm.lastName.trim(),
      email: userForm.email.trim().toLowerCase(),
      role: userForm.role,
      isActive: Boolean(userForm.isActive)
    };

    if (userForm.password.trim()) {
      payload.password = userForm.password;
    }

    try {
      if (userModalMode === "create") {
        if (!payload.password) {
          setUserFormError("Password is required for new users.");
          return;
        }
        await api.post("/api/admin/users", payload);
      } else {
        await api.patch(`/api/admin/users/${editingUserId}`, payload);
      }

      await loadUsers();
      closeUserModal();
    } catch (err) {
      setUserFormError(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const setUserActiveState = async (targetUser, nextActive) => {
    const key = `user-active-${targetUser.id}`;
    setPendingKey(key);

    try {
      await api.patch(`/api/admin/users/${targetUser.id}`, { isActive: nextActive });
      await loadUsers();
    } catch (err) {
      window.alert(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const deleteUserAccount = async (targetUser) => {
    if (!window.confirm(`Delete account for ${targetUser.email}? This cannot be undone.`)) {
      return;
    }

    const key = `user-delete-${targetUser.id}`;
    setPendingKey(key);

    try {
      await api.delete(`/api/admin/users/${targetUser.id}`);
      await loadUsers();
    } catch (err) {
      window.alert(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const refreshPolicyConfigOnly = async () => {
    const configRes = await api.get("/api/admin/policy/config");
    const nextConfig = configRes.data?.config || {
      greetingPatterns: [],
      inScopeKeywords: [],
      outOfScopeKeywords: [],
      inScopeIntentPatterns: [],
      messages: {}
    };
    setPolicyConfig(nextConfig);
    setPolicyConfigDraft(nextConfig.messages || {});
  };

  const addPolicyEntry = async (listKey) => {
    const value = String(policyEditorListInput[listKey] || "").trim();
    if (!value) {
      return;
    }
    setPendingKey(`policy-add-${listKey}`);
    setPolicyEditorError("");
    try {
      await api.post(`/api/admin/policy/config/${listKey}`, { value });
      await refreshPolicyConfigOnly();
      setPolicyEditorListInput((prev) => ({ ...prev, [listKey]: "" }));
    } catch (err) {
      setPolicyEditorError(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const editPolicyEntry = async (listKey, index, oldValue) => {
    const replacement = window.prompt("Edit policy entry", oldValue);
    if (replacement === null) {
      return;
    }
    const value = replacement.trim();
    if (!value) {
      return;
    }

    setPendingKey(`policy-edit-${listKey}-${index}`);
    setPolicyEditorError("");
    try {
      await api.patch(`/api/admin/policy/config/${listKey}/${index}`, { value });
      await refreshPolicyConfigOnly();
    } catch (err) {
      setPolicyEditorError(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const deletePolicyEntry = async (listKey, index) => {
    setPendingKey(`policy-del-${listKey}-${index}`);
    setPolicyEditorError("");
    try {
      await api.delete(`/api/admin/policy/config/${listKey}/${index}`);
      await refreshPolicyConfigOnly();
    } catch (err) {
      setPolicyEditorError(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const savePolicyMessages = async () => {
    setPendingKey("policy-save-messages");
    setPolicyEditorError("");
    try {
      await api.put("/api/admin/policy/config", {
        ...policyConfig,
        messages: policyConfigDraft
      });
      await refreshPolicyConfigOnly();
    } catch (err) {
      setPolicyEditorError(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const resetPolicyConfigToDefault = async () => {
    if (!window.confirm("Reset policy configuration to default values?")) {
      return;
    }
    setPendingKey("policy-reset");
    setPolicyEditorError("");
    try {
      await api.post("/api/admin/policy/config/reset");
      await refreshPolicyConfigOnly();
    } catch (err) {
      setPolicyEditorError(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const updateModule = async (moduleId, patch) => {
    const key = `module-${moduleId}`;
    setPendingKey(key);
    try {
      await api.patch(`/api/admin/simulation-modules/${moduleId}`, patch);
      await loadModules();
    } catch (err) {
      window.alert(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const exportPolicyCsv = () => {
    const rows = [
      ["Time", "User", "Code", "Status", "Prompt", "Reason"],
      ...filteredPolicyEvents.map((event) => [
        formatDateTime(event.at),
        event.userEmail || "Unknown",
        event.code || "UNKNOWN",
        event.blocked ? "Blocked" : "Allowed",
        event.message || "",
        event.reason || ""
      ])
    ];

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`policy-events-${stamp}.csv`, rows);
  };

  const maxCompletions = Math.max(1, ...modules.map((m) => Number(m.completions || 0)));

  return (
    <div className="admin-console-root">
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="title">Admin Console</div>
            <div className="sub">System Admin</div>
          </div>

          <div className="nav-section">Main</div>
          {Object.entries(PAGE_META).map(([id, page]) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${activePage === id ? "active" : ""}`}
              onClick={() => setActivePage(id)}
            >
              <span className="nav-icon" aria-hidden="true">•</span>
              {page.nav}
            </button>
          ))}

          <div className="sidebar-footer">
            <div className="avatar">{(user?.firstName || "A").slice(0, 1).toUpperCase()}</div>
            <div className="footer-copy">
              <div className="footer-title">{user?.firstName || "System"} {user?.lastName || "Admin"}</div>
              <div className="footer-sub">{user?.email || "Account"}</div>
            </div>
            <button type="button" className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </aside>

        <section className="main">
          <header className="topbar">
            <div className="topbar-title">{PAGE_META[activePage].title}</div>
            <div className="online-pill">
              <div className="online-dot" />
              System Online
            </div>
          </header>

          <div className="content">
            {error ? <div className="admin-alert error">{error}</div> : null}
            {loading ? <div className="admin-alert">Loading admin data...</div> : null}

            {!loading && activePage === "overview" ? (
              <div className="page active">
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-label">Users</div>
                    <div className="metric-val">{userStats.total}</div>
                    <div className="metric-sub">{userStats.active} active · {userStats.admins} admin</div>
                    <div className="metric-delta delta-up">Active directory synced</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">AI Chats Today</div>
                    <div className="metric-val">{aiChatsToday}</div>
                    <div className="metric-sub">Policy-checked requests</div>
                    <div className="metric-delta delta-up">{policySummary.allowed || 0} allowed total</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Policy Block Rate</div>
                    <div className="metric-val">{policySummary.blockRate || 0}%</div>
                    <div className="metric-sub">{blockedToday} blocked today</div>
                    <div className="metric-delta delta-dn">{policySummary.blocked || 0} blocked total</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Sim Completions</div>
                    <div className="metric-val">{moduleStats.completions}</div>
                    <div className="metric-sub">{moduleStats.total} modules configured</div>
                    <div className="metric-delta delta-up">{moduleStats.hard} hard difficulty</div>
                  </div>
                </div>

                <div className="two-col">
                  <div className="panel">
                    <div className="panel-title">Recent activity <span>latest events</span></div>
                    {recentActivity.length === 0 ? (
                      <div className="activity-item">
                        <div className="activity-text">No activity yet.</div>
                      </div>
                    ) : (
                      recentActivity.map((activity) => (
                        <div className="activity-item" key={activity.id}>
                          <div className={`activity-icon ${activity.type === "blocked" ? "ad" : activity.type === "user" ? "as" : "ai"}`}>
                            {activity.type === "blocked" ? "B" : activity.type === "user" ? "U" : "A"}
                          </div>
                          <div>
                            <div className="activity-text">{activity.text}</div>
                            <div className="activity-time">{formatRelative(activity.at)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div>
                    <div className="panel panel-gap">
                      <div className="panel-title">Top simulation modules <span>by completion</span></div>
                      {topModules.map((module) => {
                        const completions = Number(module.completions || 0);
                        const width = Math.round((completions / maxCompletions) * 100);
                        return (
                          <div className="bar-row" key={module.id}>
                            <div className="bar-label">{module.title}</div>
                            <div className="bar-track">
                              <div className="bar-fill" style={{ width: `${width}%` }} />
                            </div>
                            <div className="bar-count">{completions}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="panel">
                      <div className="panel-title">System health</div>
                      <div className="status-row"><div><span className="status-dot s-green" />API Server</div><div className="status-text success">Online</div></div>
                      <div className="status-row"><div><span className="status-dot s-green" />Database</div><div className="status-text success">Connected</div></div>
                      <div className="status-row"><div><span className="status-dot s-green" />Policy Engine</div><div className="status-text success">Active</div></div>
                      <div className="status-row"><div><span className="status-dot s-amber" />Rate limiter</div><div className="status-text warning">Monitoring</div></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!loading && activePage === "users" ? (
              <div className="page active">
                <div className="toolbar">
                  <div className="search-box">
                    <input
                      value={userQuery}
                      onChange={(event) => setUserQuery(event.target.value)}
                      placeholder="Search users by name or email"
                    />
                  </div>
                  <select className="filter-btn select" value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                    <option value="ALL">All roles</option>
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <select className="filter-btn select" value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value)}>
                    <option value="ALL">All status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                  <button type="button" className="filter-btn create-user-btn" onClick={openCreateUserModal}>
                    + Create User
                  </button>
                </div>

                <table className="table">
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
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No users found.</td>
                      </tr>
                    ) : (
                      filteredUsers.map((targetUser) => {
                        const busyActive = pendingKey === `user-active-${targetUser.id}`;
                        const busyDelete = pendingKey === `user-delete-${targetUser.id}`;
                        const isSelf = targetUser.id === user?.id;

                        return (
                          <tr key={targetUser.id}>
                            <td>
                              <div>{targetUser.firstName} {targetUser.lastName}</div>
                              <div className="user-meta">{formatRelative(targetUser.createdAt)}</div>
                            </td>
                            <td className="muted-cell">{targetUser.email}</td>
                            <td>
                              <span className={`badge ${targetUser.role === "ADMIN" ? "badge-admin" : "badge-user"}`}>
                                {targetUser.role}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${targetUser.isActive ? "badge-active" : "badge-inactive"}`}>
                                {targetUser.isActive ? "ACTIVE" : "INACTIVE"}
                              </span>
                            </td>
                            <td className="muted-cell">{formatDateTime(targetUser.createdAt)}</td>
                            <td>
                              <div className="action-row">
                                <button
                                  type="button"
                                  className="btn-sm"
                                  onClick={() => openEditUserModal(targetUser)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className={`btn-sm ${targetUser.isActive ? "btn-danger" : ""}`}
                                  disabled={busyActive || isSelf}
                                  onClick={() => setUserActiveState(targetUser, !targetUser.isActive)}
                                >
                                  {targetUser.isActive ? "Deactivate" : "Activate"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-sm btn-danger"
                                  disabled={busyDelete || isSelf}
                                  onClick={() => deleteUserAccount(targetUser)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                <div className="pagination">
                  <span>{filteredUsers.length} users shown</span>
                  <span>Page 1 of 1</span>
                </div>
              </div>
            ) : null}

            {!loading && activePage === "policy" ? (
              <div className="page active">
                <div className="filter-bar">
                  <button
                    type="button"
                    className={`filter-chip ${policyStatusFilter === "ALL" ? "active" : ""}`}
                    onClick={() => setPolicyStatusFilter("ALL")}
                  >All</button>
                  <button
                    type="button"
                    className={`filter-chip ${policyStatusFilter === "ALLOWED" ? "active" : ""}`}
                    onClick={() => setPolicyStatusFilter("ALLOWED")}
                  >Allowed</button>
                  <button
                    type="button"
                    className={`filter-chip ${policyStatusFilter === "BLOCKED" ? "active" : ""}`}
                    onClick={() => setPolicyStatusFilter("BLOCKED")}
                  >Blocked</button>

                  <button
                    type="button"
                    className={`filter-chip ${policyTimeFilter === "TODAY" ? "active" : ""}`}
                    onClick={() => setPolicyTimeFilter("TODAY")}
                  >Today</button>
                  <button
                    type="button"
                    className={`filter-chip ${policyTimeFilter === "WEEK" ? "active" : ""}`}
                    onClick={() => setPolicyTimeFilter("WEEK")}
                  >This week</button>
                  <button
                    type="button"
                    className={`filter-chip ${policyTimeFilter === "ALL" ? "active" : ""}`}
                    onClick={() => setPolicyTimeFilter("ALL")}
                  >All time</button>

                  <button type="button" className="filter-btn export" onClick={exportPolicyCsv}>Export</button>
                </div>

                <div className="chart-area">
                  <div className="chart-heading">Policy decisions - current week</div>
                  <div className="mini-bars">
                    {policyWeekChart.points.map((point) => {
                      const allowedHeight = Math.max(4, Math.round((point.allowed / policyWeekChart.peak) * 44));
                      const blockedHeight = Math.max(4, Math.round((point.blocked / policyWeekChart.peak) * 44));
                      return (
                        <div className="mini-bar-pair" key={point.label}>
                          <div className="mini-bar allowed" style={{ height: `${allowedHeight}px` }} />
                          <div className="mini-bar blocked" style={{ height: `${blockedHeight}px` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="chart-labels">
                    {policyWeekChart.points.map((point) => <span key={`lbl-${point.label}`}>{point.label}</span>)}
                  </div>
                </div>

                <div className="event-row event-header">
                  <div>Time</div><div>User</div><div>Code</div><div>Status</div><div>Prompt</div><div>Reason</div>
                </div>
                <div className="event-body">
                  {filteredPolicyEvents.length === 0 ? (
                    <div className="event-row">
                      <div className="prompt-cell" style={{ gridColumn: "1 / -1" }}>No policy events found for the selected filters.</div>
                    </div>
                  ) : (
                    filteredPolicyEvents.map((event) => (
                      <div className="event-row" key={event.id}>
                        <div className="muted-cell">{formatDateTime(event.at)}</div>
                        <div className="muted-cell">{event.userEmail || "Unknown"}</div>
                        <div className="muted-cell">{event.code || "UNKNOWN"}</div>
                        <div>
                          <span className={`badge ${event.blocked ? "badge-blocked" : "badge-allowed"}`}>
                            {event.blocked ? "Blocked" : "Allowed"}
                          </span>
                        </div>
                        <div className="prompt-cell">{event.message || "-"}</div>
                        <div className="reason-cell">{event.reason || "-"}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="policy-editor">
                  <div className="policy-editor-head">
                    <h3>Policy Configuration (Runtime)</h3>
                    <button
                      type="button"
                      className="btn-sm btn-danger"
                      disabled={pendingKey === "policy-reset"}
                      onClick={resetPolicyConfigToDefault}
                    >
                      Reset Default
                    </button>
                  </div>

                  {policyEditorError ? <div className="admin-alert error">{policyEditorError}</div> : null}

                  {Object.entries(POLICY_LIST_META).map(([listKey, label]) => (
                    <div className="policy-list-block" key={listKey}>
                      <div className="policy-list-title">{label}</div>
                      <div className="policy-list-add">
                        <input
                          value={policyEditorListInput[listKey] || ""}
                          onChange={(event) =>
                            setPolicyEditorListInput((prev) => ({ ...prev, [listKey]: event.target.value }))
                          }
                          placeholder={`Add ${label.toLowerCase()} entry`}
                        />
                        <button
                          type="button"
                          className="btn-sm create-user-btn"
                          disabled={pendingKey === `policy-add-${listKey}`}
                          onClick={() => addPolicyEntry(listKey)}
                        >
                          Add
                        </button>
                      </div>
                      <div className="policy-list-items">
                        {(policyConfig[listKey] || []).map((entry, index) => (
                          <div className="policy-item-row" key={`${listKey}-${index}-${entry}`}>
                            <div className="policy-item-text">{entry}</div>
                            <div className="policy-item-actions">
                              <button type="button" className="btn-sm" onClick={() => editPolicyEntry(listKey, index, entry)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-sm btn-danger"
                                onClick={() => deletePolicyEntry(listKey, index)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                        {(policyConfig[listKey] || []).length === 0 ? (
                          <div className="muted-cell">No entries.</div>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  <div className="policy-list-block">
                    <div className="policy-list-title">Policy Messages</div>
                    <div className="policy-message-grid">
                      {Object.entries(policyConfigDraft || {}).map(([key, value]) => (
                        <label key={key} className="policy-message-field">
                          <span>{key}</span>
                          <textarea
                            rows={2}
                            value={value || ""}
                            onChange={(event) =>
                              setPolicyConfigDraft((prev) => ({ ...prev, [key]: event.target.value }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="policy-message-actions">
                      <button
                        type="button"
                        className="btn-sm create-user-btn"
                        disabled={pendingKey === "policy-save-messages"}
                        onClick={savePolicyMessages}
                      >
                        {pendingKey === "policy-save-messages" ? "Saving..." : "Save Messages"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!loading && activePage === "sims" ? (
              <div className="page active">
                <div className="sim-toolbar">
                  <div className="sim-toolbar-title">{moduleStats.total} modules · {moduleStats.hard} hard difficulty</div>
                  <div className="sim-filters">
                    {[
                      { value: "ALL", label: "All" },
                      { value: "Easy", label: "Easy" },
                      { value: "Medium", label: "Medium" },
                      { value: "Hard", label: "Hard" }
                    ].map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className={`filter-chip ${moduleDifficultyFilter === option.value ? "active" : ""}`}
                        onClick={() => setModuleDifficultyFilter(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sim-grid">
                  {filteredModules.map((module) => {
                    const completions = Number(module.completions || 0);
                    const progressWidth = Math.round((completions / maxCompletions) * 100);
                    const pending = pendingKey === `module-${module.id}`;

                    return (
                      <div className="sim-card" key={module.id}>
                        <div className="sim-card-header">
                          <div>
                            <div className="sim-title">{module.title}</div>
                            <div className="sim-cat">{module.category} · {module.difficulty}</div>
                          </div>
                          <div className="sim-controls">
                            <span className={`badge ${module.enabled ? "badge-active" : "badge-inactive"}`}>
                              {module.enabled ? "Enabled" : "Disabled"}
                            </span>
                            <select
                              className="diff-select"
                              value={module.difficulty}
                              disabled={pending}
                              onChange={(event) => updateModule(module.id, { difficulty: event.target.value })}
                            >
                              <option value="Easy">Easy</option>
                              <option value="Medium">Medium</option>
                              <option value="Hard">Hard</option>
                            </select>
                          </div>
                        </div>

                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressWidth}%` }} /></div>

                        <div className="sim-stats">
                          <div className="sim-stat"><strong>{completions}</strong> completions</div>
                          <div className="sim-stat"><strong>{Number(module.passRate || 0)}%</strong> pass rate</div>
                          <div className="sim-stat"><strong>{Number(module.avgSteps || 0).toFixed(1)}</strong> avg steps</div>
                        </div>

                        <div className="sim-actions">
                          <button
                            type="button"
                            className={`btn-sm ${module.enabled ? "btn-danger" : ""}`}
                            disabled={pending}
                            onClick={() => updateModule(module.id, { enabled: !module.enabled })}
                          >
                            {module.enabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {userModalOpen ? (
        <div className="admin-modal-overlay" onClick={closeUserModal}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-head">
              <h3>{userModalMode === "create" ? "Create User Account" : "Edit User Account"}</h3>
              <button type="button" className="btn-sm" onClick={closeUserModal}>X</button>
            </div>

            {userFormError ? <div className="admin-alert error">{userFormError}</div> : null}

            <div className="admin-modal-grid">
              <label className="admin-field">
                <span>First Name</span>
                <input
                  type="text"
                  value={userForm.firstName}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>Last Name</span>
                <input
                  type="text"
                  value={userForm.lastName}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </label>
              <label className="admin-field full">
                <span>Email</span>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>Role</span>
                <select
                  value={userForm.role}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <label className="admin-field">
                <span>Status</span>
                <select
                  value={userForm.isActive ? "ACTIVE" : "INACTIVE"}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, isActive: event.target.value === "ACTIVE" }))}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{userModalMode === "create" ? "Password" : "New Password (optional)"}</span>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>{userModalMode === "create" ? "Confirm Password" : "Confirm New Password"}</span>
                <input
                  type="password"
                  value={userForm.confirmPassword}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                />
              </label>
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="btn-sm" onClick={closeUserModal}>Cancel</button>
              <button
                type="button"
                className="btn-sm create-user-btn"
                disabled={pendingKey === "user-modal-save"}
                onClick={saveUserModal}
              >
                {pendingKey === "user-modal-save" ? "Saving..." : userModalMode === "create" ? "Create User" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

