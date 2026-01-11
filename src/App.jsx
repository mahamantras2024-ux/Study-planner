import { useEffect, useMemo, useRef, useState } from "react";

// === Helper utils ===
const pad = (n) => String(n).padStart(2, "0");
const fmtYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYMD = (s) => {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
};

// Fixed palette per module/project (cute-ish)
const PALETTE = [
  { name: "Blueberry", bg: "bg-indigo-500", soft: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  { name: "Mint", bg: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  { name: "Strawberry", bg: "bg-rose-500", soft: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  { name: "Mango", bg: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  { name: "Grape", bg: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
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

// ========== Default modules/projects ==========
const DEFAULT_MODULES = () => {
  const today = new Date();
  const d = (offset) => {
    const x = new Date(today);
    x.setDate(x.getDate() + offset);
    return fmtYMD(x);
  };
  return [
    { id: crypto.randomUUID(), name: "BGS", colorIdx: 0, examDate: d(21), tasks: [] },
    { id: crypto.randomUUID(), name: "Stats", colorIdx: 1, examDate: d(28), tasks: [] },
    { id: crypto.randomUUID(), name: "WAD II", colorIdx: 2, examDate: d(35), tasks: [] },
    { id: crypto.randomUUID(), name: "IS211", colorIdx: 3, examDate: d(42), tasks: [] },
    { id: crypto.randomUUID(), name: "IS115", colorIdx: 4, examDate: d(49), tasks: [] },
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
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v7h-7" />
    </svg>
  );
}
function IconUser({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}
function IconChevronDown({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function StudyPlannerApp() {
  const [user, setUser] = useState(() => localStorage.getItem(CURR_USER_KEY) || "");
  const [token, setAuthToken] = useState(() => (SERVER_ENABLED ? getToken() : ""));
  const [modules, setModules] = useState([]);
  const [activeTab, setActiveTab] = useState("today");
  const [syncStatus, setSyncStatus] = useState(SERVER_ENABLED ? "Ready" : "Local mode");

  // New: daily to-dos (global, not tied to a module) — stored alongside modules
  const [dailyTodos, setDailyTodos] = useState([]);

  // New: profile menu
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const today = useMemo(() => fmtYMD(new Date()), []);

  const tabs = useMemo(
    () => [
      { id: "today", label: "✨ Today" },
      { id: "planner", label: "📚 Projects" },
      { id: "overview", label: "🌷 Overview" },
    ],
    []
  );

  // Close profile dropdown on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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
          // Expect shape: { modules: [...], dailyTodos: [...] }
          const data = await api("/data", { token });
          if (!cancelled) {
            setModules(Array.isArray(data?.modules) ? data.modules : DEFAULT_MODULES());
            setDailyTodos(Array.isArray(data?.dailyTodos) ? data.dailyTodos : []);
            setSyncStatus("Synced");
          }
        } catch (e) {
          if (!cancelled) {
            setSyncStatus(`Sync error: ${e.message}`);
            setModules(DEFAULT_MODULES());
            setDailyTodos([]);
          }
        }
        return;
      }

      const saved = localStorage.getItem(modulesKey(user));
      if (saved) {
        const parsed = JSON.parse(saved);
        setModules(Array.isArray(parsed?.modules) ? parsed.modules : DEFAULT_MODULES());
        setDailyTodos(Array.isArray(parsed?.dailyTodos) ? parsed.dailyTodos : []);
      } else {
        setModules(DEFAULT_MODULES());
        setDailyTodos([]);
      }
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

    const payload = { modules, dailyTodos };

    if (SERVER_ENABLED) {
      if (!token) return;

      const doSync = async () => {
        try {
          setSyncStatus("Syncing…");
          await api("/data", { method: "PUT", body: payload, token });
          setSyncStatus("Synced");
        } catch (e) {
          setSyncStatus(`Sync error: ${e.message}`);
        }
      };

      const t = setTimeout(doSync, 450);
      return () => clearTimeout(t);
    }

    localStorage.setItem(modulesKey(user), JSON.stringify(payload));
  }, [modules, dailyTodos, user, token]);

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
    setDailyTodos([]);
    if (SERVER_ENABLED) {
      clearToken();
      setAuthToken("");
      setSyncStatus("Ready");
    }
  };

  const resetData = () => {
    if (!confirm("Reset all data for this user?")) return;
    setModules(DEFAULT_MODULES());
    setDailyTodos([]);
    setActiveTab("today");
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
    dt.setDate(dt.getDate() + 21 + Math.min(modules.length * 3, 60));
    const newMod = {
      id: crypto.randomUUID(),
      name: `Project ${idx}`,
      colorIdx: modules.length % PALETTE.length,
      examDate: fmtYMD(dt), // we keep this field; later you can rename UI label to "Deadline"
      tasks: [],
    };
    setModules((prev) => [...prev, newMod]);
  };

  const addTask = (modId) => {
    const task = { id: crypto.randomUUID(), date: today, topic: "New task", status: "Not Started" };
    setModules((prev) => prev.map((m) => (m.id === modId ? { ...m, tasks: [...(m.tasks || []), task] } : m)));
  };

  const removeTask = (modId, taskId) =>
    setModules((prev) => prev.map((m) => (m.id === modId ? { ...m, tasks: m.tasks.filter((t) => t.id !== taskId) } : m)));

  const setTaskStatus = (modId, taskId, next) =>
    setModules((prev) =>
      prev.map((m) =>
        m.id === modId ? { ...m, tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t)) } : m
      )
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

  const todayModuleTodos = useMemo(
    () =>
      modules.flatMap((m) =>
        (m.tasks || [])
          .filter((t) => t.date === today)
          .map((t) => ({ ...t, modId: m.id, modName: m.name, colorIdx: m.colorIdx }))
      ),
    [modules, today]
  );

  // Daily todos
  const addDailyTodo = () => {
    const todo = { id: crypto.randomUUID(), text: "New to-do", done: false };
    setDailyTodos((prev) => [todo, ...prev]);
  };
  const updateDailyTodo = (id, patch) => setDailyTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeDailyTodo = (id) => setDailyTodos((prev) => prev.filter((t) => t.id !== id));

  // =====================
  // RENDER
  // =====================
  if (!user) return <AuthScreen onLogin={login} onRegister={register} serverEnabled={SERVER_ENABLED} />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* Cute-ish header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/85 border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Study Planner <span className="text-slate-400">✿</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                {SERVER_ENABLED ? `Sync: ${syncStatus}` : "Local mode"}
              </span>
              <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                Overall: <b>{overallProgress}%</b>
              </span>
            </div>
          </div>

          {/* Right controls: reset icon + profile dropdown */}
          <div className="flex items-center gap-2">
            <button
              onClick={resetData}
              className="w-10 h-10 rounded-xl border bg-white shadow-sm hover:bg-slate-50 grid place-items-center"
              aria-label="Reset"
              title="Reset"
            >
              <IconReset className="w-5 h-5 text-slate-700" />
            </button>

            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="h-10 px-3 rounded-xl border bg-white shadow-sm hover:bg-slate-50 inline-flex items-center gap-2"
                aria-label="Profile menu"
                title="Profile"
              >
                <span className="w-8 h-8 rounded-full bg-slate-100 grid place-items-center">
                  <IconUser className="w-5 h-5 text-slate-700" />
                </span>
                <span className="hidden sm:inline text-sm font-medium max-w-[12rem] truncate">{user}</span>
                <IconChevronDown className="w-4 h-4 text-slate-500" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border bg-white shadow-lg p-2">
                  <div className="px-3 py-2">
                    <div className="text-xs text-slate-500">Signed in as</div>
                    <div className="font-semibold truncate">{user}</div>
                  </div>
                  <div className="h-px bg-slate-100 my-1" />
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-sm"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop tabs */}
        <nav className="max-w-6xl mx-auto px-4 pb-3 hidden md:block">
          <div className="grid grid-cols-3 gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-2xl border shadow-sm ${
                  activeTab === tab.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 pb-32 md:pb-6">
        {activeTab === "today" && (
          <TodayCute
            dailyTodos={dailyTodos}
            addDailyTodo={addDailyTodo}
            updateDailyTodo={updateDailyTodo}
            removeDailyTodo={removeDailyTodo}
            moduleTodos={todayModuleTodos}
            setTaskStatus={setTaskStatus}
          />
        )}

        {activeTab === "planner" && (
          <ProjectsCute
            modules={modules}
            updateModule={updateModule}
            addTask={addTask}
            removeTask={removeTask}
            setTaskStatus={setTaskStatus}
            addModule={addModule}
            progressFor={progressFor}
          />
        )}

        {activeTab === "overview" && <OverviewCute modules={modules} progressFor={progressFor} />}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur border-t md:hidden">
        <div className="max-w-6xl mx-auto px-2 py-2 grid grid-cols-3 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-3 rounded-2xl border shadow-sm text-sm ${
                activeTab === tab.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"
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
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-slate-50 to-white px-4">
      <div className="w-full max-w-md rounded-3xl border bg-white p-6 shadow-lg">
        <h2 className="text-xl font-bold">Welcome ✨</h2>

        {!serverEnabled ? (
          <p className="text-slate-600 mt-1 text-sm">Local mode. Create a username to start.</p>
        ) : (
          <p className="text-slate-600 mt-1 text-sm">Server mode enabled. Sign in to sync across devices.</p>
        )}

        <div className="mt-4 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Username"
            className="w-full px-3 py-2 rounded-2xl border"
          />
          {serverEnabled && (
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password"
              type="password"
              className="w-full px-3 py-2 rounded-2xl border"
            />
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={() => onRegister(name, pw)} className="flex-1 px-4 py-2 rounded-2xl bg-slate-900 text-white">
            Register
          </button>
          <button onClick={() => onLogin(name, pw)} className="flex-1 px-4 py-2 rounded-2xl border">
            Login
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          {serverEnabled ? "Your data syncs to your server account." : "Data stays on this device (localStorage)."}
        </p>
      </div>
    </div>
  );
}

function OverviewCute({ modules, progressFor }) {
  return (
    <section className="grid md:grid-cols-2 gap-4">
      {modules.map((m) => {
        const c = PALETTE[m.colorIdx % PALETTE.length];
        return (
          <div key={m.id} className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${c.soft} ${c.text}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${c.dot}`}></span>
                  <span className="truncate font-semibold">{m.name}</span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  Deadline: <span className="font-medium text-slate-800">{m.examDate}</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-extrabold">{progressFor(m)}%</div>
                <div className="text-xs text-slate-500">done</div>
              </div>
            </div>

            <div className="mt-4 h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full ${c.dot}`} style={{ width: `${progressFor(m)}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TodayCute({ dailyTodos, addDailyTodo, updateDailyTodo, removeDailyTodo, moduleTodos, setTaskStatus }) {
  return (
    <section className="space-y-5">
      {/* Daily To-dos */}
      <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold">🌼 Daily To-Dos</h3>
          <button onClick={addDailyTodo} className="px-3 py-2 rounded-2xl bg-slate-900 text-white text-sm">
            + Add
          </button>
        </div>

        <div className="px-4 pb-4 space-y-2">
          {dailyTodos.length === 0 ? (
            <p className="text-sm text-slate-500">Add quick daily things here (water, laundry, admin, errands).</p>
          ) : (
            dailyTodos.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-2xl border bg-white p-2.5">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => updateDailyTodo(t.id, { done: e.target.checked })}
                  className="w-5 h-5"
                />
                <input
                  value={t.text}
                  onChange={(e) => updateDailyTodo(t.id, { text: e.target.value })}
                  className="flex-1 px-2 py-1 rounded-xl border bg-slate-50 text-sm"
                />
                <button
                  onClick={() => removeDailyTodo(t.id)}
                  className="w-10 h-10 grid place-items-center rounded-2xl border hover:bg-slate-50"
                  aria-label="Delete"
                  title="Delete"
                >
                  <IconTrash className="w-5 h-5 text-slate-700" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Today's project tasks */}
      <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3">
          <h3 className="font-bold">✨ Due Today (Projects)</h3>
          <p className="text-xs text-slate-500 mt-0.5">Tasks with today’s date inside your projects.</p>
        </div>

        <div className="px-4 pb-4 space-y-2">
          {moduleTodos.length === 0 ? (
            <p className="text-sm text-slate-500">No project tasks due today. Cute. Peaceful. 🌿</p>
          ) : (
            moduleTodos.map((t) => (
              <div key={t.id} className="rounded-2xl border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">{t.modName}</div>
                  <div className="font-semibold truncate">{t.topic}</div>
                </div>
                <select
                  value={t.status}
                  onChange={(e) => setTaskStatus(t.modId, t.id, e.target.value)}
                  className="px-3 py-2 rounded-2xl border bg-white text-sm w-full sm:w-auto"
                >
                  {["Not Started", "In Progress", "Done"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectsCute({ modules, updateModule, addTask, removeTask, setTaskStatus, addModule, progressFor }) {
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
    <section className="space-y-4">
      <div className="flex justify-end">
        <button onClick={addModule} className="px-3 py-2 rounded-2xl border bg-white shadow-sm hover:bg-slate-50 text-sm">
          + New Project
        </button>
      </div>

      {modules.map((m) => {
        const c = PALETTE[m.colorIdx % PALETTE.length];
        const sortedTasks = (m.tasks || []).slice().sort((a, b) => a.date.localeCompare(b.date));

        return (
          <div key={m.id} className="rounded-3xl border bg-white shadow-sm overflow-hidden">
            {/* Header: name + deadline + progress on same line */}
            <div className={`${c.bg} text-white px-4 py-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />

                <input
                  value={m.name}
                  onChange={(e) => updateModule(m.id, { name: e.target.value })}
                  className="min-w-[8rem] flex-1 px-3 py-2 rounded-2xl text-slate-900 text-sm bg-white/95"
                />

                <input
                  type="date"
                  value={m.examDate}
                  onChange={(e) => updateModule(m.id, { examDate: e.target.value })}
                  className="px-3 py-2 rounded-2xl text-slate-900 text-sm bg-white/95"
                  aria-label="Deadline"
                />

                <span className="px-2 py-1 rounded-2xl bg-white/20 text-xs font-bold">{progressFor(m)}%</span>

                <button
                  onClick={() => addTask(m.id)}
                  className="hidden md:inline-flex ml-auto px-3 py-2 rounded-2xl bg-white/20 hover:bg-white/30 text-sm font-medium"
                >
                  + Task
                </button>

                <button
                  onClick={() => toggle(m.id)}
                  className="md:hidden ml-auto px-3 py-2 rounded-2xl bg-white/20 hover:bg-white/30 text-sm"
                >
                  {isOpen(m.id) ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className={`${isOpen(m.id) ? "block" : "hidden"} md:block p-4`}>
              {!sortedTasks.length ? (
                <p className="text-sm text-slate-500">No tasks yet. Tap + to add one ✨</p>
              ) : (
                <>
                  {/* Mobile: cards */}
                  <div className="space-y-3 md:hidden">
                    {sortedTasks.map((t) => (
                      <div key={t.id} className="rounded-3xl border bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={t.date}
                            onChange={(e) =>
                              updateModule(m.id, {
                                tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, date: e.target.value } : x)),
                              })
                            }
                            className="flex-1 px-3 py-2 rounded-2xl border text-sm bg-slate-50"
                          />

                          <button
                            onClick={() => removeTask(m.id, t.id)}
                            className="w-11 h-11 grid place-items-center rounded-2xl border hover:bg-slate-50"
                            aria-label="Delete task"
                            title="Delete"
                          >
                            <IconTrash className="w-5 h-5 text-slate-700" />
                          </button>
                        </div>

                        <div className="mt-2">
                          <label className="text-xs text-slate-500">Task</label>
                          <input
                            value={t.topic}
                            onChange={(e) =>
                              updateModule(m.id, {
                                tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, topic: e.target.value } : x)),
                              })
                            }
                            className="w-full mt-1 px-3 py-2 rounded-2xl border text-sm"
                          />
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-slate-500 w-14">Status</label>
                          <select
                            value={t.status}
                            onChange={(e) => setTaskStatus(m.id, t.id, e.target.value)}
                            className="flex-1 px-3 py-2 rounded-2xl border text-sm bg-white"
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

                  {/* Desktop: table */}
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
                                className="px-2 py-1 rounded-xl border"
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
                                className="w-full px-3 py-1 rounded-xl border"
                              />
                            </td>
                            <td className="py-2 pr-4">
                              <select
                                value={t.status}
                                onChange={(e) => setTaskStatus(m.id, t.id, e.target.value)}
                                className="px-3 py-1 rounded-xl border"
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
                                className="px-2 py-2 rounded-xl border hover:bg-slate-50 inline-flex items-center justify-center"
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

      {/* Floating buttons (mobile): add project + add task */}
      <div className="md:hidden fixed right-5 bottom-20 z-40 flex flex-col gap-3">
        <button
          onClick={addModule}
          className="w-14 h-14 rounded-full bg-white border shadow-lg text-xl grid place-items-center"
          aria-label="Add project"
          title="Add project"
        >
          🌸
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

      {/* Module picker bottom sheet */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl border-t shadow-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Add task to…</h3>
              <button onClick={() => setSheetOpen(false)} className="px-3 py-2 rounded-2xl border text-sm">
                Close
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              {modules.map((m) => {
                const c = PALETTE[m.colorIdx % PALETTE.length];
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      addTask(m.id);
                      setOpenMap((prev) => ({ ...prev, [m.id]: true }));
                      setSheetOpen(false);
                    }}
                    className="w-full flex items-center justify-between rounded-3xl border px-3 py-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                      <span className="truncate font-semibold">{m.name}</span>
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