import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import LiveDetection from "./pages/LiveDetection";
import VoiceVerification from "./pages/VoiceVerification";
import ThreatAnalysis from "./pages/ThreatAnalysis";
import IncidentHistory from "./pages/IncidentHistory";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";

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
  const Page = PAGES[page] || Dashboard;

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <Sidebar page={page} setPage={setPage} open={sidebarOpen} setOpen={setSidebarOpen} />
      <main className="lg:pl-60">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 pt-14 lg:pt-6">
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
