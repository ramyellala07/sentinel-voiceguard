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
import { fetchMe, logout } from "./services/api";

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
  const Page = PAGES[page] || Dashboard;

  useEffect(() => {
    let on = true;
    fetchMe()
      .then((u) => { if (on) { setUser(u); setChecking(false); } })
      .catch(() => { if (on) { setUser(null); setChecking(false); } });
    return () => { on = false; };
  }, []);

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
