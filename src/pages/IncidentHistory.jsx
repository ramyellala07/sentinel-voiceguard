import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchIncidents } from "../services/api";
import { Card, DemoBanner, StatusBadge } from "../components/ui";

export default function IncidentHistory() {
  const [incidents, setIncidents] = useState([]);
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState("all");
  const [type, setType] = useState("all");
  const live = Boolean(import.meta.env.VITE_BACKEND_URL);

  useEffect(() => {
    let on = true;
    fetchIncidents().then((rows) => { if (on) setIncidents(rows); });
    return () => { on = false; };
  }, []);

  const types = useMemo(() => ["all", ...new Set(incidents.map((i) => i.type))], [incidents]);

  const rows = incidents.filter((i) => {
    if (q && !(i.id + i.caller + i.type).toLowerCase().includes(q.toLowerCase())) return false;
    if (risk === "high" && i.risk < 70) return false;
    if (risk === "medium" && (i.risk < 40 || i.risk >= 70)) return false;
    if (risk === "low" && i.risk >= 40) return false;
    if (type !== "all" && i.type !== type) return false;
    return true;
  });

  return (
    <div>
      <DemoBanner active={!live} />
      <h1 className="text-2xl font-extrabold text-slate-900">Incident History</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">SOC-style record of past detections and responses{live ? " — live from backend." : "."}</p>

      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2 border border-slate-300 px-3 py-2 flex-1 min-w-[200px]">
            <Search size={15} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, caller, type…" className="outline-none text-[13px] w-full bg-transparent" />
          </div>
          <select value={risk} onChange={(e) => setRisk(e.target.value)} className="border border-slate-300 px-3 py-2 text-[13px]">
            <option value="all">All risk levels</option>
            <option value="high">High (70+)</option>
            <option value="medium">Medium (40–69)</option>
            <option value="low">Low (&lt;40)</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="border border-slate-300 px-3 py-2 text-[13px]">
            {types.map((t) => <option key={t} value={t}>{t === "all" ? "All threat types" : t}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-slate-500 border-b border-slate-100">
                {["Incident ID", "Timestamp", "Threat Type", "Caller", "Risk Score", "Detection Method", "Action", "Status"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-bold whitespace-nowrap">{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-mono font-bold whitespace-nowrap">{i.id}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs whitespace-nowrap">{i.time}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{i.type}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{i.caller}</td>
                  <td className="py-2.5 pr-3 font-bold">{i.risk}%</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">{i.method}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{i.action}</td>
                  <td className="py-2.5 pr-3"><StatusBadge status={i.status} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">No incidents match the filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
