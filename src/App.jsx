import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Updates requested ✅
 * - Pomodoro looks like a real clock (circular dial + progress ring + hand)
 * - Start/Pause/Reset are ICON buttons
 * - Pomodoro settings moved into Profile dropdown -> "Pomodoro settings"
 * - NO pomodoro dock/notification on mobile (and no dock at all, so + never disappears)
 * - Planner: removed "All" filter (only Exams / Projects / Daily)
 * - Tasks grouping looked meh → now each item card is tinted by type + category label above
 */

// === Helper utils ===
const pad = (n) => String(n).padStart(2, "0");
const fmtYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYMD = (s) => {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
};
const daysBetween = (d1, d2) =>
  Math.ceil((parseYMD(fmtYMD(d2)) - parseYMD(fmtYMD(d1))) / (1000 * 60 * 60 * 24));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// Fixed palette per item (accent used for header)
const PALETTE = [
  { bg: "bg-indigo-600", pill: "bg-indigo-50 text-indigo-700" },
  { bg: "bg-teal-600", pill: "bg-teal-50 text-teal-700" },
  { bg: "bg-rose-600", pill: "bg-rose-50 text-rose-700" },
  { bg: "bg-amber-600", pill: "bg-amber-50 text-amber-700" },
  { bg: "bg-violet-600", pill: "bg-violet-50 text-violet-700" },
];

// ===== Status system =====
const STATUSES = ["Not Started", "In Progress", "Done"];

function statusMeta(status) {
  switch (status) {
    case "Not Started":
      return {
        label: "Not Started",
        pill: "bg-rose-50 text-rose-700 ring-rose-200",
        iconColor: "text-rose-600",
      };
    case "In Progress":
      return {
        label: "In Progress",
        pill: "bg-amber-50 text-amber-800 ring-amber-200",
        iconColor: "text-amber-600",
      };
    case "Done":
      return {
        label: "Done",
        pill: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        iconColor: "text-emerald-600",
      };
    default:
      return {
        label: status,
        pill: "bg-slate-50 text-slate-700 ring-slate-200",
        iconColor: "text-slate-600",
      };
  }
}
function nextStatus(current) {
  const idx = STATUSES.indexOf(current);
  return STATUSES[(idx + 1 + STATUSES.length) % STATUSES.length];
}

function typeMeta(type) {
  if (type === "exam")
    return {
      label: "Exams",
      chip: "bg-sky-50 text-sky-700 ring-sky-200",
      tint: "bg-sky-50/60",
      border: "border-sky-200",
    };
  if (type === "project")
    return {
      label: "Projects",
      chip: "bg-purple-50 text-purple-700 ring-purple-200",
      tint: "bg-purple-50/60",
      border: "border-purple-200",
    };
  return {
    label: "Daily",
    chip: "bg-slate-50 text-slate-700 ring-slate-200",
    tint: "bg-slate-50/60",
    border: "border-slate-200",
  };
}

// ========== Local storage fallback ==========
const USERS_KEY = "sp_users_v3";
const CURR_USER_KEY = "sp_current_user_v3";
const itemsKey = (u) => `sp_items_v3_${u}`;
const POMO_KEY = "sp_pomo_v3";

const getUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveUsers = (arr) => localStorage.setItem(USERS_KEY, JSON.stringify(arr));

// ========== Server sync config ==========
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "";
const SERVER_ENABLED = Boolean(API_BASE);

const TOKEN_KEY = "sp_token_v3";
const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// ========== Default items ==========
const DEFAULT_ITEMS = () => {
  const today = new Date();
  const d = (offset) => {
    const x = new Date(today);
    x.setDate(x.getDate() + offset);
    return fmtYMD(x);
  };

  return [
    { id: crypto.randomUUID(), type: "exam", name: "BGS", colorIdx: 0, dueDate: d(21), tasks: [] },
    { id: crypto.randomUUID(), type: "exam", name: "Econs", colorIdx: 1, dueDate: d(28), tasks: [] },
    { id: crypto.randomUUID(), type: "project", name: "Omni Iteration", colorIdx: 2, dueDate: d(14), tasks: [] },
    { id: crypto.randomUUID(), type: "daily", name: "Daily To-Dos", colorIdx: 3, dueDate: d(0), tasks: [] },
  ];
};

// ===== Icons (no deps) =====
function IconTrash({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
function IconReset({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v7h-7" />
    </svg>
  );
}
function IconUser({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 1 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    </svg>
  );
}
function IconPlus({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
function IconLogout({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 4v16" />
    </svg>
  );
}
function IconStopwatch({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 2h6" />
      <path d="M12 14l2-2" />
      <path d="M18 5l1-1" />
      <circle cx="12" cy="13" r="8" />
    </svg>
  );
}
function IconSettings({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.9 7.9 0 0 0 .1-2l2-1.2-2-3.4-2.3.6a7.8 7.8 0 0 0-1.7-1l-.3-2.4H9l-.3 2.4a7.8 7.8 0 0 0-1.7 1l-2.3-.6-2 3.4 2 1.2a7.9 7.9 0 0 0 .1 2l-2 1.2 2 3.4 2.3-.6a7.8 7.8 0 0 0 1.7 1l.3 2.4h6.2l.3-2.4a7.8 7.8 0 0 0 1.7-1l2.3.6 2-3.4-2-1.2z" />
    </svg>
  );
}
function IconPlay({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M8 5v14l12-7-12-7z" />
    </svg>
  );
}
function IconPause({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

// Status icons
function IconStatusNotStarted({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
function IconStatusInProgress({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4a8 8 0 1 0 8 8" />
      <path d="M12 4v8h8" />
    </svg>
  );
}
function IconStatusDone({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12l2.2 2.2L15.5 9.5" />
    </svg>
  );
}
function StatusIcon({ status, className = "" }) {
  if (status === "Done") return <IconStatusDone className={className} />;
  if (status === "In Progress") return <IconStatusInProgress className={className} />;
  return <IconStatusNotStarted className={className} />;
}

// ========== Pomodoro ==========
function formatMMSS(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad(mm)}:${pad(ss)}`;
}
function loadPomo() {
  try {
    const raw = localStorage.getItem(POMO_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function savePomo(state) {
  localStorage.setItem(POMO_KEY, JSON.stringify(state));
}
function defaultPomoState() {
  return {
    mode: "focus", // focus | short | long
    isRunning: false,
    focusMin: 25,
    shortMin: 5,
    longMin: 15,
    secondsLeft: 25 * 60,
    rounds: 0,
    targetTs: null,
  };
}
function durationForMode(state, mode) {
  if (mode === "short") return state.shortMin * 60;
  if (mode === "long") return state.longMin * 60;
  return state.focusMin * 60;
}

// ===================== APP =====================
export default function StudyPlannerApp() {
  const [user, setUser] = useState(() => localStorage.getItem(CURR_USER_KEY) || "");
  const [token, setAuthToken] = useState(() => (SERVER_ENABLED ? getToken() : ""));
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [syncStatus, setSyncStatus] = useState(SERVER_ENABLED ? "Ready" : "Local mode");

  // Profile menu + modals
  const [profileOpen, setProfileOpen] = useState(false);
  const [pomoSettingsOpen, setPomoSettingsOpen] = useState(false);

  // Planner filter (NO "All")
  const [category, setCategory] = useState("exam"); // exam | project | daily

  // Pomodoro state
  const [pomo, setPomo] = useState(() => loadPomo() || defaultPomoState());
  const tickRef = useRef(null);

  const today = useMemo(() => fmtYMD(new Date()), []);
  const tabs = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "today", label: "Today" },
      { id: "planner", label: "Planner" },
      { id: "timer", label: "Timer" },
    ],
    []
  );

  // ===== Load data =====
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;

      if (SERVER_ENABLED) {
        if (!token) return;
        try {
          setSyncStatus("Syncing…");
          const data = await api("/modules", { token });
          if (!cancelled) {
            const normalized = Array.isArray(data)
              ? data.map((x) => ({
                  ...x,
                  type: x.type || "exam",
                  dueDate: x.dueDate || x.examDate || fmtYMD(new Date()),
                  tasks: x.tasks || [],
                }))
              : DEFAULT_ITEMS();
            setItems(normalized);
            setSyncStatus("Synced");
          }
        } catch (e) {
          if (!cancelled) {
            setSyncStatus(`Sync error: ${e.message}`);
            setItems(DEFAULT_ITEMS());
          }
        }
        return;
      }

      const saved = localStorage.getItem(itemsKey(user));
      if (!saved) setItems(DEFAULT_ITEMS());
      else setItems(JSON.parse(saved));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  // ===== Save data =====
  useEffect(() => {
    if (!user) return;

    if (SERVER_ENABLED) {
      if (!token) return;

      const doSync = async () => {
        try {
          setSyncStatus("Syncing…");
          await api("/modules", { method: "PUT", body: items, token });
          setSyncStatus("Synced");
        } catch (e) {
          setSyncStatus(`Sync error: ${e.message}`);
        }
      };

      const t = setTimeout(doSync, 450);
      return () => clearTimeout(t);
    }

    localStorage.setItem(itemsKey(user), JSON.stringify(items));
  }, [items, user, token]);

  // ===== Pomodoro ticking (refresh-safe) =====
  useEffect(() => {
    savePomo(pomo);

    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (!pomo.isRunning || !pomo.targetTs) return;

    tickRef.current = setInterval(() => {
      setPomo((prev) => {
        if (!prev.isRunning || !prev.targetTs) return prev;

        const now = Date.now();
        const left = Math.max(0, Math.round((prev.targetTs - now) / 1000));

        if (left <= 0) {
          const next = { ...prev, isRunning: false, secondsLeft: 0, targetTs: null };
          // focus -> short/long, break -> focus
          if (prev.mode === "focus") {
            const nextRounds = prev.rounds + 1;
            const goLong = nextRounds % 4 === 0;
            const nextMode = goLong ? "long" : "short";
            const dur = durationForMode(prev, nextMode);
            return { ...next, mode: nextMode, secondsLeft: dur, rounds: nextRounds };
          } else {
            const dur = durationForMode(prev, "focus");
            return { ...next, mode: "focus", secondsLeft: dur };
          }
        }
        return { ...prev, secondsLeft: left };
      });
    }, 500);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [pomo.isRunning, pomo.targetTs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Auth =====
  const loginLocal = (username) => {
    const u = (username || "").trim();
    if (!u) return alert("Please enter a username");
    const users = getUsers();
    if (!users.includes(u)) {
      users.push(u);
      saveUsers(users);
    }
    localStorage.setItem(CURR_USER_KEY, u);
    setUser(u);
  };

  const loginServer = async (username, password) => {
    const u = (username || "").trim();
    if (!u || !password) return alert("Please enter username and password");
    try {
      setSyncStatus("Signing in…");
      const res = await api("/auth/login", { method: "POST", body: { username: u, password } });
      if (!res?.token) throw new Error("No token returned from server");
      setToken(res.token);
      setAuthToken(res.token);
      localStorage.setItem(CURR_USER_KEY, u);
      setUser(u);
      setSyncStatus("Signed in");
    } catch (e) {
      alert(e.message);
      setSyncStatus("Ready");
    }
  };

  const registerServer = async (username, password) => {
    const u = (username || "").trim();
    if (!u || !password) return alert("Please enter username and password");
    try {
      setSyncStatus("Creating account…");
      const res = await api("/auth/register", { method: "POST", body: { username: u, password } });
      if (!res?.token) throw new Error("No token returned from server");
      setToken(res.token);
      setAuthToken(res.token);
      localStorage.setItem(CURR_USER_KEY, u);
      setUser(u);
      setSyncStatus("Signed in");
    } catch (e) {
      alert(e.message);
      setSyncStatus("Ready");
    }
  };

  const logout = () => {
    localStorage.removeItem(CURR_USER_KEY);
    setUser("");
    setItems([]);
    setProfileOpen(false);
    setPomoSettingsOpen(false);
    if (SERVER_ENABLED) {
      clearToken();
      setAuthToken("");
      setSyncStatus("Ready");
    }
  };

  const login = (username, password) => (SERVER_ENABLED ? loginServer(username, password) : loginLocal(username));
  const register = (username, password) => (SERVER_ENABLED ? registerServer(username, password) : loginLocal(username));

  // ===== Items/tasks helpers =====
  const updateItem = (id, patch) => setItems((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const addItem = (type) => {
    const idx = items.filter((x) => x.type === type).length + 1;
    const dt = new Date();
    dt.setDate(dt.getDate() + (type === "daily" ? 0 : 14));
    const newItem = {
      id: crypto.randomUUID(),
      type,
      name: type === "daily" ? "Daily To-Dos" : `${type[0].toUpperCase() + type.slice(1)} ${idx}`,
      colorIdx: items.length % PALETTE.length,
      dueDate: fmtYMD(dt),
      tasks: [],
    };
    setItems((prev) => [...prev, newItem]);
  };

  const addTask = (itemId) => {
    const task = { id: crypto.randomUUID(), date: today, topic: "New task", status: "Not Started" };
    setItems((prev) => prev.map((m) => (m.id === itemId ? { ...m, tasks: [...(m.tasks || []), task] } : m)));
  };

  const removeTask = (itemId, taskId) =>
    setItems((prev) =>
      prev.map((m) => (m.id === itemId ? { ...m, tasks: (m.tasks || []).filter((t) => t.id !== taskId) } : m))
    );

  const setTaskStatus = (itemId, taskId, next) =>
    setItems((prev) =>
      prev.map((m) =>
        m.id === itemId ? { ...m, tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t)) } : m
      )
    );

  const cycleTaskStatus = (itemId, taskId) =>
    setItems((prev) =>
      prev.map((m) =>
        m.id === itemId
          ? { ...m, tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, status: nextStatus(t.status) } : t)) }
          : m
      )
    );

  const progressFor = (m) => {
    const total = m.tasks?.length || 0;
    if (!total) return 0;
    const done = m.tasks.filter((t) => t.status === "Done").length;
    return Math.round((done / total) * 100);
  };

  const overallProgress = useMemo(() => {
    if (!items?.length) return 0;
    const arr = items.map(progressFor);
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }, [items]);

  const todayTodos = useMemo(
    () =>
      items.flatMap((m) =>
        (m.tasks || [])
          .filter((t) => t.date === today)
          .map((t) => ({ ...t, itemId: m.id, name: m.name, type: m.type, colorIdx: m.colorIdx }))
      ),
    [items, today]
  );

  const filteredItems = useMemo(() => items.filter((x) => x.type === category), [items, category]);

  const countdownFor = (m) => {
    if (m.type === "daily") return 0;
    return daysBetween(new Date(), parseYMD(m.dueDate));
  };

  const resetData = () => {
    if (confirm("Reset data for this user?")) setItems(DEFAULT_ITEMS());
    setProfileOpen(false);
  };

  // ===== Pomodoro actions =====
  const setPomoMode = (mode) => {
    setPomo((prev) => {
      const dur = durationForMode(prev, mode);
      return { ...prev, mode, isRunning: false, secondsLeft: dur, targetTs: null };
    });
  };
  const startPomo = () => {
    setPomo((prev) => {
      const now = Date.now();
      const targetTs = now + prev.secondsLeft * 1000;
      return { ...prev, isRunning: true, targetTs };
    });
  };
  const pausePomo = () => setPomo((prev) => ({ ...prev, isRunning: false, targetTs: null }));
  const resetPomo = () => {
    setPomo((prev) => {
      const dur = durationForMode(prev, prev.mode);
      return { ...prev, isRunning: false, secondsLeft: dur, targetTs: null };
    });
  };
  const updatePomoSetting = (key, val) => {
    setPomo((prev) => {
      const next = { ...prev, [key]: val };
      if (!next.isRunning) next.secondsLeft = durationForMode(next, next.mode);
      return next;
    });
  };

  // ===================== RENDER =====================
  if (!user) return <AuthScreen onLogin={login} onRegister={register} serverEnabled={SERVER_ENABLED} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/80 border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">✨ Study Productivity</h1>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <p className="text-slate-500 text-xs sm:text-sm">
                Signed in as <b className="break-all">{user}</b>
              </p>
              <span className="text-[11px] px-2 py-1 rounded-full border bg-white text-slate-600">
                {SERVER_ENABLED ? `Sync: ${syncStatus}` : "Local mode"}
              </span>
              <span className="text-[11px] px-2 py-1 rounded-full border bg-white text-slate-600">
                Overall: <b>{overallProgress}%</b>
              </span>
            </div>
          </div>

          {/* Profile icon dropdown */}
          <div className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-10 h-10 rounded-full border bg-white shadow-sm grid place-items-center"
              aria-label="Profile menu"
              title="Profile"
            >
              <IconUser className="w-5 h-5 text-slate-700" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border bg-white shadow-lg overflow-hidden z-30">
                <div className="px-3 py-2 text-xs text-slate-500 border-b">Account</div>

                <button
                  onClick={() => {
                    setPomoSettingsOpen(true);
                    setProfileOpen(false);
                  }}
                  className="w-full px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <IconSettings className="w-4 h-4" />
                  Pomodoro settings
                </button>

                <button
                  onClick={resetData}
                  className="w-full px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <IconReset className="w-4 h-4" />
                  Reset data
                </button>

                <button
                  onClick={logout}
                  className="w-full px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-rose-600"
                >
                  <IconLogout className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="max-w-6xl mx-auto px-4 pb-3 hidden md:block">
          <div className="grid grid-cols-4 gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-xl border ${
                  activeTab === t.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 pb-32 md:pb-6">
        {/* Planner filter (NO 'All') */}
        {activeTab === "planner" && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {[
              { id: "exam", label: "Exams" },
              { id: "project", label: "Projects" },
              { id: "daily", label: "Daily" },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`px-3 py-2 rounded-xl border text-sm ${
                  category === c.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === "overview" && <Overview items={items} progressFor={progressFor} countdownFor={countdownFor} />}
        {activeTab === "today" && <Today todos={todayTodos} setTaskStatus={setTaskStatus} />}
        {activeTab === "planner" && (
          <Planner
            items={filteredItems}
            updateItem={updateItem}
            addTask={addTask}
            addItem={addItem}
            removeTask={removeTask}
            setTaskStatus={setTaskStatus}
            cycleTaskStatus={cycleTaskStatus}
            progressFor={progressFor}
            category={category}
          />
        )}
        {activeTab === "timer" && (
          <PomodoroClock
            pomo={pomo}
            onSetMode={setPomoMode}
            onStart={startPomo}
            onPause={pausePomo}
            onReset={resetPomo}
          />
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur border-t md:hidden">
        <div className="max-w-6xl mx-auto px-2 py-2 grid grid-cols-4 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-3 rounded-xl border text-sm ${
                activeTab === tab.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
              }`}
            >
              {tab.id === "timer" ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <IconStopwatch className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
              ) : (
                tab.label
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Click-away */}
      {profileOpen && (
        <button
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setProfileOpen(false)}
          aria-label="Close profile menu"
          tabIndex={-1}
        />
      )}

      {/* Pomodoro settings modal (from profile) */}
      {pomoSettingsOpen && (
        <Modal title="Pomodoro Settings" onClose={() => setPomoSettingsOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Adjust durations (minutes). Long break every 4 focus rounds.
            </p>
            <SettingRow label="Focus" value={pomo.focusMin} onChange={(v) => updatePomoSetting("focusMin", v)} />
            <SettingRow label="Short break" value={pomo.shortMin} onChange={(v) => updatePomoSetting("shortMin", v)} />
            <SettingRow label="Long break" value={pomo.longMin} onChange={(v) => updatePomoSetting("longMin", v)} />

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setPomoSettingsOpen(false)}
                className="px-4 py-2 rounded-xl border bg-white"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===================== AUTH =====================
function AuthScreen({ onLogin, onRegister, serverEnabled }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Welcome</h2>

        {!serverEnabled ? (
          <p className="text-slate-600 mt-1 text-sm">Local mode. Enter a username to start.</p>
        ) : (
          <p className="text-slate-600 mt-1 text-sm">Server mode enabled. Sign in to sync across devices.</p>
        )}

        <div className="mt-4 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Username"
            className="w-full px-3 py-2 rounded-xl border"
          />
          {serverEnabled && (
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password"
              type="password"
              className="w-full px-3 py-2 rounded-xl border"
            />
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={() => onRegister(name, pw)} className="flex-1 px-4 py-2 rounded-xl bg-slate-900 text-white">
            Register
          </button>
          <button onClick={() => onLogin(name, pw)} className="flex-1 px-4 py-2 rounded-xl border">
            Login
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          {serverEnabled ? "Your items + tasks sync to your server account." : "Data stays on this device (localStorage)."}
        </p>
      </div>
    </div>
  );
}

// ===================== OVERVIEW (pretty + categorized headers) =====================
function Overview({ items, progressFor, countdownFor }) {
  const byType = useMemo(() => {
    const g = { exam: [], project: [], daily: [] };
    for (const it of items) g[it.type]?.push(it);
    return g;
  }, [items]);

  return (
    <section className="space-y-6">
      {["exam", "project", "daily"].map((type) => {
        const list = byType[type] || [];
        if (!list.length) return null;
        const tm = typeMeta(type);

        return (
          <div key={type} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ring-1 ${tm.chip}`}>{tm.label}</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {list.map((m) => {
                const colors = PALETTE[m.colorIdx % PALETTE.length];
                return (
                  <div key={m.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${colors.pill}`}>
                          <span className={`inline-block w-2 h-2 rounded-full ${colors.bg}`}></span>
                          <span className="truncate">{m.name}</span>
                        </div>

                        <div className="mt-3 text-sm text-slate-700">
                          {type === "daily" ? (
                            <span className="text-slate-500">Daily list</span>
                          ) : (
                            <>
                              Due: <span className="font-medium">{m.dueDate}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {type !== "daily" && (
                        <div className={`shrink-0 px-3 py-1 rounded-lg text-white ${colors.bg}`}>
                          {countdownFor(m)} days
                        </div>
                      )}
                    </div>

                    <div className="mt-5">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{progressFor(m)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden ring-1 ring-slate-200">
                        <div className={`h-full ${colors.bg}`} style={{ width: `${progressFor(m)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ===================== TODAY =====================
function Today({ todos, setTaskStatus }) {
  if (!todos.length) return <p className="text-slate-600">🎉 No tasks for today.</p>;

  return (
    <section className="space-y-3">
      {todos.map((t) => {
        const meta = statusMeta(t.status);
        const tm = typeMeta(t.type);
        return (
          <div key={t.id} className={`rounded-2xl border bg-white p-4 shadow-sm`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${tm.chip}`}>{tm.label}</span>
                  <span className="text-sm text-slate-500 truncate">{t.name}</span>
                </div>
                <div className="font-medium truncate mt-1">{t.topic}</div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl ring-1 ${meta.pill} text-sm`}>
                  <StatusIcon status={t.status} className={`w-4 h-4 ${meta.iconColor}`} />
                  {meta.label}
                </span>

                <select
                  value={t.status}
                  onChange={(e) => setTaskStatus(t.itemId, t.id, e.target.value)}
                  className="px-3 py-2 rounded-xl border bg-white text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ===================== PLANNER (tinted by type + category label above each card) =====================
function Planner({ items, updateItem, addTask, addItem, removeTask, setTaskStatus, cycleTaskStatus, progressFor, category }) {
  const [openMap, setOpenMap] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!items.length) return;
    setOpenMap((prev) => (Object.keys(prev).length ? prev : { [items[0].id]: true }));
  }, [items]);

  const isOpen = (id) => !!openMap[id];
  const toggle = (id) => setOpenMap((p) => ({ ...p, [id]: !p[id] }));

  const headerTitle = typeMeta(category).label;

  return (
    <section className="space-y-4 relative">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{headerTitle}</h2>

        <button
          onClick={() => addItem(category)}
          className="hidden md:inline-flex px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm"
        >
          + {category === "daily" ? "List" : "Item"}
        </button>
      </div>

      {items.map((m) => {
        const colors = PALETTE[m.colorIdx % PALETTE.length];
        const tm = typeMeta(m.type);
        const sortedTasks = (m.tasks || []).slice().sort((a, b) => a.date.localeCompare(b.date));

        return (
          <div key={m.id} className="space-y-2">
            {/* Category label above */}
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${tm.chip}`}>{tm.label}</span>
            </div>

            <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden`}>
              {/* Header */}
              <div className={`${colors.bg} text-white px-4 py-3`}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={m.name}
                    onChange={(e) => updateItem(m.id, { name: e.target.value })}
                    className="min-w-[10rem] flex-1 px-3 py-2 rounded-lg text-slate-900 text-sm"
                  />

                  {m.type !== "daily" ? (
                    <input
                      type="date"
                      value={m.dueDate}
                      onChange={(e) => updateItem(m.id, { dueDate: e.target.value })}
                      className="px-3 py-2 rounded-lg text-slate-900 text-sm bg-white"
                      aria-label="Due date"
                    />
                  ) : (
                    <span className="px-3 py-2 rounded-lg bg-white/15 text-sm">Daily</span>
                  )}

                  <span className="px-2 py-1 rounded-lg bg-white/15 text-xs font-semibold">{progressFor(m)}%</span>

                  <button
                    onClick={() => addTask(m.id)}
                    className="hidden md:inline-flex ml-auto px-3 py-2 rounded-lg bg-white/15 ring-1 ring-white/25 text-sm"
                  >
                    + Task
                  </button>

                  <button
                    onClick={() => toggle(m.id)}
                    className="md:hidden ml-auto px-2 py-2 rounded-lg bg-white/15 ring-1 ring-white/20"
                    aria-label={isOpen(m.id) ? "Collapse" : "Expand"}
                    title={isOpen(m.id) ? "Collapse" : "Expand"}
                  >
                    {isOpen(m.id) ? "▾" : "▸"}
                  </button>
                </div>
              </div>

              {/* Body tinted by type */}
              <div className={`${isOpen(m.id) ? "block" : "hidden"} md:block p-4 ${tm.tint}`}>
                {!sortedTasks.length ? (
                  <p className="text-slate-600">No tasks yet. Tap + to add.</p>
                ) : (
                  <>
                    {/* MOBILE: one line + status icon only */}
                    <div className="md:hidden space-y-2">
                      {sortedTasks.map((t) => {
                        const meta = statusMeta(t.status);
                        return (
                          <div key={t.id} className={`flex items-center gap-2`}>
                            <input
                              type="date"
                              value={t.date}
                              onChange={(e) =>
                                updateItem(m.id, {
                                  tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, date: e.target.value } : x)),
                                })
                              }
                              className="w-[9.5rem] shrink-0 px-3 py-2 rounded-lg border text-sm bg-white/70"
                              aria-label="Task date"
                            />

                            <input
                              value={t.topic}
                              onChange={(e) =>
                                updateItem(m.id, {
                                  tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, topic: e.target.value } : x)),
                                })
                              }
                              className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm bg-white"
                              aria-label="Task topic"
                            />

                            <button
                              onClick={() => cycleTaskStatus(m.id, t.id)}
                              className={`w-11 h-11 shrink-0 grid place-items-center rounded-lg ring-1 ${meta.pill}`}
                              aria-label={`Status: ${meta.label} (tap to change)`}
                              title={`Status: ${meta.label} (tap to change)`}
                            >
                              <StatusIcon status={t.status} className={`w-5 h-5 ${meta.iconColor}`} />
                            </button>

                            <button
                              onClick={() => removeTask(m.id, t.id)}
                              className="w-11 h-11 shrink-0 grid place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600"
                              aria-label="Delete task"
                              title="Delete"
                            >
                              <IconTrash className="w-5 h-5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* DESKTOP: status pill + select */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-600">
                            <th className="py-2 pr-4">Date</th>
                            <th className="py-2 pr-4">Task</th>
                            <th className="py-2 pr-4">Status</th>
                            <th className="py-2 pr-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTasks.map((t) => {
                            const meta = statusMeta(t.status);
                            return (
                              <tr key={t.id} className="border-t border-slate-200/60">
                                <td className="py-2 pr-4 whitespace-nowrap">
                                  <input
                                    type="date"
                                    value={t.date}
                                    onChange={(e) =>
                                      updateItem(m.id, {
                                        tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, date: e.target.value } : x)),
                                      })
                                    }
                                    className="px-2 py-1 rounded-lg border bg-white"
                                  />
                                </td>

                                <td className="py-2 pr-4 w-full">
                                  <input
                                    value={t.topic}
                                    onChange={(e) =>
                                      updateItem(m.id, {
                                        tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, topic: e.target.value } : x)),
                                      })
                                    }
                                    className="w-full px-3 py-1 rounded-lg border bg-white"
                                  />
                                </td>

                                <td className="py-2 pr-4">
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg ring-1 ${meta.pill}`}>
                                      <StatusIcon status={t.status} className={`w-4 h-4 ${meta.iconColor}`} />
                                      {meta.label}
                                    </span>

                                    <select
                                      value={t.status}
                                      onChange={(e) => setTaskStatus(m.id, t.id, e.target.value)}
                                      className="px-2 py-1 rounded-lg border bg-white"
                                    >
                                      {STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </td>

                                <td className="py-2 pr-4">
                                  <button
                                    onClick={() => removeTask(m.id, t.id)}
                                    className="px-2 py-2 rounded-lg border bg-white hover:bg-slate-50 inline-flex items-center justify-center"
                                    aria-label="Delete task"
                                    title="Delete"
                                  >
                                    <IconTrash className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* MOBILE: single + (add task OR new item) */}
      <button
        onClick={() => setPickerOpen(true)}
        className="md:hidden fixed right-5 bottom-20 z-40 w-14 h-14 rounded-full bg-slate-900 text-white shadow-lg grid place-items-center"
        aria-label="Add"
        title="Add"
      >
        <IconPlus className="w-6 h-6" />
      </button>

      {pickerOpen && (
        <AddPickerSheet
          items={items}
          currentType={category}
          onClose={() => setPickerOpen(false)}
          onAddTask={addTask}
          onAddItem={addItem}
        />
      )}
    </section>
  );
}

function AddPickerSheet({ items, currentType, onClose, onAddTask, onAddItem }) {
  const tm = typeMeta(currentType);
  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl border-t shadow-xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Add</h3>
          <button onClick={onClose} className="px-3 py-2 rounded-lg border text-sm">
            Close
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          <button
            onClick={() => {
              onAddItem(currentType);
              onClose();
            }}
            className="w-full rounded-xl border px-3 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${tm.chip}`}>{tm.label}</span>
              <div className="font-medium text-sm">New {currentType === "daily" ? "list" : "item"}</div>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Creates a new card in this category</div>
          </button>
        </div>

        <div className="mt-4">
          <div className="text-xs text-slate-500 mb-2">New task → choose where</div>
          <div className="grid gap-2 max-h-64 overflow-auto pr-1">
            {items.map((m) => {
              const colors = PALETTE[m.colorIdx % PALETTE.length];
              const cat = typeMeta(m.type);
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onAddTask(m.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between rounded-xl border px-3 py-3 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${colors.bg}`} />
                    <span className="truncate font-medium">{m.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${cat.chip}`}>{cat.label}</span>
                  </div>
                  <span className="text-xs text-slate-500">{m.type === "daily" ? "—" : m.dueDate}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================== TIMER (clock style) =====================
function PomodoroClock({ pomo, onSetMode, onStart, onPause, onReset }) {
  const modeLabel = pomo.mode === "focus" ? "Focus" : pomo.mode === "short" ? "Short Break" : "Long Break";
  const total = useMemo(() => {
    const focus = pomo.focusMin * 60;
    const short = pomo.shortMin * 60;
    const long = pomo.longMin * 60;
    if (pomo.mode === "short") return short;
    if (pomo.mode === "long") return long;
    return focus;
  }, [pomo.mode, pomo.focusMin, pomo.shortMin, pomo.longMin]);

  const progress = total > 0 ? 1 - pomo.secondsLeft / total : 0;

  // SVG ring
  const size = 280;
  const r = 110;
  const c = 2 * Math.PI * r;
  const dash = c * clamp(progress, 0, 1);
  const dashOffset = c - dash;

  // "clock hand" angle (start at -90deg)
  const angle = -90 + 360 * clamp(progress, 0, 1);
  const handLen = 85;
  const cx = size / 2;
  const cy = size / 2;

  const handX = cx + handLen * Math.cos((angle * Math.PI) / 180);
  const handY = cy + handLen * Math.sin((angle * Math.PI) / 180);

  const chip =
    pomo.mode === "focus"
      ? "bg-slate-900 text-white"
      : pomo.mode === "short"
      ? "bg-amber-100 text-amber-900 border border-amber-200"
      : "bg-emerald-100 text-emerald-900 border border-emerald-200";

  return (
    <section className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pomodoro</h2>
            <p className="text-sm text-slate-500">
              {modeLabel} • Round {pomo.rounds}
            </p>
          </div>

          <span className={`px-3 py-2 rounded-xl text-sm ${chip}`}>{pomo.isRunning ? "Running" : "Paused"}</span>
        </div>

        <div className="mt-6 flex justify-center">
          <div className="relative" style={{ width: size, height: size }}>
            {/* Dial */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-slate-50 to-white border shadow-sm" />

            {/* Ticks */}
            <svg className="absolute inset-0" viewBox={`0 0 ${size} ${size}`}>
              {[...Array(60)].map((_, i) => {
                const a = (-90 + i * 6) * (Math.PI / 180);
                const outer = r + 18;
                const inner = i % 5 === 0 ? r + 6 : r + 12;
                const x1 = cx + outer * Math.cos(a);
                const y1 = cy + outer * Math.sin(a);
                const x2 = cx + inner * Math.cos(a);
                const y2 = cy + inner * Math.sin(a);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(15,23,42,0.22)"
                    strokeWidth={i % 5 === 0 ? 2 : 1}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>

            {/* Progress ring */}
            <svg className="absolute inset-0" viewBox={`0 0 ${size} ${size}`}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="rgba(148,163,184,0.35)"
                strokeWidth="14"
              />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="rgba(15,23,42,0.95)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            </svg>

            {/* Hand */}
            <svg className="absolute inset-0" viewBox={`0 0 ${size} ${size}`}>
              <line
                x1={cx}
                y1={cy}
                x2={handX}
                y2={handY}
                stroke="rgba(15,23,42,0.9)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx={cx} cy={cy} r="6" fill="rgba(15,23,42,0.9)" />
            </svg>

            {/* Center readout */}
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-5xl font-semibold tracking-tight">{formatMMSS(pomo.secondsLeft)}</div>
                <div className="mt-2 text-sm text-slate-500">{modeLabel}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Mode buttons */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ModeBtn active={pomo.mode === "focus"} onClick={() => onSetMode("focus")}>
            Focus
          </ModeBtn>
          <ModeBtn active={pomo.mode === "short"} onClick={() => onSetMode("short")}>
            Short
          </ModeBtn>
          <ModeBtn active={pomo.mode === "long"} onClick={() => onSetMode("long")}>
            Long
          </ModeBtn>
        </div>

        {/* ICON controls */}
        <div className="mt-5 flex justify-center gap-3">
          <IconButton
            label={pomo.isRunning ? "Pause" : "Start"}
            onClick={pomo.isRunning ? onPause : onStart}
            primary
          >
            {pomo.isRunning ? <IconPause className="w-5 h-5" /> : <IconPlay className="w-5 h-5" />}
          </IconButton>

          <IconButton label="Reset" onClick={onReset}>
            <IconReset className="w-5 h-5" />
          </IconButton>
        </div>

        <p className="mt-4 text-xs text-slate-500 text-center">
          Settings are in Profile → Pomodoro settings.
        </p>
      </div>

      {/* Right card: simple info + vibes */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="font-semibold">How to use</h3>
        <div className="mt-2 text-sm text-slate-600 space-y-2">
          <p>
            Use <b>Focus</b> for deep work, then take a <b>Short</b> break.
          </p>
          <p>
            Every 4 focus rounds, you’ll naturally want a <b>Long</b> break — the timer supports that flow.
          </p>
          <p>
            Keep this tab open while working, or just switch back and forth as needed.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
          <div className="text-sm font-medium">Quick idea</div>
          <div className="text-sm text-slate-600 mt-1">
            For your “multi-use” productivity vibe: create a <b>Daily</b> list like “Morning Reset” and throw all tiny tasks there.
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl border text-sm ${
        active ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children, primary }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-12 rounded-2xl grid place-items-center border shadow-sm ${
        primary ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50"
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

// ===================== SETTINGS UI =====================
function SettingRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(clamp(value - 1, 1, 90))}
          className="w-10 h-10 rounded-xl border bg-white grid place-items-center"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value) || 1, 1, 90))}
          className="w-20 px-3 py-2 rounded-xl border text-sm"
        />
        <button
          onClick={() => onChange(clamp(value + 1, 1, 90))}
          className="w-10 h-10 rounded-xl border bg-white grid place-items-center"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="absolute inset-x-0 top-16 mx-auto max-w-lg px-4">
        <div className="rounded-2xl border bg-white shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold">{title}</div>
            <button onClick={onClose} className="px-3 py-2 rounded-xl border bg-white text-sm">
              Close
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}