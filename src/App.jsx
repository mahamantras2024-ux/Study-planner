import { useEffect, useMemo, useState } from "react";

// === Helper utils ===
const pad = (n) => String(n).padStart(2, "0");
const fmtYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYMD = (s) => { const [y,m,dd] = s.split("-").map(Number); return new Date(y, m-1, dd); };
const daysBetween = (d1, d2) => Math.ceil((parseYMD(fmtYMD(d2)) - parseYMD(fmtYMD(d1))) / (1000*60*60*24));

// Fixed palette per module (no user choice)
const PALETTE = [
  { name: "Royal", bg: "bg-indigo-600", ring:"ring-indigo-300", pill:"bg-indigo-50 text-indigo-700" },
  { name: "Teal", bg: "bg-teal-600", ring:"ring-teal-300", pill:"bg-teal-50 text-teal-700" },
  { name: "Rose", bg: "bg-rose-600", ring:"ring-rose-300", pill:"bg-rose-50 text-rose-700" },
  { name: "Amber", bg: "bg-amber-600", ring:"ring-amber-300", pill:"bg-amber-50 text-amber-700" },
  { name: "Violet", bg: "bg-violet-600", ring:"ring-violet-300", pill:"bg-violet-50 text-violet-700" },
];

// Storage helpers (username-scoped)
const USERS_KEY = 'sp_users_v1';
const CURR_USER_KEY = 'sp_current_user_v1';
const modulesKey = (u) => `sp_modules_v1_${u}`;

const getUsers = () => { try{ return JSON.parse(localStorage.getItem(USERS_KEY)||'[]'); }catch{ return []; } };
const saveUsers = (arr) => localStorage.setItem(USERS_KEY, JSON.stringify(arr));

const DEFAULT_MODULES = () => {
  const today = new Date();
  const d = (offset) => { const x=new Date(today); x.setDate(x.getDate()+offset); return fmtYMD(x); };
  return [
    { id: crypto.randomUUID(), name: "Module 1", colorIdx:0, examDate: d(21), tasks: [] },
    { id: crypto.randomUUID(), name: "Module 2", colorIdx:1, examDate: d(24), tasks: [] },
    { id: crypto.randomUUID(), name: "Module 3", colorIdx:2, examDate: d(27), tasks: [] },
    { id: crypto.randomUUID(), name: "Module 4", colorIdx:3, examDate: d(30), tasks: [] },
    { id: crypto.randomUUID(), name: "Module 5", colorIdx:4, examDate: d(33), tasks: [] },
  ];
};

export default function StudyPlannerApp(){
  // Auth: username-only
  const [user, setUser] = useState(() => localStorage.getItem(CURR_USER_KEY) || "");
  const [modules, setModules] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [daysPerPlan, setDaysPerPlan] = useState(14);

  const today = useMemo(() => fmtYMD(new Date()), []);

  // Load modules when user changes
  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(modulesKey(user));
    setModules(saved ? JSON.parse(saved) : DEFAULT_MODULES());
  }, [user]);

  // Persist per user
  useEffect(() => {
    if (!user) return;
    localStorage.setItem(modulesKey(user), JSON.stringify(modules));
  }, [modules, user]);

  const login = (username) => {
    const u = (username||"").trim();
    if (!u) return alert('Please enter a username');
    const users = getUsers();
    if (!users.includes(u)) { users.push(u); saveUsers(users); }
    localStorage.setItem(CURR_USER_KEY, u);
    setUser(u);
  };
  const register = (username) => login(username); // same flow; creates if new
  const logout = () => { localStorage.removeItem(CURR_USER_KEY); setUser(""); setModules([]); };

  const updateModule = (id, patch) => setModules(prev => prev.map(m => m.id===id ? { ...m, ...patch } : m));

  // Generate evenly spaced tasks counting backwards from exam date
  const generatePlans = () => {
    setModules(prev => prev.map((m) => {
      const exam = parseYMD(m.examDate);
      const tasks = Array.from({length: daysPerPlan}, (_,i) => {
        const dt = new Date(exam);
        dt.setDate(dt.getDate() - (daysPerPlan - i));
        return { id: crypto.randomUUID(), date: fmtYMD(dt), topic: `Topic ${i+1}`, status: "Not Started" };
      });
      return { ...m, tasks };
    }));
  };

  const todayTodos = useMemo(() => modules.flatMap(m => m.tasks?.filter(t => t.date===today).map(t => ({...t, modId: m.id, modName: m.name, colorIdx: m.colorIdx}))) ,[modules, today]);
  const progressFor = (m) => { const total=m.tasks?.length||0; if(!total) return 0; const done=m.tasks.filter(t=>t.status==="Done").length; return Math.round((done/total)*100); };
  const overallProgress = () => {
    if (!modules.length) return 0;
    const arr = modules.map(progressFor);
    return Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
  };
  const countdownFor = (m) => daysBetween(new Date(), parseYMD(m.examDate));
  const setTaskStatus = (modId, taskId, next) => setModules(prev => prev.map(m => m.id===modId ? { ...m, tasks: m.tasks.map(t => t.id===taskId? {...t, status: next}: t)} : m));
  const addTask = (modId) => { const date=today; const topic="New task"; const task={ id:crypto.randomUUID(), date, topic, status:"Not Started"}; setModules(prev=>prev.map(m=>m.id===modId?{...m,tasks:[...(m.tasks||[]),task]}:m)); };
  const removeTask = (modId, taskId) => setModules(prev => prev.map(m => m.id===modId ? { ...m, tasks: m.tasks.filter(t => t.id!==taskId)} : m));
  const resetAll = () => { if (confirm("Reset to defaults?")) setModules(DEFAULT_MODULES()); };

  if (!user) return <AuthScreen onLogin={login} onRegister={register} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">📚 Study Planner</h1>
            <p className="text-slate-500 text-sm">Signed in as <b>{user}</b></p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm hidden sm:block">Days per plan</label>
            <input type="number" min={7} max={60} value={daysPerPlan} onChange={(e)=>setDaysPerPlan(Number(e.target.value)||14)} className="w-20 px-3 py-1 rounded-lg border bg-white"/>
            <button onClick={generatePlans} className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90">Generate Plans</button>
            <button onClick={()=>{ if (confirm('Reset data for this user?')){ setModules(DEFAULT_MODULES()); } }} className="px-3 py-2 rounded-xl border">Reset</button>
            <button onClick={logout} className="px-3 py-2 rounded-xl border">Logout</button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-2 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              {id:"overview", label:`Overview (${overallProgress()}%)`},
              {id:"today", label:`Today (${today})`},
              {id:"planner", label:"Planner"},
            ].map(tab => (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={`px-4 py-2 rounded-xl border ${activeTab===tab.id?"bg-slate-900 text-white":"bg-white hover:bg-slate-100"}`}>{tab.label}</button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === "overview" && (
          <Overview modules={modules} today={today} progressFor={progressFor} countdownFor={countdownFor} />
        )}
        {activeTab === "today" && (
          <Today todos={todayTodos} setTaskStatus={setTaskStatus} />
        )}
        {activeTab === "planner" && (
          <Planner modules={modules} updateModule={updateModule} addTask={addTask} removeTask={removeTask} setTaskStatus={setTaskStatus} progressFor={progressFor} />
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-sm text-slate-500">
        <p>Tip: Edit module names & exam dates, click <b>Generate Plans</b> to auto-create study schedules. Data is saved per username in your browser.</p>
      </footer>
    </div>
  );
}

function AuthScreen({ onLogin, onRegister }){
  const [name, setName] = useState("");
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Welcome to Study Planner</h2>
        <p className="text-slate-600 mt-1 text-sm">Create a username to get started. If it already exists, you'll be logged in.</p>
        <div className="mt-4 flex gap-2">
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Username" className="flex-1 px-3 py-2 rounded-xl border"/>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={()=>onRegister(name)} className="px-4 py-2 rounded-xl bg-slate-900 text-white">Register</button>
          <button onClick={()=>onLogin(name)} className="px-4 py-2 rounded-xl border">Login</button>
        </div>
        <p className="text-xs text-slate-500 mt-3">No password. Your data stays on this device. To use on another device, register the same username there.</p>
      </div>
    </div>
  );
}

function Overview({ modules, today, progressFor, countdownFor }){
  return (
    <section className="grid md:grid-cols-2 gap-6">
      {modules.map((m) => {
        const colors = PALETTE[m.colorIdx % PALETTE.length];
        return (
          <div key={m.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${colors.pill}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${colors.bg}`}></span>
                  {m.name}
                </div>
                <h3 className="mt-3 text-lg font-semibold">Exam: <span className="font-normal">{m.examDate}</span></h3>
              </div>
              <div className={`px-3 py-1 rounded-lg text-white ${colors.bg}`}>{countdownFor(m)} days left</div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-sm mb-1"><span>Progress</span><span>{progressFor(m)}%</span></div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden ring-1 ring-slate-200">
                <div className={`h-full ${colors.bg}`} style={{width:`${progressFor(m)}%`}}></div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 text-center text-sm">
              <div className="p-3">
                <div className="font-semibold">{m.tasks?.length || 0}</div>
                <div className="text-slate-500">Tasks</div>
              </div>
              <div className="p-3 border-l">
                <div className="font-semibold">{m.tasks?.filter(t=>t.status==='In Progress').length || 0}</div>
                <div className="text-slate-500">In Progress</div>
              </div>
              <div className="p-3 border-l">
                <div className="font-semibold">{m.tasks?.filter(t=>t.status==='Done').length || 0}</div>
                <div className="text-slate-500">Done</div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Today({ todos, setTaskStatus }){
  if (!todos.length) return <p className="text-slate-600">🎉 No tasks for today. Generate plans or add tasks in Planner.</p>;
  return (
    <section className="space-y-3">
      {todos.map((t) => (
        <div key={t.id} className="rounded-2xl border bg-white p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">{t.modName}</div>
            <div className="font-medium">{t.topic}</div>
          </div>
          <select value={t.status} onChange={(e)=>setTaskStatus(t.modId, t.id, e.target.value)} className="px-3 py-2 rounded-xl border bg-white">
            {['Not Started','In Progress','Done'].map(s=> <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      ))}
    </section>
  );
}

function Planner({ modules, updateModule, addTask, removeTask, setTaskStatus, progressFor }){
  return (
    <section className="space-y-8">
      {modules.map((m) => {
        const colors = PALETTE[m.colorIdx % PALETTE.length];
        return (
          <div key={m.id} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between ${colors.bg} text-white`}>
              <div className="flex items-center gap-3">
                <input value={m.name} onChange={(e)=>updateModule(m.id, {name:e.target.value})} className="px-3 py-1 rounded-lg text-slate-900"/>
                <span className="px-2 py-0.5 rounded-md bg-white/20 text-white/90 text-sm">{`${progressFor(m)}%`}</span>
              </div>
              <div className="mt-3 sm:mt-0 flex items-center gap-2">
                <label className="opacity-90">Exam</label>
                <input type="date" value={m.examDate} onChange={(e)=>updateModule(m.id, {examDate: e.target.value})} className="px-3 py-1 rounded-lg text-slate-900"/>
                <button onClick={()=>addTask(m.id)} className="ml-2 px-3 py-1 rounded-lg bg-white/15 ring-1 ring-white/30 hover:bg-white/25">+ Task</button>
              </div>
            </div>

            <div className="p-4">
              {!m.tasks?.length ? (
                <p className="text-slate-600">No tasks yet. Click <b>+ Task</b> or use <b>Generate Plans</b> above.</p>
              ) : (
                <div className="overflow-x-auto">
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
                      {m.tasks.sort((a,b)=>a.date.localeCompare(b.date)).map((t) => (
                        <tr key={t.id} className="border-t">
                          <td className="py-2 pr-4 whitespace-nowrap"><input type="date" value={t.date} onChange={(e)=>updateModule(m.id,{tasks: m.tasks.map(x=>x.id===t.id?{...t, date:e.target.value}:x)})} className="px-2 py-1 rounded-lg border"/></td>
                          <td className="py-2 pr-4 w-full"><input value={t.topic} onChange={(e)=>updateModule(m.id,{tasks: m.tasks.map(x=>x.id===t.id?{...t, topic:e.target.value}:x)})} className="w-full px-3 py-1 rounded-lg border"/></td>
                          <td className="py-2 pr-4">
                            <select value={t.status} onChange={(e)=>setTaskStatus(m.id, t.id, e.target.value)} className="px-3 py-1 rounded-lg border">
                              {['Not Started','In Progress','Done'].map(s=> <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-4">
                            <button onClick={()=>removeTask(m.id, t.id)} className="px-2 py-1 rounded-lg border hover:bg-slate-50">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
