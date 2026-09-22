import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, ArcElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";
import { PhoneCall, ShieldAlert, AlertTriangle, Target } from "lucide-react";
import {
  fetchDashboardStats, fetchThreatTimeline, fetchRiskDistribution,
  fetchRecentEvents, BACKEND_STATUS,
} from "../services/api";
import { Card, StatCard, StatusBadge, DemoBanner } from "../components/ui";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
  scales: {
    x: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
    y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } }, beginAtZero: true },
  },
};

const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "68%",
  plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } } },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [dist, setDist] = useState(null);
  const [events, setEvents] = useState([]);
  const live = Boolean(import.meta.env.VITE_BACKEND_URL);

  useEffect(() => {
    let on = true;
    (async () => {
      const [s, t, d, e] = await Promise.all([
        fetchDashboardStats(), fetchThreatTimeline(),
        fetchRiskDistribution(), fetchRecentEvents(),
      ]);
      if (!on) return;
      setStats(s); setTimeline(t); setDist(d); setEvents(e);
    })();
    return () => { on = false; };
  }, []);

  const lineData = {
    labels: timeline?.labels || [],
    datasets: [
      { label: "Safe", data: timeline?.safe || [], borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.08)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
      { label: "Suspicious", data: timeline?.suspicious || [], borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
      { label: "High Risk", data: timeline?.highRisk || [], borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.10)", fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
    ],
  };

  const donutData = {
    labels: dist?.labels || [],
    datasets: [{ data: dist?.values || [], backgroundColor: dist?.colors || [], borderColor: "#fff", borderWidth: 3 }],
  };

  return (
    <div>
      <DemoBanner active={!live} />
      {live && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-800 text-xs font-semibold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          LIVE DATA ({BACKEND_STATUS.url}) — every number below comes from the backend
        </div>
      )}
      <h1 className="text-2xl font-extrabold text-slate-900">Voice Impersonation Defense</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">Real-time AI-powered detection and prevention of voice-based impersonation attacks.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard label="TOTAL ANALYSES" value={stats ? String(stats.totalAnalyses) : "…"} sub="All calls analyzed" icon={PhoneCall} accent="bg-sky-50 text-sky-600" />
        <StatCard label="THREATS DETECTED" value={stats ? String(stats.threatsDetected).padStart(2, "0") : "…"} sub="Risk 45+" icon={ShieldAlert} accent="bg-red-50 text-red-600" />
        <StatCard label="HIGH-RISK EVENTS" value={stats ? String(stats.highRiskEvents).padStart(2, "0") : "…"} sub="Risk 70+" icon={AlertTriangle} accent="bg-amber-50 text-amber-600" />
        <StatCard label="OPEN INCIDENTS" value={stats ? String(stats.openIncidents) : "…"} sub={`Avg risk ${stats?.avgRisk ?? "…"}`} icon={Target} accent="bg-green-50 text-green-600" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card title="REAL-TIME THREAT MONITORING" live className="xl:col-span-2">
          <div className="h-64"><Line data={lineData} options={lineOptions} /></div>
        </Card>
        <Card title="RISK DISTRIBUTION">
          <div className="h-64 flex items-center justify-center"><Doughnut data={donutData} options={donutOptions} /></div>
        </Card>
      </div>

      <Card title="RECENT SECURITY EVENTS">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] tracking-wider text-slate-500 border-b border-slate-100">
                {["Time", "Caller", "Speaker Match", "AI Detection", "Risk Score", "Context", "Action", "Status"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-bold whitespace-nowrap">{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-mono text-xs whitespace-nowrap">{e.time}</td>
                  <td className="py-2.5 pr-3 font-medium whitespace-nowrap">{e.caller}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{e.speakerMatch}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{e.aiDetection}</td>
                  <td className="py-2.5 pr-3 font-bold whitespace-nowrap">{e.riskScore}%</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{e.context}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{e.action}</td>
                  <td className="py-2.5 pr-3"><StatusBadge status={e.status} /></td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">No events yet — run an analysis first.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
