import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";

function fmtDate(date) {
  try {
    return new Date(date).toLocaleDateString();
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
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/api/admin/users");
      setUsers(response.data.users || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const admins = users.filter((u) => u.role === "ADMIN").length;
    return { total, active, admins };
  }, [users]);

  const updateUser = async (id, payload, confirmText) => {
    if (!window.confirm(confirmText)) {
      return;
    }
    setPendingId(id);
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
    setPendingId(id);
    try {
      await api.delete(`/api/admin/users/${id}`);
      await loadUsers();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="admin-wrap">
      <div className="topbar">
        <div>
          Admin Panel - {user?.firstName} {user?.lastName}
        </div>
        <Link to="/dashboard">Back to Dashboard</Link>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div style={{ color: "var(--text2)" }}>Total Users</div>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--text2)" }}>Active Users</div>
          <strong>{stats.active}</strong>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--text2)" }}>Admin Count</div>
          <strong>{stats.admins}</strong>
        </div>
      </div>

      {error ? <p className="global-error">{error}</p> : null}
      {loading ? (
        <p>Loading users...</p>
      ) : (
        <table className="users-table">
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
                  <td>{fmtDate(u.createdAt)}</td>
                  <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="mini-btn"
                      disabled={pendingId === u.id || isSelf}
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
                      <button className="mini-btn" disabled={pendingId === u.id || isSelf} onClick={() => deactivate(u.id)}>
                        Deactivate
                      </button>
                    ) : (
                      <button
                        className="mini-btn"
                        disabled={pendingId === u.id}
                        onClick={() => updateUser(u.id, { isActive: true }, `Activate ${u.email}?`)}
                      >
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
