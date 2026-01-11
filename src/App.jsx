import { useEffect, useMemo, useState } from "react";

// === Helper utils ===
const pad = (n) => String(n).padStart(2, "0");
const fmtYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYMD = (s) => {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
};
const daysBetween = (d1, d2) =>
  Math.ceil((parseYMD(fmtYMD(d2)) - parseYMD(fmtYMD(d1))) / (1000 * 60 * 60 * 24));

// Fixed palette per module (no user choice)
const PALETTE = [
  { name: "Royal", bg: "bg-indigo-600", ring: "ring-indigo-300", pill: "bg-indigo-50 text-indigo-700" },
  { name: "Teal", bg: "bg-teal-600", ring: "ring-teal-300", pill: "bg-teal-50 text-teal-700" },
  { name: "Rose", bg: "bg-rose-600", ring: "ring-rose-300", pill: "bg-rose-50 text-rose-700" },
  { name: "Amber", bg: "bg-amber-600", ring: "ring-amber-300", pill: "bg-amber-50 text-amber-700" },
  { name: "Violet", bg: "bg-violet-600", ring: "ring-violet-300", pill: "bg-violet-50 text-violet-700" },
];

// ========== Local storage fallback (legacy) ==========
const USERS_KEY = "sp_users_v1";
const CURR_USER_KEY = "sp_current_user_v1";
const modulesKey = (u) => `sp_modules_v1_${u}`;

const getUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveUsers = (arr) => localStorage.setItem(USERS_KEY, JSON.stringify(arr));

// ========== Server sync config ==========
/**
 * Set one of these in your Vercel env vars:
 * - VITE_API_BASE (Vite)
 * - REACT_APP_API_BASE (CRA)
 * Example: https://your-api-domain.com
 */
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "";

// If API_BASE is empty, app runs in local mode.
const SERVER_ENABLED = Boolean(API_BASE);

const TOKEN_KEY = "sp_token_v1";
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

// ========== Default modules ==========
const DEFAULT_MODULES = () => {
  const today = new Date();
  const d = (offset) => {
    const x = new Date(today);
    x.setDate(x.getDate() + offset);
    return fmtYMD(x);
  };
  return [
    { id: crypto.randomUUID(), name: "Module 1", colorIdx: 0, examDate: d(21), tasks: [] },
    { id: crypto.randomUUID(), name: "Module 2", colorIdx: 1, examDate: d(24), tasks: [] },
    { id: crypto.randomUUID(), name: "Module 3", colorIdx: 2, examDate: d(27), tasks: [] },
    { id: crypto.randomUUID(), name: "Module 4", colorIdx: 3, examDate: d(30), tasks: [] },
    { id: crypto.randomUUID(), name: "Module 5", colorIdx: 4, examDate: d(33), tasks: [] },
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
function IconLogout({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 4v16" />
    </svg>
  );
}

export default function StudyPlannerApp() {
  const [user, setUser] = useState(() => localStorage.getItem(CURR_USER_KEY) || "");
  const [token, setAuthToken] = useState(() => (SERVER_ENABLED ? getToken() : ""));
  const [modules, setModules] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [daysPerPlan, setDaysPerPlan] = useState(14);
  const [syncStatus, setSyncStatus] = useState(SERVER_ENABLED ? "Ready" : "Local mode");

  const today = useMemo(() => fmtYMD(new Date()), []);

  const tabs = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "today", label: "Today" },
      { id: "planner", label: "Planner" },
    ],
    []
  );

  // =====================
  // LOAD DATA
  // =====================
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
            setModules(Array.isArray(data) ? data : DEFAULT_MODULES());
            setSyncStatus("Synced");
          }
        } catch (e) {
          if (!cancelled) {
            setSyncStatus(`Sync error: ${e.message}`);
            setModules(DEFAULT_MODULES());
          }
        }
        return;
      }

      const saved = localStorage.getItem(modulesKey(user));
      setModules(saved ? JSON.parse(saved) : DEFAULT_MODULES());
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  // =====================
  // SAVE DATA
  // =====================
  useEffect(() => {
    if (!user) return;

    if (SERVER_ENABLED) {
      if (!token) return;

      const doSync = async () => {
        try {
          setSyncStatus("Syncing…");
          await api("/modules", { method: "PUT", body: modules, token });
          setSyncStatus("Synced");
        } catch (e) {
          setSyncStatus(`Sync error: ${e.message}`);
        }
      };

      const t = setTimeout(doSync, 450);
      return () => clearTimeout(t);
    }

    localStorage.setItem(modulesKey(user), JSON.stringify(modules));
  }, [modules, user, token]);

  // =====================
  // AUTH
  // =====================
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

  const registerLocal = (username) => loginLocal(username);

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
    setModules([]);
    if (SERVER_ENABLED) {
      clearToken();
      setAuthToken("");
      setSyncStatus("Ready");
    }
  };

  const login = (username, password) => (SERVER_ENABLED ? loginServer(username, password) : loginLocal(username));
  const register = (username, password) =>
    SERVER_ENABLED ? registerServer(username, password) : registerLocal(username);

  // =====================
  // MODULE/TASK HELPERS
  // =====================
  const updateModule = (id, patch) => setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const addModule = () => {
    const idx = modules.length + 1;
    const dt = new Date();
    // Stagger new module exam dates so it doesn't spawn "today"
    dt.setDate(dt.getDate() + 21 + Math.min(modules.length * 3, 45));
    const newMod = {
      id: crypto.randomUUID(),
      name: `Module ${idx}`,
      colorIdx: modules.length % PALETTE.length,
      examDate: fmtYMD(dt),
      tasks: [],
    };
    setModules((prev) => [...prev, newMod]);
  };

  const generatePlans = () => {
    setModules((prev) =>
      prev.map((m) => {
        const exam = parseYMD(m.examDate);
        const tasks = Array.from({ length: daysPerPlan }, (_, i) => {
          const dt = new Date(exam);
          dt.setDate(dt.getDate() - (daysPerPlan - i));
          return { id: crypto.randomUUID(), date: fmtYMD(dt), topic: `Topic ${i + 1}`, status: "Not Started" };
        });
        return { ...m, tasks };
      })
    );
  };

  const todayTodos = useMemo(
    () =>
      modules.flatMap((m) =>
        (m.tasks || [])
          .filter((t) => t.date === today)
          .map((t) => ({ ...t, modId: m.id, modName: m.name, colorIdx: m.colorIdx }))
      ),
    [modules, today]
  );

  const progressFor = (m) => {
    const total = m.tasks?.length || 0;
    if (!total) return 0;
    const done = m.tasks.filter((t) => t.status === "Done").length;
    return Math.round((done / total) * 100);
  };

  const overallProgress = useMemo(() => {
    if (!modules?.length) return 0;
    const arr = modules.map(progressFor);
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }, [modules]);

  const countdownFor = (m) => daysBetween(new Date(), parseYMD(m.examDate));

  const setTaskStatus = (modId, taskId, next) =>
    setModules((prev) =>
      prev.map((m) =>
        m.id === modId ? { ...m, tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t)) } : m
      )
    );

  const addTask = (modId) => {
    const task = { id: crypto.randomUUID(), date: today, topic: "New task", status: "Not Started" };
    setModules((prev) => prev.map((m) => (m.id === modId ? { ...m, tasks: [...(m.tasks || []), task] } : m)));
  };

  const removeTask = (modId, taskId) =>
    setModules((prev) => prev.map((m) => (m.id === modId ? { ...m, tasks: m.tasks.filter((t) => t.id !== taskId) } : m)));

  // =====================
  // RENDER
  // =====================
  if (!user) return <AuthScreen onLogin={login} onRegister={register} serverEnabled={SERVER_ENABLED} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Compact header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">📚 Study Planner</h1>
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

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={7}
              max={60}
              value={daysPerPlan}
              onChange={(e) => setDaysPerPlan(Number(e.target.value) || 14)}
              className="w-20 px-3 py-2 rounded-lg border bg-white text-sm"
              aria-label="Days per plan"
            />

            {/* Icon logout */}
            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-2"
              aria-label="Logout"
              title="Logout"
            >
              <IconLogout className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Desktop tabs */}
        <nav className="max-w-6xl mx-auto px-4 pb-3 hidden md:block">
          <div className="grid grid-cols-3 gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl border ${
                  activeTab === tab.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 pb-36 md:pb-6">
        {/* Mobile quick actions */}
        <div className="md:hidden flex gap-2 mb-3">
          <button
            onClick={generatePlans}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium"
          >
            Generate
          </button>
          <button
            onClick={() => {
              if (confirm("Reset data for this user?")) setModules(DEFAULT_MODULES());
            }}
            className="px-3 py-2 rounded-lg border text-sm"
          >
            Reset
          </button>
        </div>

        {activeTab === "overview" && (
          <Overview modules={modules} progressFor={progressFor} countdownFor={countdownFor} />
        )}
        {activeTab === "today" && <Today todos={todayTodos} setTaskStatus={setTaskStatus} />}
        {activeTab === "planner" && (
          <Planner
            modules={modules}
            updateModule={updateModule}
            addTask={addTask}
            addModule={addModule}
            removeTask={removeTask}
            setTaskStatus={setTaskStatus}
            progressFor={progressFor}
          />
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur border-t md:hidden">
        <div className="max-w-6xl mx-auto px-2 py-2 grid grid-cols-3 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-3 rounded-xl border text-sm ${
                activeTab === tab.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function AuthScreen({ onLogin, onRegister, serverEnabled }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Welcome to Study Planner</h2>

        {!serverEnabled ? (
          <p className="text-slate-600 mt-1 text-sm">Local mode (no server configured). Create a username to get started.</p>
        ) : (
          <p className="text-slate-600 mt-1 text-sm">Server mode enabled. Sign in to access your account across devices.</p>
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
          {serverEnabled ? "Your tasks sync to your server account." : "No password. Data stays on this device (localStorage)."}
        </p>
      </div>
    </div>
  );
}

function Overview({ modules, progressFor, countdownFor }) {
  return (
    <section className="grid md:grid-cols-2 gap-4 sm:gap-6">
      {modules.map((m) => {
        const colors = PALETTE[m.colorIdx % PALETTE.length];
        return (
          <div key={m.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${colors.pill}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${colors.bg}`}></span>
                  <span className="truncate">{m.name}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">
                  Exam: <span className="font-normal">{m.examDate}</span>
                </h3>
              </div>
              <div className={`shrink-0 px-3 py-1 rounded-lg text-white ${colors.bg}`}>{countdownFor(m)} days</div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Progress</span>
                <span>{progressFor(m)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden ring-1 ring-slate-200">
                <div className={`h-full ${colors.bg}`} style={{ width: `${progressFor(m)}%` }}></div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Today({ todos, setTaskStatus }) {
  if (!todos.length) return <p className="text-slate-600">🎉 No tasks for today.</p>;
  return (
    <section className="space-y-3">
      {todos.map((t) => (
        <div
          key={t.id}
          className="rounded-2xl border bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="text-sm text-slate-500">{t.modName}</div>
            <div className="font-medium truncate">{t.topic}</div>
          </div>
          <select
            value={t.status}
            onChange={(e) => setTaskStatus(t.modId, t.id, e.target.value)}
            className="px-3 py-2 rounded-xl border bg-white w-full sm:w-auto"
          >
            {["Not Started", "In Progress", "Done"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  );
}

/**
 * Planner upgrades:
 * ✅ Exam date on SAME LINE as name + progress (mobile + desktop)
 * ✅ Delete + Logout as icons
 * ✅ Add unlimited modules (+ Module)
 * ✅ Mobile collapsible modules + FAB + bottom sheet
 */
function Planner({ modules, updateModule, addTask, addModule, removeTask, setTaskStatus, progressFor }) {
  const [openMap, setOpenMap] = useState({});
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!modules?.length) return;
    setOpenMap((prev) => {
      const hasAny = Object.keys(prev).length > 0;
      if (hasAny) return prev;
      return { [modules[0].id]: true };
    });
  }, [modules]);

  const isOpen = (id) => !!openMap[id];
  const toggle = (id) => setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  const openIds = useMemo(() => Object.entries(openMap).filter(([, v]) => v).map(([k]) => k), [openMap]);

  const addTaskSmart = () => {
    if (openIds.length === 1) {
      addTask(openIds[0]);
      return;
    }
    setSheetOpen(true);
  };

  return (
    <section className="space-y-6 relative">
      {/* Add Module button (desktop + mobile, but not clunky) */}
      <div className="flex justify-end">
        <button onClick={addModule} className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-slate-50">
          + Module
        </button>
      </div>

      {modules.map((m) => {
        const colors = PALETTE[m.colorIdx % PALETTE.length];
        const sortedTasks = (m.tasks || []).slice().sort((a, b) => a.date.localeCompare(b.date));

        return (
          <div key={m.id} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            {/* Header: everything on ONE line (wraps nicely if needed) */}
            <div className={`${colors.bg} text-white px-4 py-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={m.name}
                  onChange={(e) => updateModule(m.id, { name: e.target.value })}
                  className="min-w-[10rem] flex-1 px-3 py-2 rounded-lg text-slate-900 text-sm"
                />

                <input
                  type="date"
                  value={m.examDate}
                  onChange={(e) => updateModule(m.id, { examDate: e.target.value })}
                  className="px-3 py-2 rounded-lg text-slate-900 text-sm bg-white"
                  aria-label="Exam date"
                />

                <span className="px-2 py-1 rounded-lg bg-white/15 text-xs font-semibold">{progressFor(m)}%</span>

                {/* Desktop add task button */}
                <button
                  onClick={() => addTask(m.id)}
                  className="hidden md:inline-flex ml-auto px-3 py-2 rounded-lg bg-white/15 ring-1 ring-white/25 text-sm"
                >
                  + Task
                </button>

                {/* Collapsible toggle (mobile) */}
                <button
                  onClick={() => toggle(m.id)}
                  className="md:hidden ml-auto px-2 py-2 rounded-lg bg-white/15 ring-1 ring-white/20"
                  aria-label={isOpen(m.id) ? "Collapse module" : "Expand module"}
                  title={isOpen(m.id) ? "Collapse" : "Expand"}
                >
                  {isOpen(m.id) ? "▾" : "▸"}
                </button>
              </div>
            </div>

            {/* Body */}
            <div className={`${isOpen(m.id) ? "block" : "hidden"} md:block p-4`}>
              {!sortedTasks.length ? (
                <p className="text-slate-600">No tasks yet. Use the + button to add one.</p>
              ) : (
                <>
                  {/* MOBILE: cards */}
                  <div className="space-y-3 md:hidden">
                    {sortedTasks.map((t) => (
                      <div key={t.id} className="rounded-xl border bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={t.date}
                            onChange={(e) =>
                              updateModule(m.id, {
                                tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, date: e.target.value } : x)),
                              })
                            }
                            className="flex-1 px-3 py-2 rounded-lg border text-sm bg-slate-50"
                          />

                          {/* Icon delete */}
                          <button
                            onClick={() => removeTask(m.id, t.id)}
                            className="w-11 h-11 grid place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600"
                            aria-label="Delete task"
                            title="Delete"
                          >
                            <IconTrash className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="mt-2">
                          <label className="text-xs text-slate-500">Topic</label>
                          <input
                            value={t.topic}
                            onChange={(e) =>
                              updateModule(m.id, {
                                tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, topic: e.target.value } : x)),
                              })
                            }
                            className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                          />
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-slate-500 w-14">Status</label>
                          <select
                            value={t.status}
                            onChange={(e) => setTaskStatus(m.id, t.id, e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border text-sm bg-white"
                          >
                            {["Not Started", "In Progress", "Done"].map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* DESKTOP: table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-600">
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2 pr-4">Topic</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTasks.map((t) => (
                          <tr key={t.id} className="border-t">
                            <td className="py-2 pr-4 whitespace-nowrap">
                              <input
                                type="date"
                                value={t.date}
                                onChange={(e) =>
                                  updateModule(m.id, {
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
                                  updateModule(m.id, {
                                    tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, topic: e.target.value } : x)),
                                  })
                                }
                                className="w-full px-3 py-1 rounded-lg border"
                              />
                            </td>
                            <td className="py-2 pr-4">
                              <select
                                value={t.status}
                                onChange={(e) => setTaskStatus(m.id, t.id, e.target.value)}
                                className="px-3 py-1 rounded-lg border"
                              >
                                {["Not Started", "In Progress", "Done"].map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Floating buttons (mobile) */}
      <div className="md:hidden fixed right-5 bottom-20 z-40 flex flex-col gap-3">
        <button
          onClick={addModule}
          className="w-14 h-14 rounded-full bg-white border shadow-lg text-xl grid place-items-center"
          aria-label="Add module"
          title="Add module"
        >
          ＋
        </button>

        <button
          onClick={addTaskSmart}
          className="w-14 h-14 rounded-full bg-slate-900 text-white shadow-lg text-2xl grid place-items-center"
          aria-label="Add task"
          title="Add task"
        >
          +
        </button>
      </div>

      {/* Module picker bottom sheet (mobile only) */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl border-t shadow-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Add task to…</h3>
              <button onClick={() => setSheetOpen(false)} className="px-3 py-2 rounded-lg border text-sm">
                Close
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              {modules.map((m) => {
                const colors = PALETTE[m.colorIdx % PALETTE.length];
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      addTask(m.id);
                      setOpenMap((prev) => ({ ...prev, [m.id]: true }));
                      setSheetOpen(false);
                    }}
                    className="w-full flex items-center justify-between rounded-xl border px-3 py-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${colors.bg}`} />
                      <span className="truncate font-medium">{m.name}</span>
                    </div>
                    <span className="text-xs text-slate-500">{m.examDate}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}