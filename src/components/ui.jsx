export function StatusBadge({ status }) {
  const map = {
    CRITICAL: "bg-red-50 text-red-700 border-red-200",
    WARNING: "bg-amber-50 text-amber-700 border-amber-200",
    SAFE: "bg-green-50 text-green-700 border-green-200",
    Blocked: "bg-red-50 text-red-700 border-red-200",
    Allowed: "bg-green-50 text-green-700 border-green-200",
    Challenge: "bg-amber-50 text-amber-700 border-amber-200",
    Resolved: "bg-slate-100 text-slate-600 border-slate-200",
    "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
    Escalated: "bg-red-50 text-red-700 border-red-200",
    Closed: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-[11px] font-bold tracking-wide border ${map[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {status.toUpperCase()}
    </span>
  );
}

export function Card({ title, live, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {(title || live) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="section-title">{title}</h3>
          {live && (
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 tracking-wide">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE MONITORING
            </span>
          )}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function DemoBanner({ active }) {
  if (!active) return null;
  return (
    <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-200 text-sky-800 text-xs font-semibold tracking-wide">
      <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
      DEMO MODE — simulated real-time data (no backend connected)
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="card p-4 flex items-start justify-between">
      <div>
        <div className="text-[11px] font-bold tracking-[0.12em] text-slate-500">{label}</div>
        <div className="text-3xl font-extrabold text-slate-900 mt-1">{value}</div>
        {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
      </div>
      {Icon && (
        <div className={`p-2.5 ${accent || "bg-sky-50 text-sky-600"}`}>
          <Icon size={20} />
        </div>
      )}
    </div>
  );
}

// Fake audio waveform (pure CSS bars, animated while `active`)
export function Waveform({ active, bars = 48, color = "#0284c7" }) {
  return (
    <div className="flex items-center gap-[3px] h-16">
      {Array.from({ length: bars }).map((_, i) => {
        const h = active ? 20 + Math.round(Math.abs(Math.sin(i * 0.7)) * 80) : 12;
        return (
          <div
            key={i}
            className={active ? "wave-bar" : ""}
            style={{
              width: 3,
              height: `${h}%`,
              background: active ? color : "#cbd5e1",
              animationDelay: `${(i % 12) * 0.08}s`,
            }}
          />
        );
      })}
    </div>
  );
}

export function RiskMeter({ score }) {
  const color = score >= 80 ? "#ef4444" : score >= 55 ? "#f59e0b" : score >= 30 ? "#eab308" : "#22c55e";
  const label = score >= 80 ? "CRITICAL" : score >= 55 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  return (
    <div>
      <div className="h-3 bg-slate-100 border border-slate-200 overflow-hidden">
        <div className="h-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
      </div>
      <div className="flex justify-between mt-1 text-[11px] font-bold">
        <span style={{ color }}>{label}</span>
        <span className="text-slate-500">{score} / 100</span>
      </div>
    </div>
  );
}
