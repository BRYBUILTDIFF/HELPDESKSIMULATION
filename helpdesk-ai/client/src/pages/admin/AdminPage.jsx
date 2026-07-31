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
import WindowsOsSimulation from "../users/Modules/WindowsOsSimulation";
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
const DEFAULT_USER_PASSWORD = "password123";
const USERS_PER_PAGE = 8;
const POLICY_EVENTS_PER_PAGE = 10;
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

function normalizeSurface(surface = "", terminalType = "") {
  const value = String(surface || "").toLowerCase();
  if (["windows-terminal", "mac-terminal", "windows-os", "mac-os"].includes(value)) return value;
  return String(terminalType || "").toLowerCase() === "mac-terminal" ? "mac-terminal" : "windows-terminal";
}

function formatSurfaceLabel(surface = "") {
  const value = String(surface || "").toLowerCase();
  if (value === "mac-terminal") return "Mac Terminal";
  if (value === "windows-os") return "Windows OS";
  if (value === "mac-os") return "Mac OS";
  return "Windows Terminal";
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

function validateUserForm(mode, form, options = {}) {
  const allowDefaultPassword = Boolean(options.allowDefaultPassword);

  if (!form.firstName.trim()) return "First name is required.";
  if (!form.lastName.trim()) return "Last name is required.";
  if (!EMAIL_REGEX.test(form.email.trim())) return "Enter a valid email address.";

  if (mode === "create") {
    const isDefaultPassword = form.password === DEFAULT_USER_PASSWORD;
    if (!isDefaultPassword && !PASSWORD_REGEX.test(form.password)) {
      return "Password must be at least 8 chars and include uppercase, number, and special character.";
    }
    if (isDefaultPassword && !allowDefaultPassword) {
      return "Default password is not allowed in this flow.";
    }
    if (form.password !== form.confirmPassword) {
      return "Passwords do not match.";
    }
  }

  if (mode === "edit" && form.password) {
    const isDefaultPassword = form.password === DEFAULT_USER_PASSWORD;
    if (!isDefaultPassword && !PASSWORD_REGEX.test(form.password)) {
      return "Password must be at least 8 chars and include uppercase, number, and special character.";
    }
    if (isDefaultPassword && !allowDefaultPassword) {
      return "Default password is not allowed in this flow.";
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
    surface: "windows-terminal",
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

function PaginationControls({ page, pageCount, total, itemLabel, onPageChange }) {
  if (pageCount <= 1) {
    return <div className="pagination pagination-single"><span>{total} {itemLabel}</span></div>;
  }

  const firstPage = Math.max(1, Math.min(page - 2, pageCount - 4));
  const lastPage = Math.min(pageCount, firstPage + 4);
  const pages = Array.from({ length: lastPage - firstPage + 1 }, (_, index) => firstPage + index);

  return (
    <div className="pagination pagination-controls">
      <span className="pagination-summary">Showing {total} {itemLabel} · Page {page} of {pageCount}</span>
      <div className="pagination-buttons" aria-label={`${itemLabel} pagination`}>
        <button type="button" className="pagination-btn" onClick={() => onPageChange(page - 1)} disabled={page === 1}>Previous</button>
        {firstPage > 1 ? <><button type="button" className="pagination-btn" onClick={() => onPageChange(1)}>1</button><span className="pagination-ellipsis">…</span></> : null}
        {pages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={`pagination-btn pagination-number ${pageNumber === page ? "active" : ""}`}
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === page ? "page" : undefined}
          >
            {pageNumber}
          </button>
        ))}
        {lastPage < pageCount ? <><span className="pagination-ellipsis">…</span><button type="button" className="pagination-btn" onClick={() => onPageChange(pageCount)}>{pageCount}</button></> : null}
        <button type="button" className="pagination-btn" onClick={() => onPageChange(page + 1)} disabled={page === pageCount}>Next</button>
      </div>
    </div>
  );
}

function PasswordVisibilityIcon({ visible }) {
  return visible ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.4 5.2A10.7 10.7 0 0 1 12 5c5 0 8.9 3.1 10 7-0.5 1.5-1.4 2.8-2.6 3.9" />
      <path d="M6.3 6.3C4.4 7.6 3.1 9.5 2 12c1.1 3.9 5 7 10 7 1.2 0 2.4-0.2 3.5-0.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function AdminPage() {
  const { user, logout, refreshAccessToken } = useAuth();
  const api = useAxios();
  const profileMenuRef = useRef(null);
  const userActionNoticeTimerRef = useRef(null);
  const userActionErrorTimerRef = useRef(null);

  const [activePage, setActivePage] = useState("overview");
  const [theme, setTheme] = useState("dark");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountPasswordForm, setAccountPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [accountPasswordVisibility, setAccountPasswordVisibility] = useState({ current: false, next: false, confirm: false });
  const [accountSettingsError, setAccountSettingsError] = useState("");
  const [accountSettingsSuccess, setAccountSettingsSuccess] = useState("");
  const [accountPasswordSaving, setAccountPasswordSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [policySummary, setPolicySummary] = useState({ total: 0, blocked: 0, allowed: 0, blockRate: 0, last24h: 0, byCode: {} });
  const [policyEvents, setPolicyEvents] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const [userActionNotice, setUserActionNotice] = useState("");
  const [userActionErrorNotice, setUserActionErrorNotice] = useState("");

  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("ALL");
  const [userStatusFilter, setUserStatusFilter] = useState("ALL");
  const [userPage, setUserPage] = useState(1);

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
  const [policyPage, setPolicyPage] = useState(1);
  const [selectedPolicyEvent, setSelectedPolicyEvent] = useState(null);
  const [promptInsights, setPromptInsights] = useState([]);
  const [promptInsightsLoading, setPromptInsightsLoading] = useState(false);
  const [promptInsightsError, setPromptInsightsError] = useState("");
  const [promptInsightQuery, setPromptInsightQuery] = useState("");
  const [moduleQuery, setModuleQuery] = useState("");
  const [modulePreview, setModulePreview] = useState(null);
  const [modulePreviewModuleId, setModulePreviewModuleId] = useState("");
  const [modulePreviewStep, setModulePreviewStep] = useState(0);
  const [modulePreviewSurface, setModulePreviewSurface] = useState("windows-terminal");
  const [moduleDraftMeta, setModuleDraftMeta] = useState(null);
  const [moduleDraftError, setModuleDraftError] = useState("");
  const [adminWindowsOsTest, setAdminWindowsOsTest] = useState(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState("create");
  const [editingUserId, setEditingUserId] = useState(null);
  const [userPendingDeletion, setUserPendingDeletion] = useState(null);
  const [userForm, setUserForm] = useState(buildDefaultUserForm());
  const [useDefaultPassword, setUseDefaultPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);
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
        setAccountSettingsOpen(false);
        setSelectedPolicyEvent(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => () => {
    if (userActionNoticeTimerRef.current) {
      window.clearTimeout(userActionNoticeTimerRef.current);
    }
    if (userActionErrorTimerRef.current) {
      window.clearTimeout(userActionErrorTimerRef.current);
    }
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

  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const policyPageCount = Math.max(1, Math.ceil(filteredPolicyEvents.length / POLICY_EVENTS_PER_PAGE));
  const paginatedUsers = useMemo(
    () => filteredUsers.slice((userPage - 1) * USERS_PER_PAGE, userPage * USERS_PER_PAGE),
    [filteredUsers, userPage]
  );
  const paginatedPolicyEvents = useMemo(
    () => filteredPolicyEvents.slice((policyPage - 1) * POLICY_EVENTS_PER_PAGE, policyPage * POLICY_EVENTS_PER_PAGE),
    [filteredPolicyEvents, policyPage]
  );

  useEffect(() => {
    setUserPage(1);
  }, [userQuery, userRoleFilter, userStatusFilter]);

  useEffect(() => {
    setPolicyPage(1);
  }, [policyQuery, policyCodeFilter, policyStatusFilter, policyTimeFilter]);

  useEffect(() => {
    setUserPage((current) => Math.min(current, userPageCount));
  }, [userPageCount]);

  useEffect(() => {
    setPolicyPage((current) => Math.min(current, policyPageCount));
  }, [policyPageCount]);

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

  const showUserActionNotice = (message) => {
    if (userActionNoticeTimerRef.current) {
      window.clearTimeout(userActionNoticeTimerRef.current);
    }
    setUserActionNotice(message);
    userActionNoticeTimerRef.current = window.setTimeout(() => {
      setUserActionNotice("");
      userActionNoticeTimerRef.current = null;
    }, 3000);
  };

  const showUserActionErrorNotice = (message) => {
    if (userActionErrorTimerRef.current) {
      window.clearTimeout(userActionErrorTimerRef.current);
    }
    setUserActionErrorNotice(message);
    userActionErrorTimerRef.current = window.setTimeout(() => {
      setUserActionErrorNotice("");
      userActionErrorTimerRef.current = null;
    }, 3000);
  };

  const openCreateUserModal = () => {
    setUserModalMode("create");
    setEditingUserId(null);
    setUserForm(buildDefaultUserForm());
    setUseDefaultPassword(false);
    setShowCreatePassword(false);
    setShowCreateConfirmPassword(false);
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
    setUseDefaultPassword(false);
    setShowCreatePassword(false);
    setShowCreateConfirmPassword(false);
    setUserFormError("");
    setUserModalOpen(true);
  };

  const closeUserModal = () => {
    setUserModalOpen(false);
    setUserFormError("");
    setEditingUserId(null);
    setUseDefaultPassword(false);
    setShowCreatePassword(false);
    setShowCreateConfirmPassword(false);
    setUserForm(buildDefaultUserForm());
  };

  const openAccountSettings = () => {
    setProfileMenuOpen(false);
    setAccountPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setAccountPasswordVisibility({ current: false, next: false, confirm: false });
    setAccountSettingsError("");
    setAccountSettingsSuccess("");
    setAccountSettingsOpen(true);
  };

  const closeAccountSettings = () => {
    if (accountPasswordSaving) return;
    setAccountSettingsOpen(false);
    setAccountSettingsError("");
    setAccountSettingsSuccess("");
  };

  const saveAccountPassword = async (event) => {
    event.preventDefault();
    setAccountSettingsError("");
    setAccountSettingsSuccess("");

    if (!accountPasswordForm.currentPassword || !accountPasswordForm.newPassword || !accountPasswordForm.confirmPassword) {
      setAccountSettingsError("Complete all password fields.");
      return;
    }
    if (!PASSWORD_REGEX.test(accountPasswordForm.newPassword)) {
      setAccountSettingsError("Use at least 8 characters with an uppercase letter, number, and special character.");
      return;
    }
    if (accountPasswordForm.newPassword !== accountPasswordForm.confirmPassword) {
      setAccountSettingsError("New password and confirmation do not match.");
      return;
    }

    setAccountPasswordSaving(true);
    try {
      const response = await api.post("/api/auth/change-password", {
        currentPassword: accountPasswordForm.currentPassword,
        newPassword: accountPasswordForm.newPassword
      });
      if (response.data?.accessToken) {
        await refreshAccessToken();
      }
      setAccountPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setAccountSettingsSuccess(response.data?.message || "Password changed successfully.");
    } catch (err) {
      setAccountSettingsError(safeError(err));
    } finally {
      setAccountPasswordSaving(false);
    }
  };

  const saveUserModal = async () => {
    const resolvedPassword =
      userModalMode === "create" && useDefaultPassword ? DEFAULT_USER_PASSWORD : userForm.password;
    const resolvedConfirmPassword =
      userModalMode === "create" && useDefaultPassword ? DEFAULT_USER_PASSWORD : userForm.confirmPassword;
    const formToValidate = {
      ...userForm,
      password: resolvedPassword,
      confirmPassword: resolvedConfirmPassword
    };
    const validationMessage = validateUserForm(userModalMode, formToValidate, {
      allowDefaultPassword: userModalMode === "create" && useDefaultPassword
    });
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

    if (userModalMode === "create" && useDefaultPassword) {
      payload.password = DEFAULT_USER_PASSWORD;
    } else if (userForm.password.trim()) {
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
      showUserActionNotice(userModalMode === "create" ? "User account created successfully." : "User account updated successfully.");
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
      showUserActionNotice(`Account ${nextActive ? "activated" : "deactivated"} successfully.`);
    } catch (err) {
      showUserActionErrorNotice(safeError(err));
    } finally {
      setPendingKey("");
    }
  };

  const deleteUserAccount = async (targetUser) => {
    const key = `user-delete-${targetUser.id}`;
    setPendingKey(key);

    try {
      await api.delete(`/api/admin/users/${targetUser.id}`);
      await loadUsers();
      setUserPendingDeletion(null);
      showUserActionNotice("User account deleted successfully.");
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
    setModulePreviewModuleId(options?.moduleId || "");
    setModulePreviewStep(0);
    setModulePreviewSurface(normalizeSurface(options?.surface || preview?.surface, preview?.terminalType));
    setModuleDraftMeta(options?.draftMeta || null);
    setModuleDraftError("");
  };

  const closeModulePreview = () => {
    setModulePreview(null);
    setModulePreviewModuleId("");
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
        occurrences: Number(insight.occurrences || 1),
        preferredSurface: insight.recommendedSurface
      });
      const draft = res.data?.draft;
      if (!draft) {
        throw new Error("Unable to generate simulation draft.");
      }
      openModulePreview(getModuleSimulationDefinition(draft), {
        surface: draft.recommendedSurface || insight.recommendedSurface || draft?.simulation?.terminalType,
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
          surface: modulePreviewSurface,
          terminalType: modulePreviewSurface === "windows-terminal" || modulePreviewSurface === "mac-terminal" ? modulePreviewSurface : null
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
  const promptInsightFeed = useMemo(() => {
    return Array.isArray(promptInsights) ? promptInsights : [];
  }, [promptInsights]);

  const filteredPromptInsights = useMemo(() => {
    const query = promptInsightQuery.trim().toLowerCase();
    if (!query) {
      return promptInsightFeed;
    }
    return promptInsightFeed.filter((item) => {
      return (
        String(item.samplePrompt || "").toLowerCase().includes(query) ||
        String(item.suggestedCategory || "").toLowerCase().includes(query) ||
        String(item.recommendedSurfaceLabel || item.recommendedSurface || "").toLowerCase().includes(query)
      );
    });
  }, [promptInsightFeed, promptInsightQuery]);

  const filteredModules = useMemo(() => {
    const query = moduleQuery.trim().toLowerCase();
    if (!query) {
      return modules;
    }
    return modules.filter((module) =>
      [module.title, module.category, module.difficulty, module.enabled ? "enabled" : "disabled"]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [moduleQuery, modules]);

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
  const isAiGeneratedDraft = moduleDraftMeta?.mode === "from_prompt";
  const selectedPreviewSurface = previewSurfaceOptions.find((option) => option.value === modulePreviewSurface);
  const previewRuntimeHint = stripHtml(previewCurrentStep.action || previewCurrentStep.desc || "");
  const previewFullName = [userForm.firstName.trim(), userForm.lastName.trim()].filter(Boolean).join(" ");
  const previewInitials =
    `${userForm.firstName.trim().charAt(0)}${userForm.lastName.trim().charAt(0)}`.trim().toUpperCase() || "—";
  const showPasswordMatch =
    userModalMode === "create" && !useDefaultPassword && userForm.confirmPassword.trim().length > 0;
  const passwordMatch = userForm.password === userForm.confirmPassword;

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
              <span className={`profile-caret ${profileMenuOpen ? "is-open" : ""}`} aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></svg>
              </span>
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
                <button type="button" className="profile-account-btn" onClick={openAccountSettings}>Account settings</button>
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

          <div className={`content ${activePage === "sims" ? "content-simulations" : ""}`}>
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
                      paginatedUsers.map((targetUser) => {
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
                                  onClick={() => setUserPendingDeletion(targetUser)}
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

                <PaginationControls
                  page={userPage}
                  pageCount={userPageCount}
                  total={filteredUsers.length}
                  itemLabel="users"
                  onPageChange={setUserPage}
                />
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
                        <div className="event-col event-col-time">Time</div>
                        <div className="event-col event-col-user">User</div>
                        <div className="event-col event-col-code">Code</div>
                        <div className="event-col event-col-status">Status</div>
                        <div className="event-col event-col-actions">Actions</div>
                      </div>
                      <div className="event-body">
                        {filteredPolicyEvents.length === 0 ? (
                          <div className="event-row">
                            <div className="prompt-cell" style={{ gridColumn: "1 / -1" }}>No policy events found for the selected filters.</div>
                          </div>
                        ) : (
                          paginatedPolicyEvents.map((event) => (
                            <div className="event-row" key={event.id}>
                              <div className="muted-cell event-cell event-col-time">{formatDateTime(event.at)}</div>
                              <div className="muted-cell event-cell event-col-user">{event.userEmail || "Unknown"}</div>
                              <div className="muted-cell event-cell event-col-code">{event.code || "UNKNOWN"}</div>
                              <div className="event-cell event-col-status event-status-cell">
                                <span className={`badge ${event.blocked ? "badge-blocked" : "badge-allowed"}`}>
                                  {event.blocked ? "Blocked" : "Allowed"}
                                </span>
                              </div>
                              <div className="event-cell event-col-actions">
                                <button
                                  type="button"
                                  className="policy-event-view-btn"
                                  onClick={() => setSelectedPolicyEvent(event)}
                                  aria-label={`View policy event details for ${event.userEmail || "user"}`}
                                  title="View event details"
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.6-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.6 6.5-9.5 6.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.7" /></svg>
                                  <span>View</span>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <PaginationControls
                        page={policyPage}
                        pageCount={policyPageCount}
                        total={filteredPolicyEvents.length}
                        itemLabel="events"
                        onPageChange={setPolicyPage}
                      />
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
              <div className="page active simulation-modules-page">
                <div className="sim-toolbar">
                  <div className="sim-toolbar-title">{moduleStats.total} modules · {moduleStats.enabled} enabled</div>
                </div>
                <div className="sim-layout">
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
                          const isSample = Boolean(insight.isSample);
                          return (
                            <div className="sim-prompt-card" key={insight.normalized || insight.samplePrompt}>
                              <div className="sim-prompt-text">{insight.samplePrompt}</div>
                              <div className="sim-prompt-meta">
                                <span>{insight.occurrences} occurrences</span>
                                <span>{insight.uniqueUsers} users</span>
                                <span>{insight.suggestedCategory}</span>
                                <span>{insight.recommendedSurfaceLabel || formatSurfaceLabel(insight.recommendedSurface)}</span>
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
                                {!isSample ? (
                                  <button
                                    type="button"
                                    className="btn-sm btn-danger"
                                    disabled={creating || disregarding}
                                    onClick={() => disregardPromptInsight(insight)}
                                  >
                                    {disregarding ? "Disregarding..." : "Disregard"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="panel sim-modules-panel">
                    <div className="sim-modules-head">
                      <div className="panel-title">
                        Modules
                        <span>{filteredModules.length} of {moduleStats.total}</span>
                      </div>
                      <input
                        className="policy-search-input sim-module-search"
                        value={moduleQuery}
                        onChange={(event) => setModuleQuery(event.target.value)}
                        placeholder="Search modules by title, category, status..."
                        aria-label="Search simulation modules"
                      />
                    </div>
                    <div className="sim-grid">
                      {filteredModules.length === 0 ? (
                        <div className="muted-cell sim-modules-empty">No modules match your search.</div>
                      ) : filteredModules.map((module) => {
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
                                    surface: module?.simulation?.surface,
                                    moduleId: module.id,
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
                <button type="button" className="btn-sm sim-preview-close-btn" onClick={closeModulePreview} aria-label="Close simulation preview">X</button>
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
                      <div className="sim-preview-env-label">
                        {isAiGeneratedDraft ? "AI-selected environment" : "Environment"}
                      </div>
                      {isAiGeneratedDraft ? (
                        <div className="sim-preview-selected-surface" title="This environment was selected by AI for this draft.">
                          <span className="sim-preview-env-icon">{selectedPreviewSurface?.icon}</span>
                          <span>{formatSurfaceLabel(modulePreviewSurface)}</span>
                          <span className="sim-preview-surface-lock" aria-label="Locked">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="5" y="10" width="14" height="10" rx="2" />
                              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                            </svg>
                          </span>
                        </div>
                      ) : (
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
                      )}
                    </div>

                    <div className="sim-preview-sim-frame">
                      {modulePreviewSurface === "windows-terminal" ? (
                        <div className="sim-preview-terminal-window sim-preview-windows-terminal">
                          <div className="windows-terminal-titlebar">
                            <div className="windows-terminal-tab active">
                              <span className="windows-terminal-powershell-icon">›_</span>
                              <strong>Windows PowerShell</strong>
                              <span className="windows-terminal-tab-close" aria-hidden="true">×</span>
                            </div>
                            <button type="button" className="windows-terminal-menu" aria-label="Terminal options">⌄</button>
                            <div className="windows-terminal-window-controls" aria-hidden="true">
                              <span>−</span><span>□</span><span>×</span>
                            </div>
                          </div>
                          <pre>{`Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

PS C:\\Users\\student> echo ${previewCurrentStep.title || "Ready"}
${previewCurrentStep.title || "Ready"}

PS C:\\Users\\student> _`}</pre>
                        </div>
                      ) : modulePreviewSurface === "mac-terminal" ? (
                        <div className="sim-preview-terminal-window sim-preview-mac-terminal">
                          <div className="mac-terminal-titlebar">
                            <div className="mac-terminal-window-dots" aria-hidden="true">
                              <span className="dot red" />
                              <span className="dot yellow" />
                              <span className="dot green" />
                            </div>
                            <strong>⌂ jumpcloud — zsh — 80×24</strong>
                          </div>
                          <pre>{`Last login: Tue Jan 11 11:10:04 on console
jumpcloud@JumpCloud ~ % echo ${previewCurrentStep.title || "Ready"}
${previewCurrentStep.title || "Ready"}
jumpcloud@JumpCloud ~ % _`}</pre>
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
                  <div className="sim-preview-footer-center">
                    <div className="sim-preview-step-dots" aria-hidden="true">
                      {previewSteps.map((step, index) => (
                        <span
                          key={`dot-${step.title}-${index}`}
                          className={`sim-preview-step-dot ${index < previewSafeStep ? "done" : index === previewSafeStep ? "active" : "todo"}`}
                        />
                      ))}
                    </div>
                    <span className="sim-preview-footer-nav">Step {previewTotalSteps === 0 ? 0 : previewSafeStep + 1} of {previewTotalSteps}</span>
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

                    {modulePreviewSurface === "windows-os" ? (
                      <div className="sim-runtime-windows-os-preview">
                        <img src={windowsOsPreviewImg} alt="Windows 11 simulation preview" />
                        <div className="sim-runtime-windows-os-shade" />
                        <div className="sim-runtime-windows-os-card">
                          <span className="sim-runtime-windows-os-badge">Windows 11 · Private EC2 workspace</span>
                          <h4>Ready to test this Windows OS simulation?</h4>
                          <p>Testing launches one isolated Windows workspace for your administrator account. It does not start automatically when viewing the module.</p>
                          <button
                            type="button"
                            className="btn-sm create-user-btn"
                            disabled={!modulePreviewModuleId}
                            onClick={() => setAdminWindowsOsTest({ id: modulePreviewModuleId, title: modulePreview.title, steps: previewSteps })}
                          >
                            Test Windows Simulation
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="sim-runtime-terminal">
                        <div className="sim-preview-terminal-head">
                          <span className="dot red" />
                          <span className="dot yellow" />
                          <span className="dot green" />
                          <strong>{modulePreviewSurface === "mac-terminal" ? "Mac Terminal" : "Windows Terminal"}</strong>
                        </div>
                        <TerminalEmulator
                          className="sim-runtime-terminal-body"
                          initialMessage={`${modulePreviewSurface === "mac-terminal" ? "Mac" : "Windows"} Terminal simulation ready. Type 'help' for available commands.`}
                          username="student"
                          hostname="DESKTOP-SIM"
                          initialPath="C:\\Users\\student"
                          onCommand={handleAdminRuntimeTerminalCommand}
                        />
                      </div>
                    )}
                  </section>
                </div>

                <div className="sim-runtime-footer">
                  <div className="sim-preview-footer-center">
                    <div className="sim-preview-step-dots" aria-hidden="true">
                      {previewSteps.map((step, index) => (
                        <span
                          key={`dot-${step.title}-${index}`}
                          className={`sim-preview-step-dot ${index < previewSafeStep ? "done" : index === previewSafeStep ? "active" : "todo"}`}
                        />
                      ))}
                    </div>
                    <span className="sim-preview-footer-nav">Step {previewTotalSteps === 0 ? 0 : previewSafeStep + 1} of {previewTotalSteps}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {selectedPolicyEvent ? (
        <div className="admin-modal-overlay policy-event-modal-overlay" onClick={() => setSelectedPolicyEvent(null)}>
          <section className="policy-event-modal" role="dialog" aria-modal="true" aria-labelledby="policy-event-modal-title" onClick={(event) => event.stopPropagation()}>
            <header className="policy-event-modal-head">
              <div>
                <span className="policy-event-modal-kicker">Policy decision details</span>
                <h3 id="policy-event-modal-title">{selectedPolicyEvent.blocked ? "Blocked request" : "Allowed request"}</h3>
              </div>
              <button type="button" className="account-modal-close" onClick={() => setSelectedPolicyEvent(null)} aria-label="Close policy event details">×</button>
            </header>

            <div className="policy-event-modal-meta">
              <span className={`badge ${selectedPolicyEvent.blocked ? "badge-blocked" : "badge-allowed"}`}>{selectedPolicyEvent.blocked ? "Blocked" : "Allowed"}</span>
              <span>{selectedPolicyEvent.code || "UNKNOWN"}</span>
              <span>{formatDateTime(selectedPolicyEvent.at)}</span>
            </div>

            <div className="policy-event-modal-section">
              <span>User</span>
              <strong>{selectedPolicyEvent.userEmail || "Unknown user"}</strong>
            </div>
            <div className="policy-event-modal-section">
              <span>Prompt</span>
              <p>{selectedPolicyEvent.message || "No prompt recorded."}</p>
            </div>
            <div className="policy-event-modal-section">
              <span>Policy reason</span>
              <p>{selectedPolicyEvent.reason || "No reason recorded."}</p>
            </div>
            {selectedPolicyEvent.hasHistory ? <div className="policy-event-history-note">This decision was evaluated with relevant conversation history.</div> : null}
          </section>
        </div>
      ) : null}

      {adminWindowsOsTest ? (
        <WindowsOsSimulation
          api={api}
          moduleId={adminWindowsOsTest.id}
          title={adminWindowsOsTest.title}
          steps={adminWindowsOsTest.steps}
          onEnded={() => setAdminWindowsOsTest(null)}
        />
      ) : null}

      {userActionNotice ? (
        <div className="admin-success-notice-overlay" role="status" aria-live="polite">
          <div className="admin-success-notice-card">
            <div className="admin-success-notice-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5" /></svg>
            </div>
            <div>
              <strong>Success</strong>
              <p>{userActionNotice}</p>
            </div>
          </div>
        </div>
      ) : null}

      {userActionErrorNotice ? (
        <div className="admin-success-notice-overlay admin-error-notice-overlay" role="alert" aria-live="assertive">
          <div className="admin-success-notice-card admin-error-notice-card">
            <div className="admin-success-notice-icon admin-error-notice-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 8v4M12 16h.01M10 3.8 2.8 16.2A2 2 0 0 0 4.5 19h15a2 2 0 0 0 1.7-2.8L14 3.8a2.3 2.3 0 0 0-4 0Z" /></svg>
            </div>
            <div>
              <strong>Account update failed</strong>
              <p>{userActionErrorNotice}</p>
            </div>
          </div>
        </div>
      ) : null}

      {userPendingDeletion ? (
        <div className="admin-modal-overlay admin-delete-confirm-overlay" onClick={() => setUserPendingDeletion(null)}>
          <section className="admin-delete-confirm-card" role="dialog" aria-modal="true" aria-labelledby="delete-user-title" onClick={(event) => event.stopPropagation()}>
            <div className="admin-delete-confirm-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
            </div>
            <div>
              <h3 id="delete-user-title">Delete user account?</h3>
              <p>
                You are about to permanently delete <strong>{userPendingDeletion.email}</strong>. This action cannot be undone.
              </p>
            </div>
            <div className="admin-delete-confirm-actions">
              <button type="button" className="btn-sm" onClick={() => setUserPendingDeletion(null)} disabled={pendingKey === `user-delete-${userPendingDeletion.id}`}>Cancel</button>
              <button type="button" className="btn-sm admin-delete-confirm-button" onClick={() => deleteUserAccount(userPendingDeletion)} disabled={pendingKey === `user-delete-${userPendingDeletion.id}`}>
                {pendingKey === `user-delete-${userPendingDeletion.id}` ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {userModalOpen ? (
        <div className="admin-modal-overlay" onClick={closeUserModal}>
          <div className="admin-modal account-modal" onClick={(event) => event.stopPropagation()}>
            <div className="account-modal-head">
              <div className="account-modal-head-left">
                <div className="account-modal-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
                    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
                    <path d="M18.5 4.5v5M16 7h5" />
                  </svg>
                </div>
                <div>
                  <h3>{userModalMode === "create" ? "Create user account" : "Edit user account"}</h3>
                  <p>
                    {userModalMode === "create"
                      ? "Fill in the details below to add a new user"
                      : "Update user details and access settings"}
                  </p>
                </div>
              </div>
              <button type="button" className="account-modal-close" onClick={closeUserModal} aria-label="Close">
                x
              </button>
            </div>

            {userFormError ? <div className="admin-alert error">{userFormError}</div> : null}

            <div className="account-modal-body">
              <div className="admin-modal-grid account-modal-grid">
                <label className="admin-field account-field">
                <span>First Name</span>
                <input
                  type="text"
                  placeholder="e.g. Alex"
                  value={userForm.firstName}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
              </label>
                <label className="admin-field account-field">
                <span>Last Name</span>
                <input
                  type="text"
                  placeholder="e.g. Rivera"
                  value={userForm.lastName}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </label>
                <label className="admin-field account-field full">
                  <span>Email Address</span>
                  <div className="account-input-icon-wrap">
                    <span className="account-input-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M3 6h18v12H3z" />
                        <path d="m4 7 8 6 8-6" />
                      </svg>
                    </span>
                    <input
                      type="email"
                      placeholder="alex@company.com"
                      className="account-input-with-icon"
                      value={userForm.email}
                      onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                    />
                  </div>
                </label>
                <label className="admin-field account-field">
                <span>Role</span>
                <select
                  value={userForm.role}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
                <label className="admin-field account-field">
                <span>Status</span>
                <select
                  value={userForm.isActive ? "ACTIVE" : "INACTIVE"}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, isActive: event.target.value === "ACTIVE" }))}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
                <div className={`account-password-section full ${userModalMode === "create" && useDefaultPassword ? "is-disabled" : ""}`}>
                  <div className="account-password-grid">
                    <label className="admin-field account-field">
                      <span>{userModalMode === "create" ? "Password" : "New Password (optional)"}</span>
                      <div className="account-input-icon-wrap">
                        <input
                          type={showCreatePassword ? "text" : "password"}
                          placeholder={userModalMode === "create" ? "Min. 8 characters" : "Leave blank to keep current"}
                          value={userForm.password}
                          disabled={userModalMode === "create" && useDefaultPassword}
                          onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="account-input-action"
                          onClick={() => setShowCreatePassword((prev) => !prev)}
                          aria-label={showCreatePassword ? "Hide password" : "Show password"}
                        >
                          {showCreatePassword ? (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 3l18 18" />
                              <path d="M10.8 10.8a2.2 2.2 0 0 0 3.1 3.1" />
                              <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c4.9 0 8.8 3 10 7-0.4 1.4-1.2 2.7-2.3 3.8" />
                              <path d="M6.2 6.2C4.6 7.4 3.4 9.1 2 12c1.2 4 5.1 7 10 7 1.1 0 2.1-0.1 3.1-0.4" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </label>
                    <label className="admin-field account-field">
                      <span>{userModalMode === "create" ? "Confirm Password" : "Confirm New Password"}</span>
                      <div className="account-input-icon-wrap">
                        <input
                          type={showCreateConfirmPassword ? "text" : "password"}
                          placeholder={userModalMode === "create" ? "Repeat password" : "Confirm new password"}
                          value={userForm.confirmPassword}
                          disabled={userModalMode === "create" && useDefaultPassword}
                          onChange={(event) => setUserForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="account-input-action"
                          onClick={() => setShowCreateConfirmPassword((prev) => !prev)}
                          aria-label={showCreateConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        >
                          {showCreateConfirmPassword ? (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 3l18 18" />
                              <path d="M10.8 10.8a2.2 2.2 0 0 0 3.1 3.1" />
                              <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c4.9 0 8.8 3 10 7-0.4 1.4-1.2 2.7-2.3 3.8" />
                              <path d="M6.2 6.2C4.6 7.4 3.4 9.1 2 12c1.2 4 5.1 7 10 7 1.1 0 2.1-0.1 3.1-0.4" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </label>
                  </div>
                  {showPasswordMatch ? (
                    <div className={`account-password-match ${passwordMatch ? "ok" : "bad"}`}>
                      {passwordMatch ? "Passwords match" : "Passwords do not match"}
                    </div>
                  ) : null}
                </div>
                {userModalMode === "create" ? (
                  <label className="admin-inline-checkbox account-default-row full">
                    <input
                      type="checkbox"
                      checked={useDefaultPassword}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setUseDefaultPassword(checked);
                        setUserFormError("");
                        setShowCreatePassword(false);
                        setShowCreateConfirmPassword(false);
                        setUserForm((prev) => ({
                          ...prev,
                          password: checked ? DEFAULT_USER_PASSWORD : "",
                          confirmPassword: checked ? DEFAULT_USER_PASSWORD : ""
                        }));
                      }}
                    />
                    <span>
                      <strong>Use default password</strong>
                      <em>
                        Account will be created with <code>{DEFAULT_USER_PASSWORD}</code> and should be changed on first login
                      </em>
                    </span>
                  </label>
                ) : null}
              </div>

              <div className="account-modal-footer">
                <div className={`account-preview-avatar ${previewFullName ? "has-name" : ""}`}>{previewInitials}</div>
                <div className={`account-preview-name ${previewFullName ? "has-name" : ""}`}>
                  {previewFullName || "Enter a name to preview"}
                </div>
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
        </div>
      ) : null}

      {accountSettingsOpen ? (
        <div className="admin-modal-overlay" onClick={closeAccountSettings}>
          <form className="admin-modal admin-account-settings-modal" onSubmit={saveAccountPassword} onClick={(event) => event.stopPropagation()}>
            <div className="account-modal-head">
              <div className="account-modal-head-left">
                <div className="account-modal-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
                </div>
                <div>
                  <h3>Account settings</h3>
                  <p>Review your administrator account and update your password.</p>
                </div>
              </div>
              <button type="button" className="account-modal-close" onClick={closeAccountSettings} aria-label="Close account settings">×</button>
            </div>

            <div className="admin-account-details">
              <div className="admin-account-avatar">{(user?.firstName || user?.email || "A").charAt(0).toUpperCase()}</div>
              <div>
                <strong>{user?.firstName || ""} {user?.lastName || ""}</strong>
                <span>{user?.email || ""}</span>
              </div>
              <em>{user?.role || "ADMIN"}</em>
            </div>

            <div className="account-modal-body admin-account-settings-body">
              <h4>Change password</h4>
              <p className="admin-account-password-note">Use at least 8 characters, including an uppercase letter, number, and special character.</p>
              {accountSettingsError ? <div className="admin-alert error">{accountSettingsError}</div> : null}
              {accountSettingsSuccess ? <div className="admin-account-success">{accountSettingsSuccess}</div> : null}
              <div className="admin-account-password-fields">
                {[
                  ["current", "Current password", "currentPassword", "current-password"],
                  ["next", "New password", "newPassword", "new-password"],
                  ["confirm", "Confirm new password", "confirmPassword", "new-password"]
                ].map(([key, label, field, autoComplete]) => (
                  <label className="admin-field" key={key}>
                    <span>{label}</span>
                    <span className="admin-password-input-wrap">
                      <input
                        type={accountPasswordVisibility[key] ? "text" : "password"}
                        value={accountPasswordForm[field]}
                        autoComplete={autoComplete}
                        disabled={accountPasswordSaving}
                        onChange={(event) => setAccountPasswordForm((prev) => ({ ...prev, [field]: event.target.value }))}
                      />
                      <button
                        type="button"
                        className="admin-password-visibility-btn"
                        onClick={() => setAccountPasswordVisibility((prev) => ({ ...prev, [key]: !prev[key] }))}
                        aria-label={accountPasswordVisibility[key] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                      >
                        <PasswordVisibilityIcon visible={accountPasswordVisibility[key]} />
                      </button>
                    </span>
                  </label>
                ))}
              </div>
              <div className="admin-account-settings-actions">
                <button type="button" className="btn-sm" onClick={closeAccountSettings} disabled={accountPasswordSaving}>Cancel</button>
                <button type="submit" className="btn-sm create-user-btn" disabled={accountPasswordSaving}>
                  {accountPasswordSaving ? "Updating..." : "Update password"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
