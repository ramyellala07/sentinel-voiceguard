import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import LiveDetection from "./pages/LiveDetection";
import VoiceVerification from "./pages/VoiceVerification";
import ThreatAnalysis from "./pages/ThreatAnalysis";
import IncidentHistory from "./pages/IncidentHistory";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import { fetchMe, logout, pingBackend } from "./services/api";

const PAGES = {
  dashboard: Dashboard,
  live: LiveDetection,
  verification: VoiceVerification,
  threats: ThreatAnalysis,
  incidents: IncidentHistory,
  analytics: Analytics,
  settings: Settings,
};

export default function App() {
  const [page, setPage] = useState("live");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  // Backend readiness: poll until the API answers (covers slow model warmups)
  // so pages never mount against a half-started backend and cache empties.
  const [backendUp, setBackendUp] = useState(
    import.meta.env.VITE_BACKEND_URL ? null : true);
  const Page = PAGES[page] || Dashboard;

  useEffect(() => {
    if (backendUp !== null) return;
    let on = true, tries = 0;
    const tick = async () => {
      try {
        await pingBackend();
        if (on) setBackendUp(true);
      } catch {
        if (on) {
          if (++tries < 90) setTimeout(tick, 2000);
          else setBackendUp(false);
        }
      }
    };
    tick();
    return () => { on = false; };
  }, [backendUp]);

  useEffect(() => {
    if (!backendUp) return;
    let on = true;
    fetchMe()
      .then((u) => { if (on) { setUser(u); setChecking(false); } })
      .catch(() => { if (on) { setUser(null); setChecking(false); } });
    return () => { on = false; };
  }, [backendUp]);

  if (backendUp === null) {
    return <div className="min-h-screen bg-[#f6f8fb] flex flex-col gap-2 items-center justify-center text-[13px] font-bold text-slate-500 tracking-widest"><span className="w-3 h-3 rounded-full bg-sky-500 animate-pulse" />CONNECTING TO BACKEND… (models warming up, up to ~3 min first boot)</div>;
  }

  if (backendUp === false) {
    return <div className="min-h-screen bg-[#f6f8fb] flex flex-col gap-2 items-center justify-center px-4 text-center"><div className="text-[13px] font-extrabold text-red-700 tracking-widest">BACKEND UNREACHABLE</div><div className="text-[12px] text-slate-500 max-w-sm">Start it: backend folder → <span className="font-mono">python -m uvicorn main:app --port 5000</span>, wait for warmups, then reload this page.</div></div>;
  }

  if (checking) {
    return <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center text-[13px] font-bold text-slate-400 tracking-widest">LOADING…</div>;
  }

  if (!user) {
    return <Login onDone={() => window.location.reload()} />;
  }

  const signOut = () => { logout(); window.location.reload(); };

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <Sidebar page={page} setPage={setPage} open={sidebarOpen} setOpen={setSidebarOpen} />
      <main className="lg:pl-60">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 pt-14 lg:pt-6">
          <div className="flex justify-end mb-2 text-[11px] text-slate-400">
            <span className="mr-2">{user.email}</span>
            <button onClick={signOut} className="font-bold text-slate-500 hover:text-slate-800">SIGN OUT</button>
          </div>
          <Page />
          <footer className="mt-8 text-[11px] text-slate-400 flex justify-between">
            <span>VoiceGuard AI · hackathon prototype</span>
            <span>All results simulated in-browser (DEMO MODE)</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
