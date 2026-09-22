import { useState } from "react";
import { defaultSettings } from "../data/mockData";
import { mockSocket } from "../services/socket";
import { TWILIO_STATUS } from "../services/twilio";
import { Card, DemoBanner } from "../components/ui";

function Slider({ label, value, onChange, min = 0, max = 100 }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between text-[13px] font-bold"><span>{label}</span><span>{value}%</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-sky-600" />
    </div>
  );
}

function Toggle({ label, desc, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100">
      <div><div className="text-[13px] font-bold">{label}</div><div className="text-xs text-slate-500">{desc}</div></div>
      <button onClick={() => onChange(!value)} className={`w-11 h-6 flex items-center px-1 transition-colors ${value ? "bg-green-600 justify-end" : "bg-slate-300 justify-start"}`}>
        <span className="w-4 h-4 bg-white shadow" />
      </button>
    </div>
  );
}

export default function Settings() {
  const [s, setS] = useState(defaultSettings);
  const set = (k) => (v) => setS((prev) => ({ ...prev, [k]: v }));

  return (
    <div>
      <DemoBanner active />
      <h1 className="text-2xl font-extrabold text-slate-900">Settings</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">Detection thresholds, automation and model configuration.</p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="DETECTION THRESHOLDS">
          <Slider label="Security Threshold" value={s.securityThreshold} onChange={set("securityThreshold")} />
          <Slider label="Speaker Similarity Threshold" value={s.similarityThreshold} onChange={set("similarityThreshold")} />
          <Slider label="Challenge Threshold" value={s.challengeThreshold} onChange={set("challengeThreshold")} />
          <Toggle label="Automatic Blocking" desc="Block calls above the security threshold" value={s.autoBlock} onChange={set("autoBlock")} />
          <Toggle label="Security Alerts" desc="Notify the SOC on high-risk events" value={s.securityAlerts} onChange={set("securityAlerts")} />
        </Card>

        <div className="space-y-4">
          <Card title="MODEL CONFIGURATION">
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between border border-slate-200 p-3"><span className="font-bold">Voice Clone Detection</span><span className="font-mono text-sky-700">Wav2Vec 2.0</span></div>
              <div className="flex justify-between border border-slate-200 p-3"><span className="font-bold">Speaker Verification</span><span className="font-mono text-sky-700">ECAPA-TDNN</span></div>
              <div className="flex justify-between border border-slate-200 p-3"><span className="font-bold">Risk Engine</span><span className="text-green-700 font-bold">● Active</span></div>
              <div className="flex justify-between border border-slate-200 p-3"><span className="font-bold">Context LLM</span><span className="font-mono text-sky-700 text-[12px]">Llama / Mistral (Ollama)</span></div>
              <div className="flex justify-between border border-slate-200 p-3"><span className="font-bold">Training Data</span><span className="font-mono text-sky-700 text-[12px]">Built on XLS-R · Trained on MLAAD</span></div>
            </div>
          </Card>
          <Card title="SYSTEM STATUS">
            <div className="space-y-2 text-[13px]">
              {[["API Status", s.apiStatus, "text-green-700"], [`Socket.IO Status (${mockSocket.mode})`, s.socketStatus, "text-sky-700"], ["Audio Input Status", s.audioStatus, "text-green-700"], ["Twilio Voice Input", TWILIO_STATUS.mode === "mock" ? "Mock (not wired)" : TWILIO_STATUS.mode, "text-amber-700"]].map(([k, v, c]) => (
                <div key={k} className="flex justify-between border border-slate-200 p-3"><span className="font-bold">{k}</span><span className={`font-bold ${c}`}>{v}</span></div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Socket + Twilio run in mock mode. To go live: set <span className="font-mono">VITE_SOCKET_URL</span> (see <span className="font-mono">.env.example</span>) and follow the steps in <span className="font-mono">services/socket.js</span> + <span className="font-mono">services/twilio.js</span>. Test the backend with Postman first.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
