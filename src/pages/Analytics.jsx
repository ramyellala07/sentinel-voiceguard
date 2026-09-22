import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import {
  fetchThreatTimeline, fetchRiskDistribution, fetchModelPerformance,
  fetchRecentEvents, fetchIncidents,
} from "../services/api";
import { Card, DemoBanner } from "../components/ui";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const baseOpts = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
  scales: {
    x: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
    y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } }, beginAtZero: true },
  },
};

function last7Days() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

export default function Analytics() {
  const [timeline, setTimeline] = useState(null);
  const [dist, setDist] = useState(null);
  const [models, setModels] = useState([]);
  const [events, setEvents] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const live = Boolean(import.meta.env.VITE_BACKEND_URL);

  useEffect(() => {
    let on = true;
    (async () => {
      const [t, d, m, e, ic] = await Promise.all([
        fetchThreatTimeline(), fetchRiskDistribution(), fetchModelPerformance(),
        fetchRecentEvents(), fetchIncidents(),
      ]);
      if (!on) return;
      setTimeline(t); setDist(d); setModels(m); setEvents(e); setIncidents(ic);
    })();
    return () => { on = false; };
  }, []);

  // Genuine vs synthetic per day, derived from real event timestamps.
  const weekly = useMemo(() => {
    const days = last7Days();
    const key = (d) => d.toDateString();
    const g = days.map(() => 0);
    const s = days.map(() => 0);
    events.forEach((e) => {
      if (!e.created_at) return;
      const k = new Date(e.created_at).toDateString();
      const i = days.findIndex((d) => key(d) === k);
      if (i < 0) return;
      if ((e.aiDetection || "").toLowerCase() === "genuine") g[i] += 1;
      else s[i] += 1;
    });
    return { labels: days.map((d) => d.toLocaleDateString("en-US", { weekday: "short" })), g, s };
  }, [events]);

  // Threat categories counted from real incidents.
  const categories = useMemo(() => {
    const counts = {};
    incidents.forEach((i) => { counts[i.type] = (counts[i.type] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { labels: top.map(([k]) => k), values: top.map(([, v]) => v) };
  }, [incidents]);

  return (
    <div>
      <DemoBanner active={!live} />
      <h1 className="text-2xl font-extrabold text-slate-900">Analytics</h1>
      <p className="text-sm text-slate-500 mt-1 mb-1">Detection trends and model performance overview.</p>
      <p className="text-[11px] font-bold tracking-widest text-amber-700 bg-amber-50 border border-amber-200 inline-block px-2 py-1 mb-5">DEMO METRICS — illustrative only, not measured model results</p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card title="THREATS OVER TIME">
          <div className="h-60">
            <Line
              data={{ labels: timeline?.labels || [], datasets: [
                { label: "High Risk", data: timeline?.highRisk || [], borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)", fill: true, tension: 0.4, pointRadius: 0 },
                { label: "Suspicious", data: timeline?.suspicious || [], borderColor: "#f59e0b", tension: 0.4, pointRadius: 0 },
              ] }}
              options={baseOpts}
            />
          </div>
        </Card>
        <Card title="GENUINE VS SYNTHETIC (7 DAYS, REAL EVENTS)">
          <div className="h-60">
            <Bar
              data={{ labels: weekly.labels, datasets: [
                { label: "Genuine", data: weekly.g, backgroundColor: "#22c55e" },
                { label: "Synthetic", data: weekly.s, backgroundColor: "#ef4444" },
              ] }}
              options={baseOpts}
            />
          </div>
        </Card>
        <Card title="THREAT CATEGORIES (REAL INCIDENTS)">
          <div className="h-60">
            <Bar
              data={{ labels: categories.labels, datasets: [
                { label: "Count", data: categories.values, backgroundColor: "#0284c7" },
              ] }}
              options={{ ...baseOpts, plugins: { legend: { display: false } } }}
            />
          </div>
        </Card>
        <Card title="RISK DISTRIBUTION">
          <div className="h-60 flex items-center justify-center">
            <Doughnut
              data={{ labels: dist?.labels || [], datasets: [{ data: dist?.values || [], backgroundColor: dist?.colors || [], borderWidth: 3, borderColor: "#fff" }] }}
              options={{ responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } } } }}
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {models.map((m) => (
          <Card key={m.name} title={m.name.toUpperCase()}>
            <div className="text-[12px] text-slate-500 font-medium mb-2">{m.model}</div>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[["Accuracy", m.accuracy], ["Precision", m.precision], ["Recall", m.recall], ["F1 Score", m.f1]].map(([k, v]) => (
                <div key={k} className="border border-slate-200 p-2">
                  <div className="text-[10px] font-bold text-slate-500 tracking-wider">{k.toUpperCase()}</div>
                  <div className="text-lg font-extrabold">{v}%</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
