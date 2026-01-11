import { useEffect, useMemo, useRef, useState } from "react";

/**
 * ✅ Status colors + icons:
 *   - Not Started = red
 *   - In Progress = orange
 *   - Done = green
 * ✅ Mobile status control shows ICONS only (tap to cycle status)
 * ✅ Multi-use: Exams / Projects / Daily (categorized)
 * ✅ Pomodoro timer tab + mini dock
 * ✅ Still supports server sync if API_BASE is set
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

// Fixed palette per item
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
  if (type === "exam") return { label: "Exams", chip: "bg-sky-50 text-sky-700 ring-sky-200" };
  if (type === "project") return { label: "Projects", chip: "bg-purple-50 text-purple-700 ring-purple-200" };
  return { label: "Daily", chip: "bg-slate-50 text-slate-700 ring-slate-200" };
}

// ========== Local storage fallback ==========
const USERS_KEY = "sp_users_v2";
const CURR_USER_KEY = "sp_current_user_v2";
const itemsKey = (u) => `sp_items_v2_${u}`;
const POMO_KEY = "sp_pomo_v2";

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

const TOKEN_KEY = "sp_token_v2";
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
    // Exams
    { id: crypto.randomUUID(), type: "exam", name: "BGS", colorIdx: 0, dueDate: d(21), tasks: [] },
    { id: crypto.randomUUID(), type: "exam", name: "Econs", colorIdx: 1, dueDate: d(28), tasks: [] },

    // Projects
    { id: crypto.randomUUID(), type: "project", name: "Omni Iteration", colorIdx: 2, dueDate: d(14), tasks: [] },

    // Daily
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
function IconCircleX({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6" />
      <path d="M15 9l-6 6" />
    </svg>
  );
}

// Status icons
function IconStatusNotStarted({ className = "" }) {
  // empty circle
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
function IconStatusInProgress({ className = "" }) {
  // half circle
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4a8 8 0 1 0 8 8" />
      <path d="M12 4v8h8" />
    </svg>
  );
}
function IconStatusDone({ className = "" }) {
  // check circle
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
    // we store a "targetTs" when running so refresh keeps timer correct
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
  const [profileOpen, setProfileOpen] = useState(false);

  // Filters for categories
  const [category, setCategory] = useState("all"); // all | exam | project | daily

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
          const data = await api("/modules", { token }); // keep same endpoint for your server
          if (!cancelled) {
            // Accept either legacy {examDate} or new {dueDate}
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

  // ===== Pomodoro ticking (refresh-safe using targetTs) =====
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
          // Auto advance
          const next = { ...prev, isRunning: false, secondsLeft: 0, targetTs: null };
          // Cycle focus -> short -> focus -> short -> focus -> long every 4 focus rounds
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
    // daily starts today; others default +14 days
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
          ? {
              ...m,
              tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, status: nextStatus(t.status) } : t)),
            }
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

  const filteredItems = useMemo(() => {
    if (category === "all") return items;
    return items.filter((x) => x.type === category);
  }, [items, category]);

  const grouped = useMemo(() => {
    const g = { exam: [], project: [], daily: [] };
    for (const it of filteredItems) g[it.type]?.push(it);
    // sort by due date
    for (const k of Object.keys(g)) g[k].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    return g;
  }, [filteredItems]);

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
  const pausePomo = () => {
    setPomo((prev) => ({ ...prev, isRunning: false, targetTs: null }));
  };
  const resetPomo = () => {
    setPomo((prev) => {
      const dur = durationForMode(prev, prev.mode);
      return { ...prev, isRunning: false, secondsLeft: dur, targetTs: null };
    });
  };
  const updatePomoSetting = (key, val) => {
    setPomo((prev) => {
      const next = { ...prev, [key]: val };
      // if not running, keep secondsLeft aligned to current mode
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
              <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-30">
                <div className="px-3 py-2 text-xs text-slate-500 border-b">Account</div>

                <button
                  onClick={resetData}
                  className="w-full px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <IconReset className="w-4 h-4" />
                  Reset
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
        {/* Category filter (not on timer tab) */}
        {activeTab !== "timer" && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {[
              { id: "all", label: "All" },
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

        {activeTab === "overview" && <Overview grouped={grouped} progressFor={progressFor} countdownFor={countdownFor} />}
        {activeTab === "today" && <Today todos={todayTodos} setTaskStatus={setTaskStatus} />}
        {activeTab === "planner" && (
          <Planner
            grouped={grouped}
            updateItem={updateItem}
            addTask={addTask}
            addItem={addItem}
            removeTask={removeTask}
            setTaskStatus={setTaskStatus}
            cycleTaskStatus={cycleTaskStatus}
            progressFor={progressFor}
          />
        )}
        {activeTab === "timer" && (
          <Pomodoro
            pomo={pomo}
            onSetMode={setPomoMode}
            onStart={startPomo}
            onPause={pausePomo}
            onReset={resetPomo}
            onUpdateSetting={updatePomoSetting}
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

      {/* Mini Pomodoro dock (shows on all tabs except timer) */}
      {activeTab !== "timer" && (
        <MiniPomoDock pomo={pomo} onGoTimer={() => setActiveTab("timer")} onToggle={pomo.isRunning ? pausePomo : startPomo} />
      )}

      {/* Click-away for profile dropdown */}
      {profileOpen && (
        <button
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setProfileOpen(false)}
          aria-label="Close profile menu"
          tabIndex={-1}
        />
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

// ===================== OVERVIEW =====================
function Overview({ grouped, progressFor, countdownFor }) {
  return (
    <section className="space-y-6">
      {["exam", "project", "daily"].map((type) => {
        const list = grouped[type] || [];
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
        return (
          <div
            key={t.id}
            className="rounded-2xl border bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-sm text-slate-500">{t.name}</div>
              <div className="font-medium truncate">{t.topic}</div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl ring-1 ${meta.pill} text-sm`}>
                <StatusIcon status={t.status} className={`w-4 h-4 ${meta.iconColor}`} />
                <span className="hidden sm:inline">{meta.label}</span>
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
        );
      })}
    </section>
  );
}

// ===================== PLANNER =====================
function Planner({ grouped, updateItem, addTask, addItem, removeTask, setTaskStatus, cycleTaskStatus, progressFor }) {
  const [openMap, setOpenMap] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);

  // default open first visible item
  useEffect(() => {
    const all = [...(grouped.exam || []), ...(grouped.project || []), ...(grouped.daily || [])];
    if (!all.length) return;
    setOpenMap((prev) => (Object.keys(prev).length ? prev : { [all[0].id]: true }));
  }, [grouped]);

  const isOpen = (id) => !!openMap[id];
  const toggle = (id) => setOpenMap((p) => ({ ...p, [id]: !p[id] }));

  return (
    <section className="space-y-6 relative">
      {["exam", "project", "daily"].map((type) => {
        const list = grouped[type] || [];
        if (!list.length) return null;
        const tm = typeMeta(type);

        return (
          <div key={type} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ring-1 ${tm.chip}`}>{tm.label}</span>

              {/* Desktop add button per category */}
              <button
                onClick={() => addItem(type)}
                className="hidden md:inline-flex px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm"
              >
                + {type === "daily" ? "List" : "Item"}
              </button>
            </div>

            {list.map((m) => {
              const colors = PALETTE[m.colorIdx % PALETTE.length];
              const sortedTasks = (m.tasks || []).slice().sort((a, b) => a.date.localeCompare(b.date));

              return (
                <div key={m.id} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  {/* Header (single line, wraps nicely) */}
                  <div className={`${colors.bg} text-white px-4 py-3`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={m.name}
                        onChange={(e) => updateItem(m.id, { name: e.target.value })}
                        className="min-w-[10rem] flex-1 px-3 py-2 rounded-lg text-slate-900 text-sm"
                      />

                      {/* Due date only for non-daily */}
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

                      {/* Desktop add task */}
                      <button
                        onClick={() => addTask(m.id)}
                        className="hidden md:inline-flex ml-auto px-3 py-2 rounded-lg bg-white/15 ring-1 ring-white/25 text-sm"
                      >
                        + Task
                      </button>

                      {/* Mobile collapse */}
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

                  {/* Body */}
                  <div className={`${isOpen(m.id) ? "block" : "hidden"} md:block p-4`}>
                    {!sortedTasks.length ? (
                      <p className="text-slate-600">No tasks yet. Tap + to add.</p>
                    ) : (
                      <>
                        {/* MOBILE: everything on ONE line + status ICON ONLY */}
                        <div className="md:hidden space-y-2">
                          {sortedTasks.map((t) => {
                            const meta = statusMeta(t.status);
                            return (
                              <div key={t.id} className="flex items-center gap-2">
                                <input
                                  type="date"
                                  value={t.date}
                                  onChange={(e) =>
                                    updateItem(m.id, {
                                      tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, date: e.target.value } : x)),
                                    })
                                  }
                                  className="w-[9.5rem] shrink-0 px-3 py-2 rounded-lg border text-sm bg-slate-50"
                                  aria-label="Task date"
                                />

                                <input
                                  value={t.topic}
                                  onChange={(e) =>
                                    updateItem(m.id, {
                                      tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, topic: e.target.value } : x)),
                                    })
                                  }
                                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm"
                                  aria-label="Task topic"
                                />

                                {/* Mobile status: ICON ONLY, tap to cycle */}
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

                        {/* DESKTOP: status pill + icon + select */}
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
                                  <tr key={t.id} className="border-t">
                                    <td className="py-2 pr-4 whitespace-nowrap">
                                      <input
                                        type="date"
                                        value={t.date}
                                        onChange={(e) =>
                                          updateItem(m.id, {
                                            tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, date: e.target.value } : x)),
                                          })
                                        }
                                        className="px-2 py-1 rounded-lg border"
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
                                        className="w-full px-3 py-1 rounded-lg border"
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
                                        className="px-2 py-2 rounded-lg border hover:bg-slate-50 inline-flex items-center justify-center"
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
              );
            })}
          </div>
        );
      })}

      {/* MOBILE: single + button (add task OR new item OR new list) */}
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
          grouped={grouped}
          onClose={() => setPickerOpen(false)}
          onAddTask={addTask}
          onAddItem={addItem}
        />
      )}
    </section>
  );
}

function AddPickerSheet({ grouped, onClose, onAddTask, onAddItem }) {
  const all = [...(grouped.exam || []), ...(grouped.project || []), ...(grouped.daily || [])];

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
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { onAddItem("exam"); onClose(); }} className="rounded-xl border px-3 py-3 text-left">
              <div className="font-medium text-sm">New Exam</div>
              <div className="text-xs text-slate-500 mt-0.5">Item</div>
            </button>
            <button onClick={() => { onAddItem("project"); onClose(); }} className="rounded-xl border px-3 py-3 text-left">
              <div className="font-medium text-sm">New Project</div>
              <div className="text-xs text-slate-500 mt-0.5">Item</div>
            </button>
            <button onClick={() => { onAddItem("daily"); onClose(); }} className="rounded-xl border px-3 py-3 text-left">
              <div className="font-medium text-sm">New Daily</div>
              <div className="text-xs text-slate-500 mt-0.5">List</div>
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs text-slate-500 mb-2">New task → choose where</div>
          <div className="grid gap-2 max-h-64 overflow-auto pr-1">
            {all.map((m) => {
              const colors = PALETTE[m.colorIdx % PALETTE.length];
              const tm = typeMeta(m.type);
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
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${tm.chip}`}>{tm.label}</span>
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

// ===================== POMODORO =====================
function Pomodoro({ pomo, onSetMode, onStart, onPause, onReset, onUpdateSetting }) {
  const modeLabel = pomo.mode === "focus" ? "Focus" : pomo.mode === "short" ? "Short Break" : "Long Break";

  return (
    <section className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pomodoro</h2>
            <p className="text-sm text-slate-500">{modeLabel} • Round {pomo.rounds}</p>
          </div>

          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-white text-sm">
            <IconStopwatch className="w-4 h-4" />
            {pomo.isRunning ? "Running" : "Paused"}
          </span>
        </div>

        <div className="mt-6 text-center">
          <div className="text-6xl font-semibold tracking-tight">{formatMMSS(pomo.secondsLeft)}</div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => onSetMode("focus")}
              className={`px-3 py-2 rounded-xl border text-sm ${pomo.mode === "focus" ? "bg-slate-900 text-white" : "bg-white"}`}
            >
              Focus
            </button>
            <button
              onClick={() => onSetMode("short")}
              className={`px-3 py-2 rounded-xl border text-sm ${pomo.mode === "short" ? "bg-slate-900 text-white" : "bg-white"}`}
            >
              Short
            </button>
            <button
              onClick={() => onSetMode("long")}
              className={`px-3 py-2 rounded-xl border text-sm ${pomo.mode === "long" ? "bg-slate-900 text-white" : "bg-white"}`}
            >
              Long
            </button>
          </div>

          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={pomo.isRunning ? onPause : onStart}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white"
            >
              {pomo.isRunning ? "Pause" : "Start"}
            </button>
            <button onClick={onReset} className="px-4 py-2 rounded-xl border bg-white">
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Settings</h3>
        <p className="text-sm text-slate-500 mt-1">Adjust durations (minutes). Auto-cycles long break every 4 focus rounds.</p>

        <div className="mt-4 grid gap-3">
          <SettingRow
            label="Focus"
            value={pomo.focusMin}
            onChange={(v) => onUpdateSetting("focusMin", v)}
          />
          <SettingRow
            label="Short break"
            value={pomo.shortMin}
            onChange={(v) => onUpdateSetting("shortMin", v)}
          />
          <SettingRow
            label="Long break"
            value={pomo.longMin}
            onChange={(v) => onUpdateSetting("longMin", v)}
          />
        </div>

        <div className="mt-5 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
          Tip: Use the mini dock at the bottom to start/pause from any screen.
        </div>
      </div>
    </section>
  );
}

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

function MiniPomoDock({ pomo, onGoTimer, onToggle }) {
  const meta = pomo.isRunning ? { label: "Pause", icon: <IconCircleX className="w-4 h-4" /> } : { label: "Start", icon: <IconStopwatch className="w-4 h-4" /> };
  const modeLabel = pomo.mode === "focus" ? "Focus" : pomo.mode === "short" ? "Short" : "Long";

  return (
    <div className="fixed left-3 right-3 bottom-20 md:bottom-5 z-40 max-w-6xl mx-auto">
      <div className="rounded-2xl border bg-white/90 backdrop-blur shadow-lg px-3 py-2 flex items-center justify-between gap-3">
        <button onClick={onGoTimer} className="flex items-center gap-2 min-w-0">
          <IconStopwatch className="w-4 h-4 text-slate-700" />
          <span className="text-sm font-medium truncate">
            {modeLabel} • {formatMMSS(pomo.secondsLeft)}
          </span>
        </button>

        <button
          onClick={onToggle}
          className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm inline-flex items-center gap-2"
        >
          {meta.icon}
          {meta.label}
        </button>
      </div>
    </div>
  );
}