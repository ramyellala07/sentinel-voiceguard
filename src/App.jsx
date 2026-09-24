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
import { fetchMe, logout, pingBackend, BACKEND_STATUS } from "./services/api";

const PAGES = {
  dashboard: Dashboard,
  live: LiveDetection,
  verification: VoiceVerification,
  threats: ThreatAnalysis,
  incidents: IncidentHistory,
  analytics: Analytics,
  settings: Settings,
};

// Merged design: login gate (auth story intact) + live status pill header.
// Gate states: checking backend -> login (no session) -> console.
export default function App() {
  const [page, setPage] = useState("live");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [backendUp, setBackendUp] = useState(
    import.meta.env.VITE_BACKEND_URL ? null : true);
  const [checking, setChecking] = useState(true);
  const Page = PAGES[page] || Dashboard;

  // Backend readiness: poll until the API answers (covers slow model warmups)
  // so pages never mount against a half-started backend and cache empties.
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
    return <div className="min-h-screen bg-[#f6f8fb] flex flex-col gap-2 items-center justify-center px-4 text-center"><div className="text-[13px] font-extrabold text-red-700 tracking-widest">BACKEND UNREACHABLE</div><div className="text-[12px] text-slate-500 max-w-sm">The cloud backend is warming up or unreachable — wait a minute and reload this page.</div></div>;
  }

  if (checking) {
    return <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center text-[13px] font-bold text-slate-400 tracking-widest">LOADING…</div>;
  }

  if (!user) {
    return <Login onDone={() => window.location.reload()} />;
  }

  const signOut = () => { logout(); window.location.reload(); };
  const backendHost = (() => {
    try { return new URL(BACKEND_STATUS.url).host; }
    catch { return BACKEND_STATUS.url; }
  })();

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <Sidebar page={page} setPage={setPage} open={sidebarOpen} setOpen={setSidebarOpen} />
      <main className="lg:pl-60">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 pt-14 lg:pt-6">
          <div className="flex items-center justify-between mb-3 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Backend Online ({backendHost})
              </span>
            </div>
            <div className="flex items-center gap-3 text-slate-400">
              <span>{user.email}</span>
              <button onClick={signOut} className="font-bold text-slate-500 hover:text-slate-800">SIGN OUT</button>
            </div>
          </div>
          <Page />
          <footer className="mt-8 text-[11px] text-slate-400 flex justify-between">
            <span>VoiceGuard AI · SIH 2026</span>
            <span>Real-time Voice Spoofing & Impersonation Defense</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
