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
  const [user, setUser] = useState({ id: "op-demo", email: "operator@voiceguard.ai", role: "operator" });
  const [backendUp, setBackendUp] = useState(null);
  const Page = PAGES[page] || Dashboard;

  useEffect(() => {
    let on = true;
    const check = async () => {
      try {
        await pingBackend(3000);
        if (on) setBackendUp(true);
      } catch {
        if (on) setBackendUp(false);
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { on = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let on = true;
    fetchMe()
      .then((u) => { if (on && u) setUser(u); })
      .catch(() => {});
    return () => { on = false; };
  }, [backendUp]);

  const signOut = () => { logout(); window.location.reload(); };

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <Sidebar page={page} setPage={setPage} open={sidebarOpen} setOpen={setSidebarOpen} />
      <main className="lg:pl-60">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 pt-14 lg:pt-6">
          <div className="flex items-center justify-between mb-3 text-[11px]">
            <div className="flex items-center gap-2">
              {backendUp === true && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Backend Online (Port 5000)
                </span>
              )}
              {backendUp === false && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-semibold border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Backend Offline (Start: python -m uvicorn main:app --port 5000 in backend/)
                </span>
              )}
              {backendUp === null && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
                  <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                  Connecting to backend…
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-slate-400">
              <span>{user?.email || "operator@voiceguard.ai"}</span>
              <button onClick={signOut} className="font-bold text-slate-500 hover:text-slate-800">RESET</button>
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
