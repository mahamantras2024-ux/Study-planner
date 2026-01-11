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
  const headers = {
    "Content-Type": "application/json",
  };
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

export default function StudyPlannerApp() {
  // Auth
  // - Local mode: username only
  // - Server mode: username + token
  const [user, setUser] = useState(() => localStorage.getItem(CURR_USER_KEY) || "");
  const [token, setAuthToken] = useState(() => (SERVER_ENABLED ? getToken() : ""));
  const [modules, setModules] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [daysPerPlan, setDaysPerPlan] = useState(14);
  const [syncStatus, setSyncStatus] = useState(SERVER_ENABLED ? "Ready" : "Local mode");

  const today = useMemo(() => fmtYMD(new Date()), []);

  const tabs = useMemo(
    () => [
      { id: "overview", label: `Overview (${overallProgress(modules)}%)` },
      { id: "today", label: `Today` },
      { id: "planner", label: "Planner" },
    ],
    [modules]
  );

  // =====================
  // LOAD DATA
  // =====================
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;

      // Server mode
      if (SERVER_ENABLED) {
        if (!token) return; // not logged in yet
        try {
          setSyncStatus("Syncing…");
          const data = await api("/modules", { token }); // expects array of modules
          if (!cancelled) {
            setModules(Array.isArray(data) ? data : DEFAULT_MODULES());
            setSyncStatus("Synced");
          }
        } catch (e) {
          if (!cancelled) {
            setSyncStatus(`Sync error: ${e.message}`);
            // fallback so UI isn't dead
            setModules(DEFAULT_MODULES());
          }
        }
        return;
      }

      // Local mode
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

    // Server mode: PUT modules whenever modules change (simple sync model)
    if (SERVER_ENABLED) {
      if (!token) return;

      const controller = new AbortController();
      const doSync = async () => {
        try {
          setSyncStatus("Syncing…");
          await api("/modules", { method: "PUT", body: modules, token });
          setSyncStatus("Synced");
        } catch (e) {
          setSyncStatus(`Sync error: ${e.message}`);
        }
      };

      // Debounce so we don't spam server on every keystroke
      const t = setTimeout(doSync, 450);
      return () => {
        clearTimeout(t);
        controller.abort();
      };
    }

    // Local mode
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

  // Generate evenly spaced tasks counting backwards from exam date
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

  const countdownFor = (m) => daysBetween(new Date(), parseYMD(m.examDate));

  const setTaskStatus = (modId, taskId, next) =>
    setModules((prev) =>
      prev.map((m) => (m.id === modId ? { ...m, tasks: m.tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t)) } : m))
    );

  const addTask = (modId) => {
    const date = today;
    const topic = "New task";
    const task = { id: crypto.randomUUID(), date, topic, status: "Not Started" };
    setModules((prev) => prev.map((m) => (m.id === modId ? { ...m, tasks: [...(m.tasks || []), task] } : m)));
  };

  const removeTask = (modId, taskId) =>
    setModules((prev) => prev.map((m) => (m.id === modId ? { ...m, tasks: m.tasks.filter((t) => t.id !== taskId) } : m)));

  // =====================
  // RENDER
  // =====================
  if (!user) {
    return <AuthScreen onLogin={login} onRegister={register} serverEnabled={SERVER_ENABLED} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">📚 Study Planner</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-slate-500 text-sm">
                Signed in as <b className="break-all">{user}</b>
              </p>
              <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-600">
                {SERVER_ENABLED ? `Server sync: ${syncStatus}` : "Local mode"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm hidden sm:block">Days per plan</label>
            <input
              type="number"
              min={7}
              max={60}
              value={daysPerPlan}
              onChange={(e) => setDaysPerPlan(Number(e.target.value) || 14)}
              className="w-20 px-3 py-1 rounded-lg border bg-white"
            />
            <button onClick={generatePlans} className="hidden sm:inline-flex px-3 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90">
              Generate Plans
            </button>
            <button onClick={logout} className="px-3 py-2 rounded-xl border">
              Logout
            </button>
          </div>
        </div>

        {/* Desktop tabs */}
        <nav className="max-w-6xl mx-auto px-2 pb-2 hidden md:block">
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

      {/* Main gets bottom padding so mobile nav doesn't cover content */}
      <main className="max-w-6xl mx-auto px-4 py-6 pb-28 md:pb-6">
        {/* Mobile quick actions */}
        <div className="md:hidden flex gap-2 mb-4">
          <button onClick={generatePlans} className="flex-1 px-3 py-2 rounded-xl bg-slate-900 text-white">
            Generate Plans
          </button>
          <button
            onClick={() => {
              if (confirm("Reset data for this user?")) setModules(DEFAULT_MODULES());
            }}
            className="px-3 py-2 rounded-xl border"
          >
            Reset
          </button>
        </div>

        {activeTab === "overview" && <Overview modules={modules} progressFor={progressFor} countdownFor={countdownFor} />}
        {activeTab === "today" && <Today todos={todayTodos} setTaskStatus={setTaskStatus} />}
        {activeTab === "planner" && (
          <Planner
            modules={modules}
            updateModule={updateModule}
            addTask={addTask}
            removeTask={removeTask}
            setTaskStatus={setTaskStatus}
            progressFor={progressFor}
          />
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-white/90 backdrop-blur border-t md:hidden">
        <div className="max-w-6xl mx-auto px-2 py-2 grid grid-cols-3 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-3 rounded-xl border text-sm ${
                activeTab === tab.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
              }`}
            >
              {tab.id === "today" ? "Today" : tab.id[0].toUpperCase() + tab.id.slice(1)}
            </button>
          ))}
        </div>
      </nav>

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-sm text-slate-500 hidden md:block">
        <p>
          Tip: Edit module names & exam dates, click <b>Generate Plans</b> to auto-create study schedules.
        </p>
        <p className="mt-1">
          {SERVER_ENABLED
            ? "Data syncs to your server account."
            : "Data is saved per username in your browser (local mode)."}
        </p>
      </footer>
    </div>
  );
}

// Helper for overall progress (used in tabs label)
function overallProgress(modules) {
  if (!modules?.length) return 0;
  const progressFor = (m) => {
    const total = m.tasks?.length || 0;
    if (!total) return 0;
    const done = m.tasks.filter((t) => t.status === "Done").length;
    return Math.round((done / total) * 100);
  };
  const arr = modules.map(progressFor);
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function AuthScreen({ onLogin, onRegister, serverEnabled }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Welcome to Study Planner</h2>

        {!serverEnabled ? (
          <p className="text-slate-600 mt-1 text-sm">
            Local mode (no server configured). Create a username to get started. If it already exists, you'll be logged in.
          </p>
        ) : (
          <p className="text-slate-600 mt-1 text-sm">
            Server mode enabled. Sign in to access your account across devices.
          </p>
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
          {serverEnabled
            ? "Your tasks sync to your server account (same login works on any device)."
            : "No password. Data stays on this device (localStorage)."}
        </p>
      </div>
    </div>
  );
}

function Overview({ modules, progressFor, countdownFor }) {
  return (
    <section className="grid md:grid-cols-2 gap-6">
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
              <div className={`shrink-0 px-3 py-1 rounded-lg text-white ${colors.bg}`}>{countdownFor(m)} days left</div>
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

            <div className="mt-5 grid grid-cols-3 text-center text-sm">
              <div className="p-3">
                <div className="font-semibold">{m.tasks?.length || 0}</div>
                <div className="text-slate-500">Tasks</div>
              </div>
              <div className="p-3 border-l">
                <div className="font-semibold">{m.tasks?.filter((t) => t.status === "In Progress").length || 0}</div>
                <div className="text-slate-500">In Progress</div>
              </div>
              <div className="p-3 border-l">
                <div className="font-semibold">{m.tasks?.filter((t) => t.status === "Done").length || 0}</div>
                <div className="text-slate-500">Done</div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Today({ todos, setTaskStatus }) {
  if (!todos.length) return <p className="text-slate-600">🎉 No tasks for today. Generate plans or add tasks in Planner.</p>;
  return (
    <section className="space-y-3">
      {todos.map((t) => (
        <div key={t.id} className="rounded-2xl border bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

function Planner({ modules, updateModule, addTask, removeTask, setTaskStatus, progressFor }) {
  return (
    <section className="space-y-8">
      {modules.map((m) => {
        const colors = PALETTE[m.colorIdx % PALETTE.length];
        const sortedTasks = (m.tasks || []).slice().sort((a, b) => a.date.localeCompare(b.date));

        return (
          <div key={m.id} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between ${colors.bg} text-white`}>
              <div className="flex items-center gap-3 min-w-0">
                <input
                  value={m.name}
                  onChange={(e) => updateModule(m.id, { name: e.target.value })}
                  className="px-3 py-1 rounded-lg text-slate-900 w-full sm:w-auto"
                />
                <span className="px-2 py-0.5 rounded-md bg-white/20 text-white/90 text-sm shrink-0">{`${progressFor(m)}%`}</span>
              </div>
              <div className="mt-3 sm:mt-0 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <label className="opacity-90">Exam</label>
                  <input
                    type="date"
                    value={m.examDate}
                    onChange={(e) => updateModule(m.id, { examDate: e.target.value })}
                    className="px-3 py-1 rounded-lg text-slate-900"
                  />
                </div>
                <button
                  onClick={() => addTask(m.id)}
                  className="sm:ml-2 px-3 py-2 rounded-lg bg-white/15 ring-1 ring-white/30 hover:bg-white/25"
                >
                  + Task
                </button>
              </div>
            </div>

            <div className="p-4">
              {!sortedTasks.length ? (
                <p className="text-slate-600">
                  No tasks yet. Click <b>+ Task</b> or use <b>Generate Plans</b>.
                </p>
              ) : (
                <>
                  {/* MOBILE: cards */}
                  <div className="space-y-3 md:hidden">
                    {sortedTasks.map((t) => (
                      <div key={t.id} className="rounded-2xl border bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
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
                          <button onClick={() => removeTask(m.id, t.id)} className="px-2 py-1 rounded-lg border hover:bg-slate-50">
                            Delete
                          </button>
                        </div>

                        <input
                          value={t.topic}
                          onChange={(e) =>
                            updateModule(m.id, {
                              tasks: m.tasks.map((x) => (x.id === t.id ? { ...t, topic: e.target.value } : x)),
                            })
                          }
                          className="w-full mt-2 px-3 py-2 rounded-xl border"
                        />

                        <select
                          value={t.status}
                          onChange={(e) => setTaskStatus(m.id, t.id, e.target.value)}
                          className="mt-2 w-full px-3 py-2 rounded-xl border bg-white"
                        >
                          {["Not Started", "In Progress", "Done"].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
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
                              <button onClick={() => removeTask(m.id, t.id)} className="px-2 py-1 rounded-lg border hover:bg-slate-50">
                                Delete
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
    </section>
  );
}