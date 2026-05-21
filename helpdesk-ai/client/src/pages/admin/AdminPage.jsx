import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import TerminalEmulator from "../users/Modules/TerminalEmulator";
import macOsPreviewImg from "../../IMG/MAC.jpg";
import windowsOsPreviewImg from "../../IMG/WIN 11.webp";
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
const THEME_STORAGE_KEY = "helpdesk_simulation_theme";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler
);

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

function stripHtml(value = "") {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

function mapSurfaceToTerminalType(surface = "") {
  const value = String(surface || "").toLowerCase();
  if (value === "mac-terminal" || value === "mac-os") {
    return "mac-terminal";
  }
  return "windows-terminal";
}

function mapTerminalTypeToSurface(terminalType = "") {
  return String(terminalType || "").toLowerCase() === "mac-terminal" ? "mac-terminal" : "windows-terminal";
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

function buildFallbackSimulationDefinition(module) {
  const title = String(module?.title || "Simulation Scenario").trim();
  const category = String(module?.category || "General").trim();
  return {
    title,
    scenarioType: "general",
    terminalType: "windows-terminal",
    steps: [
      {
        title: "Collect Incident Context",
        desc: `Capture issue details for <b>${title}</b>.`,
        screen: `> Ticket opened\n> Category: ${category}\n> Scenario: ${title}`,
        action: "Verify impact and reproduction details.",
        result: "Incident context documented."
      },
      {
        title: "Run Baseline Checks",
        desc: "Perform baseline diagnostics to isolate the fault domain.",
        screen: "> Baseline checks in progress...\n> Service / connectivity / logs reviewed",
        action: "Use safe checks before any remediation.",
        result: "Initial diagnostics completed."
      },
      {
        title: "Apply Corrective Action",
        desc: "Execute an approved remediation sequence.",
        screen: "> Corrective commands executed\n> Change log updated",
        action: "Apply one change at a time and monitor output.",
        result: "Remediation applied."
      },
      {
        title: "Validate Recovery",
        desc: "Confirm service restoration and user-facing recovery.",
        screen: "> Validation tests passed\n> User confirmation received",
        action: "Run post-fix checks and confirm no regression.",
        result: "Recovery confirmed."
      },
      {
        title: "Document and Close",
        desc: "Capture root cause, fix summary, and preventive notes.",
        screen: "> Ticket notes updated\n> Closure summary saved",
        action: "Record lessons learned and close ticket.",
        result: "Simulation completed."
      }
    ]
  };
}

function getModuleSimulationDefinition(module) {
  const candidate = module?.simulation;
  if (candidate && Array.isArray(candidate.steps) && candidate.steps.length > 0) {
    return candidate;
  }
  return buildFallbackSimulationDefinition(module);
}

function NavIcon({ id }) {
  if (id === "overview") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 13h8V3H3zM13 21h8v-8h-8zM13 3h8v6h-8zM3 21h8v-6H3z" />
      </svg>
    );
  }
  if (id === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M2 21a6 6 0 0 1 12 0M12 21a7 7 0 0 1 10 0" />
      </svg>
    );
  }
  if (id === "policy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l8 4v6c0 5-3.3 7.9-8 8-4.7-.1-8-3-8-8V7l8-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h8M4 17h12" />
      <path d="M17 12h3v5h-3z" />
    </svg>
  );
}

export default function AdminPage() {
  const { user, logout } = useAuth();
  const api = useAxios();
  const profileMenuRef = useRef(null);

  const [activePage, setActivePage] = useState("overview");
  const [theme, setTheme] = useState("dark");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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
  const [policyWorkspaceTab, setPolicyWorkspaceTab] = useState("decisions");
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
  const [policyConfigOpenMap, setPolicyConfigOpenMap] = useState({
    greetingPatterns: true,
    inScopeKeywords: true,
    outOfScopeKeywords: true,
    inScopeIntentPatterns: true,
    messages: true
  });
  const [policyConfigSearchMap, setPolicyConfigSearchMap] = useState({});

  const [policyQuery, setPolicyQuery] = useState("");
  const [policyCodeFilter, setPolicyCodeFilter] = useState("ALL");
  const [promptInsights, setPromptInsights] = useState([]);
  const [promptInsightsLoading, setPromptInsightsLoading] = useState(false);
  const [promptInsightsError, setPromptInsightsError] = useState("");
  const [promptInsightQuery, setPromptInsightQuery] = useState("");
  const [newModuleForm, setNewModuleForm] = useState({
    title: "",
    category: ""
  });
  const [newModuleError, setNewModuleError] = useState("");
  const [modulePreview, setModulePreview] = useState(null);
  const [modulePreviewStep, setModulePreviewStep] = useState(0);
  const [modulePreviewSurface, setModulePreviewSurface] = useState("windows-terminal");
  const [moduleDraftMeta, setModuleDraftMeta] = useState(null);
  const [moduleDraftError, setModuleDraftError] = useState("");
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
      api.get("/api/admin/policy/events?limit=1000"),
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

  const loadPromptInsights = useCallback(async () => {
    setPromptInsightsLoading(true);
    setPromptInsightsError("");
    try {
      const res = await api.get("/api/admin/simulation-modules/prompt-insights?limit=200");
      setPromptInsights(Array.isArray(res.data?.insights) ? res.data.insights : []);
    } catch (err) {
      setPromptInsightsError(safeError(err));
    } finally {
      setPromptInsightsLoading(false);
    }
  }, [api]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      await Promise.all([loadUsers(), loadPolicy(), loadModules(), loadPromptInsights()]);
    } catch (err) {
      setError(safeError(err));
    } finally {
      setLoading(false);
    }
  }, [loadModules, loadPolicy, loadPromptInsights, loadUsers]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  const userStats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const admins = users.filter((u) => u.role === "ADMIN").length;
    return { total, active, admins };
  }, [users]);

  const moduleStats = useMemo(() => {
    const total = modules.length;
    const enabled = modules.filter((m) => m.enabled).length;
    const completions = modules.reduce((sum, m) => sum + Number(m.completions || 0), 0);
    return { total, enabled, completions };
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
    const query = policyQuery.trim().toLowerCase();
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
      const codePass = policyCodeFilter === "ALL" || (event.code || "UNKNOWN") === policyCodeFilter;
      const queryPass =
        !query ||
        String(event.userEmail || "").toLowerCase().includes(query) ||
        String(event.message || "").toLowerCase().includes(query) ||
        String(event.reason || "").toLowerCase().includes(query) ||
        String(event.code || "").toLowerCase().includes(query);

      return statusPass && timePass && codePass && queryPass;
    });
  }, [policyEvents, policyStatusFilter, policyTimeFilter, todayStart, weekStart, policyCodeFilter, policyQuery]);

  const aiResponseWeekChart = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const weekStartDate = new Date();
    weekStartDate.setHours(0, 0, 0, 0);
    weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay());
    const points = Array.from({ length: 7 }).map((_, index) => {
      const dayStart = new Date(weekStartDate.getTime() + index * dayMs);
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const count = policyEvents.filter((event) => {
        const at = new Date(event.at).getTime();
        return at >= dayStart.getTime() && at < dayEnd.getTime();
      }).length;
      return {
        label: dayStart.toLocaleDateString([], { weekday: "short" }),
        count
      };
    });
    return {
      labels: points.map((point) => point.label),
      counts: points.map((point) => point.count)
    };
  }, [policyEvents]);

  const policyCodeOptions = useMemo(() => {
    const codes = new Set(policyEvents.map((event) => event.code || "UNKNOWN"));
    return ["ALL", ...Array.from(codes)];
  }, [policyEvents]);

  const topModules = useMemo(() => {
    return [...modules]
      .sort((a, b) => Number(b.completions || 0) - Number(a.completions || 0))
      .slice(0, 5)
      .map((module, index) => ({
        ...module,
        rank: index + 1,
        completions: Number(module.completions || 0)
      }));
  }, [modules]);

  const aiResponseLineData = useMemo(() => {
    const lineColor = theme === "light" ? "#0284c7" : "#38bdf8";
    const fillColor = theme === "light" ? "rgba(2, 132, 199, 0.12)" : "rgba(56, 189, 248, 0.16)";
    return {
      labels: aiResponseWeekChart.labels,
      datasets: [
        {
          data: aiResponseWeekChart.counts,
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 2.4,
          fill: true,
          tension: 0.52,
          cubicInterpolationMode: "monotone",
          pointRadius: 0,
          pointHoverRadius: 4.5,
          pointBorderWidth: 0
        }
      ]
    };
  }, [aiResponseWeekChart, theme]);

  const aiResponseLineOptions = useMemo(() => {
    const axisText = theme === "light" ? "#475569" : "#8b949e";
    const gridColor = theme === "light" ? "rgba(148, 163, 184, 0.35)" : "rgba(48, 54, 61, 0.6)";
    const tooltipBg = theme === "light" ? "#ffffff" : "#0d1117";
    const tooltipBorder = theme === "light" ? "#cbd5e1" : "#30363d";
    const tooltipText = theme === "light" ? "#0f172a" : "#e6edf3";
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          displayColors: false,
          callbacks: {
            label: (context) => `${context.raw} responses`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: axisText, font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: axisText,
            precision: 0,
            font: { size: 10 }
          },
          grid: { color: gridColor }
        }
      }
    };
  }, [theme]);

  const topModulesBarData = useMemo(() => {
    const barColor = theme === "light" ? "rgba(2, 132, 199, 0.75)" : "rgba(56, 189, 248, 0.85)";
    const barBorder = theme === "light" ? "rgba(2, 132, 199, 0.95)" : "rgba(56, 189, 248, 1)";
    return {
      labels: topModules.map((module) => `#${module.rank}`),
      datasets: [
        {
          data: topModules.map((module) => module.completions),
          backgroundColor: barColor,
          borderColor: barBorder,
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 34
        }
      ]
    };
  }, [topModules, theme]);

  const topModulesBarOptions = useMemo(() => {
    const axisText = theme === "light" ? "#475569" : "#8b949e";
    const xText = theme === "light" ? "#0369a1" : "#38bdf8";
    const gridColor = theme === "light" ? "rgba(148, 163, 184, 0.35)" : "rgba(48, 54, 61, 0.6)";
    const tooltipBg = theme === "light" ? "#ffffff" : "#0d1117";
    const tooltipBorder = theme === "light" ? "#cbd5e1" : "#30363d";
    const tooltipText = theme === "light" ? "#0f172a" : "#e6edf3";
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const module = topModules[items[0].dataIndex];
              return module ? `#${module.rank} ${module.title}` : "";
            },
            label: (context) => `${context.raw} completions`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: xText, font: { size: 10, weight: "700" } }
        },
        y: {
          beginAtZero: true,
          ticks: { color: axisText, precision: 0, font: { size: 10 } },
          grid: { color: gridColor }
        }
      }
    };
  }, [theme, topModules]);

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

  const policyMessagesDirty = useMemo(() => {
    const current = JSON.stringify(policyConfig.messages || {});
    const draft = JSON.stringify(policyConfigDraft || {});
    return current !== draft;
  }, [policyConfig.messages, policyConfigDraft]);

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

  const openModulePreview = (preview, options = {}) => {
    if (!preview || !Array.isArray(preview.steps) || preview.steps.length === 0) {
      return;
    }
    setModulePreview(preview);
    setModulePreviewStep(0);
    setModulePreviewSurface(mapTerminalTypeToSurface(options?.surface || preview?.terminalType));
    setModuleDraftMeta(options?.draftMeta || null);
    setModuleDraftError("");
  };

  const closeModulePreview = () => {
    setModulePreview(null);
    setModulePreviewStep(0);
    setModulePreviewSurface("windows-terminal");
    setModuleDraftMeta(null);
    setModuleDraftError("");
  };

  const createModuleFromPromptInsight = async (insight) => {
    if (!insight?.samplePrompt) {
      return;
    }
    const key = `module-draft-from-prompt-${insight.normalized || insight.samplePrompt}`;
    setPendingKey(key);
    try {
      const res = await api.post("/api/admin/simulation-modules/draft", {
        mode: "from_prompt",
        sourcePrompt: insight.samplePrompt,
        occurrences: Number(insight.occurrences || 1)
      });
      const draft = res.data?.draft;
      if (!draft) {
        throw new Error("Unable to generate simulation draft.");
      }
      openModulePreview(getModuleSimulationDefinition(draft), {
        draftMeta: {
          mode: "from_prompt",
          sourcePrompt: insight.samplePrompt,
          occurrences: Number(insight.occurrences || 1),
          title: draft.title,
          category: draft.category
        }
      });
    } catch (err) {
      window.alert(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const disregardPromptInsight = async (insight) => {
    const prompt = String(insight?.samplePrompt || "").trim();
    if (!prompt) {
      return;
    }
    const key = `module-disregard-prompt-${insight.normalized || prompt}`;
    setPendingKey(key);
    try {
      await api.post("/api/admin/simulation-modules/prompt-insights/disregard", {
        sourcePrompt: prompt
      });
      setPromptInsights((prev) =>
        prev.filter((item) => item.normalized !== insight.normalized && item.samplePrompt !== prompt)
      );
    } catch (err) {
      window.alert(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const createManualModule = async () => {
    const title = String(newModuleForm.title || "").trim();
    const category = String(newModuleForm.category || "").trim();
    if (!title || !category) {
      setNewModuleError("Title and category are required.");
      return;
    }
    setNewModuleError("");
    setPendingKey("module-create-manual");
    try {
      await api.post("/api/admin/simulation-modules", {
        mode: "manual",
        title,
        category,
        enabled: true
      });
      setNewModuleForm({ title: "", category: "" });
      await loadModules();
    } catch (err) {
      setNewModuleError(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const saveModuleDraft = async () => {
    if (!moduleDraftMeta || !modulePreview) {
      return;
    }
    const steps = Array.isArray(modulePreview.steps) ? modulePreview.steps : [];
    if (steps.length < 3) {
      setModuleDraftError("Simulation draft must include at least 3 steps before saving.");
      return;
    }
    setPendingKey("module-save-draft");
    setModuleDraftError("");
    try {
      await api.post("/api/admin/simulation-modules", {
        mode: "manual",
        title: moduleDraftMeta.title,
        category: moduleDraftMeta.category,
        sourcePrompt: moduleDraftMeta.sourcePrompt,
        simulation: {
          ...modulePreview,
          terminalType: mapSurfaceToTerminalType(modulePreviewSurface)
        },
        enabled: true
      });
      closeModulePreview();
      await Promise.all([loadModules(), loadPromptInsights()]);
    } catch (err) {
      setModuleDraftError(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const deleteSimulationModule = async (module) => {
    if (!module?.id) {
      return;
    }
    if (!window.confirm(`Delete simulation module "${module.title}"?`)) {
      return;
    }
    const key = `module-delete-${module.id}`;
    setPendingKey(key);
    try {
      await api.delete(`/api/admin/simulation-modules/${module.id}`);
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
  const filteredPromptInsights = useMemo(() => {
    const query = promptInsightQuery.trim().toLowerCase();
    if (!query) {
      return promptInsights;
    }
    return promptInsights.filter((item) => {
      return (
        String(item.samplePrompt || "").toLowerCase().includes(query) ||
        String(item.suggestedCategory || "").toLowerCase().includes(query)
      );
    });
  }, [promptInsightQuery, promptInsights]);

  const previewSteps = Array.isArray(modulePreview?.steps) ? modulePreview.steps : [];
  const previewTotalSteps = previewSteps.length;
  const previewSafeStep = Math.max(0, Math.min(modulePreviewStep, Math.max(0, previewTotalSteps - 1)));
  const previewCurrentStep = previewSteps[previewSafeStep] || {};
  const previewProgress = previewTotalSteps > 0
    ? Math.round(((previewSafeStep + 1) / previewTotalSteps) * 100)
    : 0;
  const previewSurfaceOptions = [
    { value: "windows-terminal", label: "Win", icon: ">_" },
    { value: "mac-terminal", label: "Mac", icon: "$_" },
    { value: "windows-os", label: "Win OS", icon: "W" },
    { value: "mac-os", label: "Mac OS", icon: "M" }
  ];
  const isDraftPreview = Boolean(moduleDraftMeta);
  const previewRuntimeHint = stripHtml(previewCurrentStep.action || previewCurrentStep.desc || "");

  const handleAdminRuntimeTerminalCommand = useCallback(
    ({ normalizedCommand, result }) => {
      if (!isDraftPreview) {
        if (normalizedCommand === "help") {
          const lines = [`Simulation context: ${previewCurrentStep.title || "Current step"}`];
          if (previewRuntimeHint) {
            lines.push(`Hint: ${previewRuntimeHint}`);
          }
          if (previewCurrentStep.result) {
            lines.push(`Expected outcome: ${previewCurrentStep.result}`);
          }
          return lines;
        }

        if (result?.known) {
          return previewCurrentStep.result ? [`Step outcome: ${previewCurrentStep.result}`] : [];
        }

        if (previewRuntimeHint) {
          return [`Hint: ${previewRuntimeHint}`];
        }
      }

      return [];
    },
    [isDraftPreview, previewCurrentStep, previewRuntimeHint]
  );

  return (
    <div className={`admin-console-root ${theme === "light" ? "theme-light" : ""}`}>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="admin-brand">
              <div className="admin-brand-icon">HS</div>
              <div className="admin-brand-text">
                Help Desk
                <span>Support</span>
              </div>
            </div>
          </div>

          <div className="nav-section">Main</div>
          {Object.entries(PAGE_META).map(([id, page]) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${activePage === id ? "active" : ""}`}
              onClick={() => setActivePage(id)}
            >
              <span className="nav-icon" aria-hidden="true"><NavIcon id={id} /></span>
              {page.nav}
            </button>
          ))}

          <div className="sidebar-footer" ref={profileMenuRef}>
            <button
              type="button"
              className="profile-trigger"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
            >
              <div className="avatar">{(user?.firstName || "A").slice(0, 1).toUpperCase()}</div>
              <div className="footer-copy">
                <div className="footer-title">{user?.firstName || "System"} {user?.lastName || "Admin"}</div>
                <div className="footer-sub">{user?.email || "Account"}</div>
              </div>
              <span className="profile-caret" aria-hidden="true">{profileMenuOpen ? "â–²" : "â–¼"}</span>
            </button>

            {profileMenuOpen ? (
              <div className="profile-menu" role="menu">
                <div className="profile-menu-label">Preferences</div>
                <div className="profile-menu-row">
                  <span>Light Mode</span>
                  <button
                    type="button"
                    className={`profile-theme-switch ${theme === "light" ? "is-on" : ""}`}
                    onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                    aria-label="Toggle light mode"
                    aria-pressed={theme === "light"}
                  >
                    <span className="profile-theme-track">
                      <span className="profile-theme-thumb" />
                    </span>
                    <span className="profile-theme-state">{theme === "light" ? "On" : "Off"}</span>
                  </button>
                </div>
                <button type="button" className="logout-btn profile-logout-btn" onClick={logout}>Logout</button>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="main">
          <header className="admin-topbar">
            <div className="admin-topbar-title">{PAGE_META[activePage].title}</div>
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
                    <div className="metric-sub">{userStats.active} active Â· {userStats.admins} admin</div>
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
                    <div className="metric-delta delta-up">{moduleStats.enabled} enabled</div>
                  </div>
                </div>

                <div className="overview-grid">
                  <div className="panel overview-ai-panel">
                    <div className="panel-title">AI responses (Sun-Sat) <span>whole platform</span></div>
                    <div className="overview-chart-shell">
                      <Line data={aiResponseLineData} options={aiResponseLineOptions} />
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-title">Top simulation modules <span>vertical ranking</span></div>
                    <div className="overview-chart-shell topmods-chart-shell">
                      <Bar data={topModulesBarData} options={topModulesBarOptions} />
                    </div>
                    <div className="topmods-legend">
                      {topModules.map((module) => (
                        <div key={`topmods-legend-${module.id}`} className="topmods-legend-item">
                          <span>#{module.rank}</span>
                          <strong>{module.title}</strong>
                          <em>{module.completions}</em>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overview-grid overview-grid-equal">
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

                  <div className="panel">
                    <div className="panel-title">System health</div>
                    <div className="status-row"><div><span className="status-dot s-green" />API Server</div><div className="status-text success">Online</div></div>
                    <div className="status-row"><div><span className="status-dot s-green" />Database</div><div className="status-text success">Connected</div></div>
                    <div className="status-row"><div><span className="status-dot s-green" />Policy Engine</div><div className="status-text success">Active</div></div>
                    <div className="status-row"><div><span className="status-dot s-amber" />Rate limiter</div><div className="status-text warning">Monitoring</div></div>
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
                <div className="policy-kpi-grid">
                  <div className="policy-kpi-card">
                    <span>Total Decisions</span>
                    <strong>{policySummary.total || 0}</strong>
                  </div>
                  <div className="policy-kpi-card">
                    <span>Allowed</span>
                    <strong>{policySummary.allowed || 0}</strong>
                  </div>
                  <div className="policy-kpi-card">
                    <span>Blocked</span>
                    <strong>{policySummary.blocked || 0}</strong>
                  </div>
                  <div className="policy-kpi-card">
                    <span>Block Rate</span>
                    <strong>{policySummary.blockRate || 0}%</strong>
                  </div>
                </div>

                <div className="policy-workspace-tabs" role="tablist" aria-label="Policy workspace">
                  <button
                    type="button"
                    className={`policy-workspace-tab ${policyWorkspaceTab === "decisions" ? "active" : ""}`}
                    role="tab"
                    aria-selected={policyWorkspaceTab === "decisions"}
                    onClick={() => setPolicyWorkspaceTab("decisions")}
                  >
                    Decisions
                  </button>
                  <button
                    type="button"
                    className={`policy-workspace-tab ${policyWorkspaceTab === "configuration" ? "active" : ""}`}
                    role="tab"
                    aria-selected={policyWorkspaceTab === "configuration"}
                    onClick={() => setPolicyWorkspaceTab("configuration")}
                  >
                    Configuration
                  </button>
                </div>

                {policyWorkspaceTab === "decisions" ? (
                  <div className="policy-workspace policy-workspace-stacked">
                    <div className="policy-decisions">
                      <div className="policy-workspace-head">
                        <div className="policy-workspace-title">Policy Decisions</div>
                        <div className="policy-results-count">{filteredPolicyEvents.length} events</div>
                      </div>
                      <div className="policy-filter-grid">
                        <input
                          className="policy-search-input"
                          placeholder="Search prompt, reason, user, or code"
                          value={policyQuery}
                          onChange={(event) => setPolicyQuery(event.target.value)}
                        />
                        <select className="filter-btn select" value={policyCodeFilter} onChange={(event) => setPolicyCodeFilter(event.target.value)}>
                          {policyCodeOptions.map((code) => (
                            <option key={code} value={code}>{code === "ALL" ? "All codes" : code}</option>
                          ))}
                        </select>
                        <select className="filter-btn select" value={policyStatusFilter} onChange={(event) => setPolicyStatusFilter(event.target.value)}>
                          <option value="ALL">All status</option>
                          <option value="ALLOWED">Allowed</option>
                          <option value="BLOCKED">Blocked</option>
                        </select>
                        <select className="filter-btn select" value={policyTimeFilter} onChange={(event) => setPolicyTimeFilter(event.target.value)}>
                          <option value="ALL">All time</option>
                          <option value="TODAY">Today</option>
                          <option value="WEEK">This week</option>
                        </select>
                        <button type="button" className="filter-btn export" onClick={exportPolicyCsv}>Export CSV</button>
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
                    </div>
                  </div>
                ) : (
                  <div className="policy-workspace policy-workspace-stacked">
                    <div className="policy-editor policy-editor-full">
                      <div className="policy-editor-head">
                        <h3>Policy Configuration (Runtime)</h3>
                        <span className="policy-editor-hint">Use collapsible sections for large rule sets</span>
                      </div>

                      {policyEditorError ? <div className="admin-alert error">{policyEditorError}</div> : null}

                      <div className="policy-config-grid">
                        {Object.entries(POLICY_LIST_META).map(([listKey, label]) => {
                          const listEntries = policyConfig[listKey] || [];
                          const query = String(policyConfigSearchMap[listKey] || "").trim().toLowerCase();
                          const filteredEntries = listEntries
                            .map((entry, index) => ({ entry, index }))
                            .filter((item) => String(item.entry || "").toLowerCase().includes(query));
                          const isOpen = policyConfigOpenMap[listKey] !== false;
                          return (
                            <div className="policy-list-block" key={listKey}>
                              <button
                                type="button"
                                className="policy-list-head"
                                onClick={() => setPolicyConfigOpenMap((prev) => ({ ...prev, [listKey]: !isOpen }))}
                                aria-expanded={isOpen}
                              >
                                <div className="policy-list-title">{label}</div>
                                <div className="policy-list-head-right">
                                  <span className="policy-list-count">{listEntries.length}</span>
                                  <span className="policy-list-caret">{isOpen ? "v" : ">"}</span>
                                </div>
                              </button>
                              {isOpen ? (
                                <>
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
                                  <input
                                    className="policy-list-search"
                                    value={policyConfigSearchMap[listKey] || ""}
                                    onChange={(event) =>
                                      setPolicyConfigSearchMap((prev) => ({ ...prev, [listKey]: event.target.value }))
                                    }
                                    placeholder={`Search ${label.toLowerCase()}`}
                                  />
                                  <div className="policy-list-items">
                                    {filteredEntries.map(({ entry, index }) => (
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
                                    {listEntries.length === 0 ? <div className="muted-cell">No entries.</div> : null}
                                    {listEntries.length > 0 && filteredEntries.length === 0 ? (
                                      <div className="muted-cell">No matching entries.</div>
                                    ) : null}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      <div className="policy-list-block">
                        <button
                          type="button"
                          className="policy-list-head"
                          onClick={() => setPolicyConfigOpenMap((prev) => ({ ...prev, messages: !prev.messages }))}
                          aria-expanded={policyConfigOpenMap.messages !== false}
                        >
                          <div className="policy-list-title">Policy Messages</div>
                          <div className="policy-list-head-right">
                            <span className="policy-list-count">{Object.keys(policyConfigDraft || {}).length}</span>
                            <span className="policy-list-caret">{policyConfigOpenMap.messages !== false ? "v" : ">"}</span>
                          </div>
                        </button>
                        {policyConfigOpenMap.messages !== false ? (
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
                        ) : null}
                      </div>

                      <div className="policy-sticky-bar">
                        <div className={`policy-sticky-state ${policyMessagesDirty ? "dirty" : ""}`}>
                          {policyMessagesDirty ? "Unsaved message changes" : "All message changes saved"}
                        </div>
                        <div className="policy-sticky-actions">
                          <button
                            type="button"
                            className="btn-sm btn-danger"
                            disabled={pendingKey === "policy-reset"}
                            onClick={resetPolicyConfigToDefault}
                          >
                            {pendingKey === "policy-reset" ? "Resetting..." : "Reset Default"}
                          </button>
                          <button
                            type="button"
                            className="btn-sm create-user-btn"
                            disabled={pendingKey === "policy-save-messages" || !policyMessagesDirty}
                            onClick={savePolicyMessages}
                          >
                            {pendingKey === "policy-save-messages" ? "Saving..." : "Save Messages"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {!loading && activePage === "sims" ? (
              <div className="page active">
                <div className="sim-toolbar">
                  <div className="sim-toolbar-title">{moduleStats.total} modules · {moduleStats.enabled} enabled</div>
                </div>


                <div className="panel sim-create-panel">
                  <div className="panel-title">Create Simulation Module <span>manual</span></div>
                  {newModuleError ? <div className="admin-alert error">{newModuleError}</div> : null}
                  <div className="sim-create-grid">
                    <input
                      className="policy-search-input"
                      value={newModuleForm.title}
                      onChange={(event) => setNewModuleForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Module title"
                    />
                    <input
                      className="policy-search-input"
                      value={newModuleForm.category}
                      onChange={(event) => setNewModuleForm((prev) => ({ ...prev, category: event.target.value }))}
                      placeholder="Category (e.g. Network, Email, Security)"
                    />
                    <button
                      type="button"
                      className="btn-sm create-user-btn"
                      disabled={pendingKey === "module-create-manual"}
                      onClick={createManualModule}
                    >
                      {pendingKey === "module-create-manual" ? "Creating..." : "Create Module"}
                    </button>
                  </div>
                </div>
                <div className="panel sim-prompt-monitor">
                  <div className="panel-title">
                    Prompt Monitoring · AI Module Suggestions
                    <span>{filteredPromptInsights.length} patterns</span>
                  </div>
                  <div className="sim-prompt-toolbar">
                    <input
                      className="policy-search-input"
                      value={promptInsightQuery}
                      onChange={(event) => setPromptInsightQuery(event.target.value)}
                      placeholder="Search prompt patterns"
                    />
                    <button
                      type="button"
                      className="btn-sm"
                      disabled={promptInsightsLoading}
                      onClick={loadPromptInsights}
                    >
                      {promptInsightsLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {promptInsightsError ? <div className="admin-alert error">{promptInsightsError}</div> : null}
                  <div className="sim-prompt-grid">
                    {filteredPromptInsights.length === 0 ? (
                      <div className="muted-cell">No repeated prompt patterns yet.</div>
                    ) : (
                      filteredPromptInsights.map((insight) => {
                        const createKey = `module-draft-from-prompt-${insight.normalized || insight.samplePrompt}`;
                        const disregardKey = `module-disregard-prompt-${insight.normalized || insight.samplePrompt}`;
                        const creating = pendingKey === createKey;
                        const disregarding = pendingKey === disregardKey;
                        return (
                          <div className="sim-prompt-card" key={insight.normalized || insight.samplePrompt}>
                            <div className="sim-prompt-text">{insight.samplePrompt}</div>
                            <div className="sim-prompt-meta">
                              <span>{insight.occurrences} occurrences</span>
                              <span>{insight.uniqueUsers} users</span>
                              <span>{insight.suggestedCategory}</span>
                              <span>Last {formatRelative(insight.lastSeen)}</span>
                            </div>
                            <div className="sim-prompt-actions">
                              <button
                                type="button"
                                className="btn-sm create-user-btn"
                                disabled={creating || disregarding}
                                onClick={() => createModuleFromPromptInsight(insight)}
                              >
                                {creating ? "Generating..." : "Generate AI Draft"}
                              </button>
                              <button
                                type="button"
                                className="btn-sm btn-danger"
                                disabled={creating || disregarding}
                                onClick={() => disregardPromptInsight(insight)}
                              >
                                {disregarding ? "Disregarding..." : "Disregard"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="sim-grid">
                  {modules.map((module) => {
                    const completions = Number(module.completions || 0);
                    const progressWidth = Math.round((completions / maxCompletions) * 100);
                    const pending = pendingKey === `module-${module.id}`;
                    const deleting = pendingKey === `module-delete-${module.id}`;

                    return (
                      <div className="sim-card" key={module.id}>
                        <div className="sim-card-header">
                          <div>
                            <div className="sim-title">{module.title}</div>
                            <div className="sim-cat">{module.category}</div>
                          </div>
                          <div className="sim-controls">
                            <span className={`badge ${module.enabled ? "badge-active" : "badge-inactive"}`}>
                              {module.enabled ? "Enabled" : "Disabled"}
                            </span>
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
                            className="btn-sm"
                            onClick={() =>
                              openModulePreview(getModuleSimulationDefinition(module), {
                                surface: module?.simulation?.terminalType
                              })
                            }
                          >
                            View Simulation
                          </button>
                          <button
                            type="button"
                            className={`btn-sm ${module.enabled ? "btn-danger" : ""}`}
                            disabled={pending}
                            onClick={() => updateModule(module.id, { enabled: !module.enabled })}
                          >
                            {module.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            className="btn-sm btn-danger"
                            disabled={deleting}
                            onClick={() => deleteSimulationModule(module)}
                          >
                            {deleting ? "Deleting..." : "Delete"}
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

      {modulePreview ? (
        <div className="admin-modal-overlay" onClick={closeModulePreview}>
          <div className="admin-modal sim-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sim-preview-topbar">
              <div className="sim-preview-topbar-left">
                <div className="sim-preview-window-dots" aria-hidden="true">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>
                <div className="sim-preview-module-title">
                  <span>{modulePreview.title}</span> · {isDraftPreview ? "AI Module" : "Simulation"}
                </div>
              </div>
              <div className="sim-preview-topbar-right">
                <span className="sim-preview-step-pill">Step {previewTotalSteps === 0 ? 0 : previewSafeStep + 1} of {previewTotalSteps}</span>
                <span className="sim-preview-tag">{modulePreview.scenarioType || "general"}</span>
                <button type="button" className="btn-sm" onClick={closeModulePreview}>X</button>
              </div>
            </div>

            {moduleDraftError ? <div className="admin-alert error">{moduleDraftError}</div> : null}

            {isDraftPreview ? (
              <>
                <div className="sim-preview-body">
                  <aside className="sim-preview-sidebar">
                    <div className="sim-preview-progress-track">
                      <div className="sim-preview-progress-fill" style={{ width: `${previewProgress}%` }} />
                    </div>
                    {previewSteps.map((step, index) => (
                      <button
                        key={`${step.title}-${index}`}
                        type="button"
                        className={`sim-preview-step ${index < previewSafeStep ? "done" : index === previewSafeStep ? "active" : "todo"}`}
                        onClick={() => setModulePreviewStep(index)}
                      >
                        <span className="sim-preview-step-num">{index + 1}</span>
                        <span className="sim-preview-step-copy">
                          <span className="sim-preview-step-label">{step.title}</span>
                          {step.action ? <span className="sim-preview-step-sub">{step.action}</span> : null}
                        </span>
                      </button>
                    ))}
                  </aside>

                  <main className="sim-preview-main">
                    <div className="sim-preview-main-content">
                      <div className="sim-preview-title">{previewCurrentStep.title || "No step available"}</div>
                      <div
                        className="sim-preview-desc"
                        dangerouslySetInnerHTML={{ __html: previewCurrentStep.desc || "" }}
                      />
                      <div className="sim-preview-scenario-box">
                        <div className="sim-preview-scenario-label">Scenario</div>
                        <pre>{previewCurrentStep.screen || "No simulated screen output."}</pre>
                      </div>
                      <div className="sim-preview-info-row">
                        <div className="sim-preview-info-card action-card">
                          <div className="sim-preview-info-card-label">Action</div>
                          <div className="sim-preview-info-card-value">{previewCurrentStep.action || "N/A"}</div>
                        </div>
                        <div className="sim-preview-info-card result-card">
                          <div className="sim-preview-info-card-label">Result</div>
                          <div className="sim-preview-info-card-value">{previewCurrentStep.result || "No result provided."}</div>
                        </div>
                      </div>
                    </div>
                  </main>

                  <aside className="sim-preview-right">
                    <div className="sim-preview-sim-header">
                      <div className="sim-preview-sim-title">Simulation Surface</div>
                      <div className="sim-preview-env-label">Environment</div>
                      <div className="sim-preview-env-options">
                        {previewSurfaceOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`sim-preview-env-btn ${modulePreviewSurface === option.value ? "active" : ""}`}
                            onClick={() => setModulePreviewSurface(option.value)}
                          >
                            <span className="sim-preview-env-icon">{option.icon}</span>
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sim-preview-sim-frame">
                      {modulePreviewSurface === "windows-terminal" || modulePreviewSurface === "mac-terminal" ? (
                        <div className="sim-preview-terminal-window">
                          <div className="sim-preview-terminal-head">
                            <span className="dot red" />
                            <span className="dot yellow" />
                            <span className="dot green" />
                            <strong>{modulePreviewSurface === "windows-terminal" ? "Windows Terminal" : "Mac Terminal"}</strong>
                          </div>
                          <pre>
{modulePreviewSurface === "windows-terminal"
  ? `Microsoft Windows [Version 10.0.22631]
C:\\Users\\student> rem Simulation preview only
C:\\Users\\student> echo ${previewCurrentStep.title || "Ready"}
${previewCurrentStep.title || "Ready"}
C:\\Users\\student> _`
  : `MacBook-Pro:~ student$ # Simulation preview only
MacBook-Pro:~ student$ echo ${previewCurrentStep.title || "Ready"}
${previewCurrentStep.title || "Ready"}
MacBook-Pro:~ student$ _`}
                          </pre>
                        </div>
                      ) : (
                        <div className="sim-preview-surface-image-wrap">
                          <img
                            className="sim-preview-surface-image"
                            src={modulePreviewSurface === "windows-os" ? windowsOsPreviewImg : macOsPreviewImg}
                            alt={modulePreviewSurface === "windows-os" ? "Windows OS simulation preview" : "Mac OS simulation preview"}
                          />
                        </div>
                      )}
                    </div>
                    <div className="sim-preview-terminal-note">Visual preview only · No terminal actions wired yet</div>
                  </aside>
                </div>

                <div className="sim-preview-footer">
                  <div className="sim-preview-footer-left">
                    <div className="sim-preview-step-dots" aria-hidden="true">
                      {previewSteps.map((step, index) => (
                        <span
                          key={`dot-${step.title}-${index}`}
                          className={`sim-preview-step-dot ${index < previewSafeStep ? "done" : index === previewSafeStep ? "active" : "todo"}`}
                        />
                      ))}
                    </div>
                    <span className="sim-preview-footer-nav">{previewTotalSteps === 0 ? 0 : previewSafeStep + 1} of {previewTotalSteps}</span>
                  </div>
                  <div className="sim-preview-btn-row">
                    <button type="button" className="btn-sm" onClick={closeModulePreview}>
                      Discard Draft
                    </button>
                    <button
                      type="button"
                      className="btn-sm create-user-btn"
                      disabled={pendingKey === "module-save-draft"}
                      onClick={saveModuleDraft}
                    >
                      {pendingKey === "module-save-draft" ? "Saving..." : "Approve & Save Module"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="sim-runtime-body">
                  <aside className="sim-runtime-steps">
                    <h3>Simulation Steps</h3>
                    <div className="sim-runtime-step-list">
                      {previewSteps.map((step, index) => (
                        <button
                          key={`runtime-step-${step.title}-${index}`}
                          type="button"
                          className={`sim-runtime-step ${index === previewSafeStep ? "active" : ""}`}
                          onClick={() => setModulePreviewStep(index)}
                        >
                          <span className="sim-runtime-step-num">{index + 1}</span>
                          <span className="sim-runtime-step-copy">
                            <span className="sim-runtime-step-title">{step.title}</span>
                            {step.action ? <span className="sim-runtime-step-sub">{step.action}</span> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  </aside>

                  <section className="sim-runtime-canvas">
                    <h3>Simulation Canvas</h3>
                    <div className="sim-runtime-status-row">
                      <span className="sim-runtime-status-pill">Scenario: {(modulePreview.scenarioType || "general").toUpperCase()}</span>
                      <span className="sim-runtime-status-pill">In Progress | {previewProgress}%</span>
                    </div>

                    <div className="sim-runtime-current">
                      <div className="sim-runtime-current-label">Current Step</div>
                      <div className="sim-runtime-current-head">
                        <span className="sim-runtime-current-num">{previewTotalSteps === 0 ? 0 : previewSafeStep + 1}</span>
                        <span className="sim-runtime-current-title">{previewCurrentStep.title || "No step available"}</span>
                      </div>
                      <div className="sim-runtime-current-text">{previewCurrentStep.action || "No action provided."}</div>
                      {previewCurrentStep.desc ? (
                        <div className="sim-runtime-current-text sim-runtime-current-subtext" dangerouslySetInnerHTML={{ __html: previewCurrentStep.desc }} />
                      ) : null}
                    </div>

                    <div className="sim-runtime-terminal">
                      <div className="sim-preview-terminal-head">
                        <span className="dot red" />
                        <span className="dot yellow" />
                        <span className="dot green" />
                        <strong>Helpdesk Terminal</strong>
                      </div>
                      <TerminalEmulator
                        className="sim-runtime-terminal-body"
                        initialMessage="Windows Terminal simulation ready. Type 'help' for available commands."
                        username="student"
                        hostname="DESKTOP-SIM"
                        initialPath="C:\\Users\\student"
                        onCommand={handleAdminRuntimeTerminalCommand}
                      />
                    </div>
                  </section>
                </div>

                <div className="sim-runtime-footer">
                  <button type="button" className="btn-sm" onClick={closeModulePreview}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

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



