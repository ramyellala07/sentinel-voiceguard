import {
  LayoutDashboard, Radio, Mic, FileSearch, History, BarChart3, Settings, ShieldCheck, Menu, X,
} from "lucide-react";
import { siteConfig } from "../data/mockData";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "live", label: "Live Detection", icon: Radio },
  { id: "verification", label: "Voice Verification", icon: Mic },
  { id: "threats", label: "Threat Analysis", icon: FileSearch },
  { id: "incidents", label: "Incident History", icon: History },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ page, setPage, open, setOpen }) {
  return (
    <>
      {/* mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-white border border-slate-200 shadow-sm"
        aria-label="Toggle menu"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside
        className={`fixed z-40 inset-y-0 left-0 w-60 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-5 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-sky-600 flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div>
              <div className="font-extrabold tracking-wide text-[15px] text-slate-900">{siteConfig.name}</div>
              <div className="text-[10px] tracking-[0.18em] text-sky-700 font-semibold">{siteConfig.tagline}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setPage(item.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium border-l-2 transition-colors ${
                  active
                    ? "bg-sky-50 text-sky-700 border-sky-600"
                    : "text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-2 text-[11px] font-semibold tracking-wide">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> SYSTEM ONLINE
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" /> AI MODELS READY
          </div>
          <div className="pt-1 text-[10px] text-slate-400 font-normal">DEMO MODE · simulated data</div>
        </div>
      </aside>
    </>
  );
}
