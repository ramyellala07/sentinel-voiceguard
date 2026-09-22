import { useEffect, useState } from "react";
import { CheckCircle2, ShieldX } from "lucide-react";
import { fetchLatestThreat } from "../services/api";
import { Card, DemoBanner, RiskMeter } from "../components/ui";

function ScoreRow({ label, value, model }) {
  return (
    <div className="border border-slate-200 p-3">
      <div className="flex justify-between text-[12px] font-bold"><span>{label}</span>{model && <span className="text-slate-400 font-medium">{model}</span>}</div>
      <div className="text-2xl font-extrabold mt-1">{value}%</div>
      <div className="mt-2"><RiskMeter score={Math.round(value)} /></div>
    </div>
  );
}

export default function ThreatAnalysis() {
  const [t, setT] = useState(null);
  const live = Boolean(import.meta.env.VITE_BACKEND_URL);

  useEffect(() => {
    let on = true;
    fetchLatestThreat().then((row) => { if (on) setT(row); });
    return () => { on = false; };
  }, []);

  if (!t) {
    return (
      <div>
        <DemoBanner active={!live} />
        <h1 className="text-2xl font-extrabold text-slate-900">Threat Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">No threats recorded yet — run an analysis first.</p>
      </div>
    );
  }

  const blocked = (t.decision || "").toUpperCase().includes("BLOCK");

  return (
    <div>
      <DemoBanner active={!live} />
      {live && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-800 text-xs font-semibold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          LIVE DOSSIER — highest-risk event on record ({t.threatId})
        </div>
      )}
      <h1 className="text-2xl font-extrabold text-slate-900">Threat Analysis</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">Deep investigation of a flagged impersonation attempt.</p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card title="THREAT SUMMARY" className="xl:col-span-1">
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-slate-500">THREAT ID</span><span className="font-mono font-bold">{t.threatId}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Timestamp</span><span className="font-medium">{t.timestamp}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Caller</span><span className="font-medium">{t.caller}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-500">Decision</span>
              <span className={`px-2 py-0.5 text-white text-[11px] font-extrabold flex items-center gap-1 ${blocked ? "bg-red-600" : "bg-amber-500"}`}><ShieldX size={12} /> {t.decision}</span>
            </div>
          </div>
          <div className="mt-4 text-center border-t border-slate-100 pt-4">
            <div className="text-[11px] font-bold tracking-widest text-slate-500">FINAL RISK SCORE</div>
            <div className="text-5xl font-extrabold">{t.finalRisk}<span className="text-lg text-slate-400">/100</span></div>
            <div className="mt-3"><RiskMeter score={t.finalRisk} /></div>
          </div>
        </Card>

        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScoreRow label="Voice Authenticity" value={t.voiceAuthenticity} model="Wav2Vec 2.0 + AASIST" />
          <ScoreRow label="Speaker Verification" value={t.speakerSimilarity} model="ECAPA-TDNN" />
          <ScoreRow label="Context Analysis" value={t.contextRisk} model="Heuristic" />
          <ScoreRow label="Behavioral Analysis" value={t.behavioralAnomaly} model="Fusion" />
        </div>
      </div>

      <Card title="WHY WAS THIS CALL FLAGGED?">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(t.reasons || []).map((r) => (
            <div key={r} className="flex items-start gap-2 p-3 bg-red-50/60 border border-red-100 text-[13px]">
              <CheckCircle2 size={16} className="text-red-600 mt-0.5 shrink-0" /> <span>{r}</span>
            </div>
          ))}
          {(t.reasons || []).length === 0 && <div className="text-slate-400 text-[13px]">No analyst notes recorded for this event.</div>}
        </div>
      </Card>
    </div>
  );
}
