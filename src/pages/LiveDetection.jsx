import { useEffect, useRef, useState } from "react";
import {
  Mic, Square, Upload, MicOff, Play, ShieldCheck, ShieldX,
  AudioWaveform, Brain, UserCheck, FileText, Gauge, Flag, Bell, Ban, Radio,
} from "lucide-react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from "chart.js";
import { Line } from "react-chartjs-2";
import { pipelineStages } from "../data/mockData";
import { mockSocket, sendChallengeResponse } from "../services/socket";
import { analyzeVoice, simulateLiveCall, fetchSession, fetchSpeakers, fetchSamples, BACKEND_STATUS } from "../services/api";
import { blobToWav16k } from "../services/audio";
import { useRecording } from "../hooks/useRecording";
import { Card, DemoBanner, RiskMeter, Waveform } from "../components/ui";
import OperatorInstructions from "../components/OperatorInstructions";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const ICONS = { mic: Mic, audio: AudioWaveform, brain: Brain, user: UserCheck, file: FileText, gauge: Gauge, shield: ShieldCheck };

const INITIAL_STAGE = () => Object.fromEntries(
  pipelineStages.map((s) => [s.id, { status: "idle", result: "Waiting…", confidence: null }])
);

const RISK_BREAKDOWN = [
  { label: "Voice Authenticity", value: 94 },
  { label: "Speaker Verification", value: 91 },
  { label: "Context Risk", value: 88 },
  { label: "Behavioral Anomaly", value: 82 },
];

export default function LiveDetection() {
  const rec = useRecording({ stream: true });
  const [monitoring, setMonitoring] = useState(false);
  const [stages, setStages] = useState(INITIAL_STAGE);
  const [risk, setRisk] = useState(4);
  const [riskLevel, setRiskLevel] = useState("LOW");
  const [challenge, setChallenge] = useState(null); // { phrase } | { passed } | { failed }
  const [incident, setIncident] = useState(null);
  const [log, setLog] = useState([]);
  const [demoMode, setDemoMode] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [backendNote, setBackendNote] = useState("");
  const [analysis, setAnalysis] = useState(null);   // /api/analyze-voice result
  const [liveCheck, setLiveCheck] = useState(null); // {phase:'listening'|'analyzing', secs}
  const [speakers, setSpeakers] = useState([]);
  const [verifyId, setVerifyId] = useState("auto"); // "auto" = identify, or an ID for 1:1
  const [samples, setSamples] = useState([]);
  const [simSample, setSimSample] = useState("random"); // "random" = surprise, or a file name
  const [simulating, setSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simScenario, setSimScenario] = useState(null);
  const timers = useRef([]);
  const fileInput = useRef(null);
  const pollTimer = useRef(null);
  const backendLive = Boolean(import.meta.env.VITE_BACKEND_URL);

  const pushLog = (msg) => setLog((l) => [{ t: new Date().toLocaleTimeString(), msg }, ...l].slice(0, 30));

  const setStage = (id, patch) => setStages((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => () => { clearTimers(); mockSocket.stopSimulation(); }, []);
  useEffect(() => { let live = true; fetchSpeakers().then((rows) => { if (live) setSpeakers(rows); }); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; fetchSamples().then((rows) => { if (live) setSamples(Array.isArray(rows) ? rows : []); }); return () => { live = false; }; }, []);

  // Subscribe to mock socket events (same handler names the real backend will use)
  useEffect(() => {
    const unsubs = [
      mockSocket.on("voice_detected", (p) => {
        setStage("audio-input", { status: "done", result: `Incoming voice · ${p.caller}`, confidence: 99 });
        setStage("audio-processing", { status: "active", result: "Denoising…" });
        pushLog(`Incoming voice detected (${p.caller})`);
      }),
      mockSocket.on("audio_processed", (p) => {
        setStage("audio-processing", { status: "done", result: `${p.snr} · ${p.vad}`, confidence: 98 });
        setStage("clone-detection", { status: "active", result: "Analyzing…" });
        pushLog("Audio processing complete");
      }),
      mockSocket.on("clone_analysis", (p) => {
        setStage("clone-detection", { status: "done", result: p.result, confidence: p.confidence });
        setStage("speaker-verification", { status: "active", result: "Comparing embedding…" });
        setRisk(58); setRiskLevel("HIGH");
        pushLog(`Clone detection: ${p.result} (${p.confidence}%)`);
      }),
      mockSocket.on("speaker_analysis", (p) => {
        setStage("speaker-verification", { status: "done", result: `${p.result} · ${p.similarity}%`, confidence: p.similarity });
        setStage("context-analysis", { status: "active", result: "Parsing intent…" });
        pushLog(`Speaker verification: ${p.result} (${p.similarity}%)`);
      }),
      mockSocket.on("context_analysis", (p) => {
        setStage("context-analysis", { status: "done", result: p.result, confidence: 88 });
        setStage("risk-engine", { status: "active", result: "Fusing scores…" });
        pushLog(`Context: ${p.result}`);
      }),
      mockSocket.on("risk_updated", (p) => {
        setRisk(p.score); setRiskLevel(p.level);
        setStage("risk-engine", { status: "done", result: `${p.score}/100 · ${p.level}`, confidence: p.score });
        pushLog(`Risk score: ${p.score}/100 (${p.level})`);
      }),
      mockSocket.on("challenge_required", (p) => {
        setStage("final-decision", { status: "active", result: "Challenge issued", confidence: null });
        setChallenge({ phrase: p.phrase });
        pushLog("Adaptive challenge issued");
      }),
      mockSocket.on("challenge_failed", () => {
        setChallenge({ failed: true });
        setStage("final-decision", { status: "done", result: "CHALLENGE FAILED", confidence: 18 });
        pushLog("Challenge failed");
      }),
      mockSocket.on("threat_blocked", (p) => {
        setIncident(p.incidentId);
        setStage("final-decision", { status: "done", result: "THREAT BLOCKED", confidence: 99 });
        pushLog(`Threat blocked · ${p.incidentId}`);
      }),
    ];
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMonitoring = () => {
    clearTimers(); mockSocket.stopSimulation();
    setStages(INITIAL_STAGE()); setRisk(4); setRiskLevel("LOW");
    setChallenge(null); setIncident(null); setDemoMode(false);
    setMonitoring(true); rec.start();
    setStage("audio-input", { status: "active", result: "Listening…" });
    pushLog("Monitoring started");
    // Lightweight ambient simulation (low risk, no attack)
    const t = setTimeout(() => {
      setStage("audio-input", { status: "done", result: "Voice stream captured", confidence: 99 });
      setStage("audio-processing", { status: "done", result: "Clean signal · 22 dB", confidence: 97 });
      setStage("clone-detection", { status: "done", result: "GENUINE VOICE", confidence: 96.4 });
      setRisk(9); pushLog("Ambient check: genuine voice (demo)");
    }, 2500);
    timers.current.push(t);
  };

  const stopAll = () => {
    setMonitoring(false); rec.stop(); clearTimers(); mockSocket.stopSimulation();
    pushLog("Monitoring stopped");
  };

  const startAttackSimulation = () => {
    clearTimers();
    setStages(INITIAL_STAGE()); setRisk(4); setRiskLevel("LOW");
    setChallenge(null); setIncident(null);
    setMonitoring(true); rec.start(); setDemoMode(true);
    pushLog("ATTACK SIMULATION started");
    mockSocket.runAttackSimulation();
  };

  // Render an /api/analyze-voice result: pipeline stages + dynamic Chart.js data.
  const applyAnalysis = (out, sourceLabel) => {
    setAnalysis(out);
    const ai = out.ai_probability;
    setStage("audio-processing", { status: "done", result: "Decoded + analyzed", confidence: 97 });
    setStage("clone-detection", {
      status: "done",
      result: out.label === "genuine" ? "GENUINE VOICE" : out.label === "synthetic" ? "SYNTHETIC VOICE DETECTED" : "SUSPICIOUS VOICE",
      confidence: ai,
    });
    setStage("speaker-verification", {
      status: "done",
      result: out.identified_as
        ? `IDENTIFIED: ${out.identified_name || out.identified_as} · ${out.similarity}%`
        : verifyId === "auto"
          ? `UNKNOWN SPEAKER · best ${out.similarity}%`
          : `${out.fingerprint_match ? "MATCH" : "MISMATCH"} · ${out.similarity}% · vs ${verifyId}${out.speaker_enrolled === false ? " (not enrolled)" : ""}`,
      confidence: out.similarity,
    });
    const rs = out.scores?.risk_score ?? ai;
    const lvl = out.level || (ai >= 70 ? "HIGH" : ai >= 45 ? "MEDIUM" : "LOW");
    setStage("context-analysis", { status: "done", result: out.report?.title || `Risk ${rs}`, confidence: null });
    setStage("risk-engine", { status: "done", result: `${rs}/100 · ${lvl}`, confidence: rs });
    setStage("final-decision", { status: "done", result: out.report?.recommendation || lvl, confidence: rs });
    setRisk(rs); setRiskLevel(lvl);
    pushLog(`${sourceLabel}: AI ${ai}% (${out.label}) · ${out.identified_as ? `identified ${out.identified_name || out.identified_as} (${out.similarity}%)` : `fingerprint ${out.fingerprint_match ? "MATCH" : "NO MATCH"}`} · log saved`);
  };

  // Upload path: file -> POST /api/analyze-voice -> dynamic charts + report.
  const handleFile = async (file) => {
    if (!file) return;
    clearTimers(); mockSocket.stopSimulation();
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setStages(INITIAL_STAGE()); setRisk(4); setRiskLevel("LOW");
    setChallenge(null); setIncident(null); setDemoMode(false);
    setSimulating(false); setAnalysis(null);
    setAnalyzing(true); setBackendNote(`Analyzing ${file.name}…`);
    setStage("audio-input", { status: "done", result: `File: ${file.name}`, confidence: 99 });
    setStage("audio-processing", { status: "active", result: "Uploading…" });
    pushLog(`Uploading ${file.name} to backend…`);
    try {
      // ECAPA needs WAV: convert uploads (mp3/webm) so verification is real.
      let up = file;
      try { up = await blobToWav16k(file); } catch { up = file; }
      const out = await analyzeVoice(up, { speakerId: verifyId });
      if (out.mock && backendLive) {
        setBackendNote("Backend unreachable — showing demo result.");
        pushLog("Backend unreachable, demo result shown");
      } else {
        setBackendNote(backendLive ? `Scored by backend · session ${out.session_id} · log saved to MongoDB` : "Demo result (set VITE_BACKEND_URL for real analysis).");
      }
      applyAnalysis(out, `Verdict for ${file.name}`);
    } catch (e) {
      setBackendNote(`Analysis failed: ${e.message}`);
      pushLog(`Analysis failed: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Pretty label for sample files: sample-genuine.wav -> GENUINE, etc.
  const prettySample = (f = "") => {
    const base = f.toLowerCase();
    if (base.includes("genuine")) return "GENUINE";
    if (base.includes("suspicious")) return "SUSPICIOUS";
    if (base.includes("synthetic") || base.includes("clone")) return "SYNTHETIC / CLONE";
    return f || "SAMPLE";
  };

  // Mock-Twilio path: backend "streams" a pre-saved sample; we poll for completion.
  // simSample = "random" (default surprise) or a specific file — same pattern as verifyId.
  const startSimulateLiveCall = async () => {
    clearTimers(); mockSocket.stopSimulation();
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setStages(INITIAL_STAGE()); setRisk(4); setRiskLevel("LOW");
    setChallenge(null); setIncident(null); setDemoMode(false); setAnalysis(null);
    setSimulating(true); setSimProgress(0);
    setStage("audio-input", { status: "active", result: "Live call connecting…" });    // Resolve what to send: "random" picks locally if we know samples, else backend randomizes.
    let toSend = simSample;
    if (toSend === "random") {
      if (samples.length > 0) toSend = samples[Math.floor(Math.random() * samples.length)].file;
      else toSend = "";
    }
    pushLog(`SIMULATE LIVE CALL started — ${simSample === "random" ? "RANDOM" : prettySample(toSend)} (${toSend || "backend picks"})…`);
    try {
      const started = await simulateLiveCall(toSend);
      const sid = started.session_id;
      setSimScenario(started.scenario || null);
      pushLog(`Live session ${sid} (${started.sample || toSend || "sample"}) — polling…`);
      setStage("audio-input", { status: "done", result: `Live call · ${started.sample || "sample"}`, confidence: 99 });
      setStage("audio-processing", { status: "active", result: "Streaming…" });
      pollTimer.current = setInterval(async () => {
        const s = await fetchSession(sid);
        setSimProgress(s.progress || 0);
        if (s.status === "complete" && s.result) {
          clearInterval(pollTimer.current); pollTimer.current = null;
          setSimulating(false);
          applyAnalysis(s.result, `Live call ${sid} complete`);
        } else if (s.status === "error") {
          clearInterval(pollTimer.current); pollTimer.current = null;
          setSimulating(false);
          pushLog(`Live session failed: ${s.result?.error || "unknown"}`);
        }
      }, 1000);
    } catch (e) {
      setSimulating(false);
      pushLog(`Simulate failed: ${e.message}`);
    }
  };

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  // EVALUATOR FLOW: record 5 s of live mic -> real backend analysis -> verdict.
  // Teammate speaks, result appears: MATCH/MISMATCH vs enrolled print + clone level.
  const startLiveVerify = async (secs = 5) => {
    clearTimers(); mockSocket.stopSimulation();
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setStages(INITIAL_STAGE()); setRisk(4); setRiskLevel("LOW");
    setChallenge(null); setIncident(null); setDemoMode(false); setAnalysis(null);
    setStage("audio-input", { status: "active", result: "Listening to live mic…" });
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const rec = new MediaRecorder(mic);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((r) => { rec.onstop = r; });
      rec.start();
      setMonitoring(true);
      for (let s = secs; s > 0; s--) {
        setLiveCheck({ phase: "listening", secs: s });
        await new Promise((r) => { timers.current.push(setTimeout(r, 1000)); });
      }
      rec.stop();
      await done;
      mic.getTracks().forEach((t) => t.stop());
      setMonitoring(false);
      setLiveCheck({ phase: "analyzing" });
      setStage("audio-input", { status: "done", result: "Live clip captured", confidence: 99 });
      setStage("audio-processing", { status: "active", result: "Analyzing…" });
      const wav = await blobToWav16k(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      const out = await analyzeVoice(wav, { speakerId: verifyId });
      applyAnalysis(out, "Live mic check");
    } catch (e) {
      setMonitoring(false);
      pushLog(`Live check failed: ${e.message} (mic permission needed)`);
    } finally {
      setLiveCheck(null);
    }
  };

  const submitChallenge = (pass) => {
    if (incident) sendChallengeResponse(incident, pass);
    if (pass) {
      setChallenge({ passed: true });
      setStage("final-decision", { status: "done", result: "CHALLENGE PASSED · Allowed", confidence: 92 });
      setRisk(12); setRiskLevel("LOW");
      pushLog("Challenge passed — call allowed");
    } else {
      mockSocket.emit("challenge_failed", { score: 18 });
      setTimeout(() => mockSocket.emit("threat_blocked", { incidentId: "INC-2026-0413" }), 900);
    }
  };

  const assistActive = risk >= 55 || !!challenge;
  const assistRef = useRef(null);

  // Bring the instructions into view the moment the call needs verification.
  useEffect(() => {
    if (assistActive) {
      assistRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [assistActive]);

  return (
    <div>
      <DemoBanner active={demoMode || monitoring} />
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">LIVE VOICE DETECTION</h1>
          <p className="text-sm text-slate-500 mt-1">Analyze incoming speech and evaluate impersonation risk in real time.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={simSample} onChange={(e) => setSimSample(e.target.value)} title="RANDOM picks a surprise call — or pick a specific type" className="px-3 py-2.5 border border-emerald-600 text-[13px] font-bold bg-white text-emerald-800">
            <option value="random">RANDOM — surprise call</option>
            {(samples.length > 0 ? samples.map((s) => s.file) : ["sample-genuine.wav", "sample-suspicious.wav", "sample-synthetic.wav"]).map((f) => (
              <option key={f} value={f}>{prettySample(f)} — {f}</option>
            ))}
          </select>
          <button
            onClick={startSimulateLiveCall}
            disabled={simulating}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] font-bold tracking-wide"
          >
            <Radio size={15} /> {simulating ? `SIMULATING… ${simProgress}%` : "SIMULATE LIVE CALL"}
          </button>
          <button
            onClick={startAttackSimulation}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold tracking-wide"
          >
            <Play size={15} /> START ATTACK SIMULATION
          </button>
        </div>
      </div>

      {liveCheck && (
        <div className="mb-4 border-2 border-emerald-500 bg-emerald-50 p-5 text-center">
          {liveCheck.phase === "listening" ? (
            <><div className="text-[12px] font-extrabold tracking-widest text-emerald-700">🎙 SPEAK NOW — CHECKING AGAINST {verifyId}</div>
            <div className="text-6xl font-extrabold text-emerald-800 mt-1">{liveCheck.secs}</div></>
          ) : (
            <div className="text-[13px] font-extrabold tracking-widest text-emerald-700 animate-pulse">ANALYZING LIVE VOICE…</div>
          )}
        </div>
      )}

      {simulating && (
        <div className="mb-4 border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex justify-between text-[12px] font-bold text-emerald-800">
            <span>📞 INCOMING CALL{simScenario ? ` — ${simScenario.title} · ${simScenario.persona}` : " — streaming sample…"}</span><span>{simProgress}%</span>
          </div>
          <div className="h-2 bg-emerald-100 mt-2"><div className="h-full bg-emerald-600 transition-all duration-500" style={{ width: `${simProgress}%` }} /></div>
        </div>
      )}

      {analysis && (
        <Card title={`VOICE ANALYSIS RESULT · ${analysis.label?.toUpperCase()} · AI ${analysis.ai_probability}%`} className="mb-4">
          <div className="mb-3 px-3 py-2.5 bg-slate-800 text-white text-[13px] flex flex-wrap gap-x-5 gap-y-1">
            <span>📞 <b>{analysis.scenario?.persona || "Unknown caller"}</b>{analysis.scenario?.title ? ` — ${analysis.scenario.title}` : ""}</span>
            <span>🪪 Identified: <b>{analysis.identified_name ? `${analysis.identified_name} (${analysis.similarity}%)` : `UNKNOWN (best ${analysis.similarity}%)`}</b></span>
            <span>💬 Asked: <b>{analysis.transcript ? `“${analysis.transcript.slice(0, 80)}${analysis.transcript.length > 80 ? "…" : ""}”` : "no speech detected"}</b></span>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-bold tracking-widest text-slate-500 mb-2">AI PROBABILITY OVER TIME (from uploaded audio)</div>
              <div className="h-52">
                <Line
                  data={{
                    labels: (analysis.timeline || []).map((_, i) => `${i + 1}`),
                    datasets: [{
                      label: "AI probability %",
                      data: analysis.timeline || [],
                      borderColor: analysis.ai_probability >= 70 ? "#ef4444" : analysis.ai_probability >= 45 ? "#f59e0b" : "#22c55e",
                      backgroundColor: "rgba(2,132,199,0.08)", fill: true, tension: 0.35, pointRadius: 0,
                    }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                {[
                  ["AI PROBABILITY", `${analysis.ai_probability}%`],
                  ["FINGERPRINT", analysis.fingerprint_match ? "MATCH ✓" : "NO MATCH ✗"],
                  ["SIMILARITY", `${analysis.similarity}%`],
                ].map(([k, v]) => (
                  <div key={k} className="border border-slate-200 p-2">
                    <div className="text-[10px] font-bold text-slate-500 tracking-wider">{k}</div>
                    <div className="text-lg font-extrabold">{v}</div>
                  </div>
                ))}
              </div>
              {analysis.voice_cues && (
                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                  {[
                    ["PITCH", analysis.voice_cues.pitch?.pitch_mean ? `${analysis.voice_cues.pitch.pitch_mean}±${analysis.voice_cues.pitch.pitch_std} Hz` : "—"],
                    ["PAUSES / BREATHS", `${analysis.voice_cues.pauses ?? "—"} / ${analysis.voice_cues.breaths ?? "—"}`],
                    ["SPEECH RATE", analysis.voice_cues.speech_rate_wpm ? `${analysis.voice_cues.speech_rate_wpm} wpm` : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="border border-slate-200 p-2">
                      <div className="text-[10px] font-bold text-slate-500 tracking-wider">{k}</div>
                      <div className="text-[13px] font-extrabold">{v}</div>
                    </div>
                  ))}
                </div>
              )}
              {(analysis.impersonation || analysis.claimed_identity?.text) && (
                <div className="mt-2 px-2 py-1.5 text-[12px] font-bold bg-red-50 border border-red-200 text-red-700">
                  {analysis.impersonation ? `⚠ IMPERSONATION: claims "${analysis.claimed_identity.text}" — voice matches nobody enrolled`
                    : `Claimed identity: "${analysis.claimed_identity.text}"`}
                </div>
              )}
            </div>
            <div className="border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold tracking-widest text-slate-500">POST-CALL RISK REPORT — FULL DETAIL</div>
                {analysis.report?.generated
                  ? <span className="text-[10px] font-extrabold tracking-widest px-2 py-0.5 bg-violet-600 text-white">✨ GENERATED LIVE</span>
                  : <span className="text-[10px] font-extrabold tracking-widest px-2 py-0.5 bg-slate-300 text-slate-700">TEMPLATE</span>}
              </div>
              {/* 1. Verdict + score */}
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <span className="px-2 py-1 text-[12px] font-extrabold tracking-widest bg-slate-900 text-white">{analysis.report?.verdict || analysis.report?.recommendation?.split(" ")[0] || analysis.level}</span>
                <span className="text-[12px] text-slate-600">Score: <b>{analysis.report?.score ?? analysis.ai_probability}%</b> · Risk: <b>{analysis.scores?.risk_score ?? analysis.report?.risk_score ?? "—"}/100</b></span>
              </div>
              {/* 2. Call time + duration */}
              <div className="mt-2 text-[12px] text-slate-600">🕒 {analysis.report?.call_time || analysis.call_time?.note || "—"}{analysis.report?.duration ? ` · ⏱ ${analysis.report.duration}s` : ""}</div>
              {/* 3. Claimed identity + speaker match */}
              <div className="mt-1 text-[12px] text-slate-600">👤 Claimed: <b>{analysis.report?.claimed_identity || analysis.claimed_identity?.text || "Not detected"}</b> · Speaker: <b>{analysis.report?.speaker_match || (analysis.fingerprint_match ? "matched" : "not matched")}</b>{analysis.similarity != null ? ` (${analysis.similarity}%)` : ""}</div>
              {/* 4. Synthetic level + flags */}
              <div className="mt-1 text-[12px] text-slate-600">🎙 Synthetic: <b>{analysis.report?.synthetic_level ?? analysis.ai_probability}%</b></div>
              {(analysis.report?.synthetic_flags?.length > 0 || analysis.voice_cues?.cues?.length > 0) && (
                <ul className="mt-1 list-disc pl-5 text-[12px] text-slate-600">{(analysis.report?.synthetic_flags || analysis.voice_cues.cues).slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}</ul>
              )}
              {/* 5. Info requested */}
              <div className="mt-2 text-[12px] font-bold text-slate-700">Information requested:</div>
              {(analysis.report?.info_requested?.length > 0)
                ? <ul className="list-disc pl-5 text-[12px] text-slate-600">{analysis.report.info_requested.map((it, i) => <li key={i}>{it}</li>)}</ul>
                : <div className="text-[12px] text-slate-500">Not detected</div>}
              {/* 6. Scenario summary */}
              <div className="mt-2 text-[12px] font-bold text-slate-700">What happened:</div>
              <p className="text-[13px] text-slate-700 mt-1">{analysis.report?.scenario_summary || analysis.report?.text}</p>
              {analysis.transcript && (
                <div className="mt-2 border-l-2 border-sky-400 pl-2 text-[12px] italic text-slate-600">
                  “{analysis.transcript}”
                  {analysis.transcript_language && <span className="not-italic font-mono text-[10px] text-slate-400"> · {analysis.transcript_language}</span>}
                </div>
              )}
              {!analysis.transcript && analysis.stt_pending && (
                <div className="mt-2 text-[11px] text-slate-400">Transcript engine warming up — scores above are final; words appear on the next analysis.</div>
              )}
              <div className="font-extrabold text-slate-900 mt-3">{analysis.report?.title}</div>
              {(analysis.report?.text && analysis.report?.text !== analysis.report?.scenario_summary) && (
                <p className="text-[12px] text-slate-500 mt-1">{analysis.report?.text}</p>
              )}
              <div className="mt-3 inline-block px-2 py-1 text-[11px] font-extrabold tracking-widest bg-slate-800 text-white">Recommendation: {analysis.report?.recommendation}</div>
              <div className="text-[11px] text-slate-400 mt-2 font-mono">session {analysis.session_id} · log saved{analysis.audio_url ? ` · ${analysis.audio_url}` : ""}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Voice input panel */}
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-4">
            <div className={`relative w-16 h-16 rounded-full flex items-center justify-center ${rec.recording ? "bg-red-600 text-white pulse-ring" : "bg-slate-100 text-slate-500"}`}>
              {rec.recording ? <Mic size={26} /> : <MicOff size={26} />}
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-widest text-slate-500">
                {rec.recording ? "● RECORDING" : "○ IDLE"}
              </div>
              <div className="text-xl font-mono font-bold">{rec.duration}</div>
              <div className="text-xs text-slate-500">Input level: {rec.level}%</div>
            </div>
          </div>
          <div className="flex-1">
            <Waveform active={rec.recording} color={risk >= 80 ? "#ef4444" : "#0284c7"} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => startLiveVerify(5)} disabled={!!liveCheck || analyzing || simulating} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] font-bold flex items-center gap-2">
              <Mic size={14} /> {liveCheck ? "LISTENING…" : "LIVE VERIFY (5s MIC)"}
            </button>
            {!monitoring
              ? <button onClick={startMonitoring} className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-[13px] font-bold">START MONITORING</button>
              : <button onClick={stopAll} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-[13px] font-bold flex items-center gap-2"><Square size={14} /> STOP</button>}
            <select value={verifyId} onChange={(e) => setVerifyId(e.target.value)} title="AUTO identifies the speaker — or pick one to check against" className="px-3 py-2.5 border border-slate-300 text-[13px] font-bold bg-white">
              <option value="auto">AUTO — identify speaker</option>
              {speakers.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.id}{s.enrolled ? "" : " (not enrolled)"}</option>
              ))}
            </select>
            <button onClick={() => fileInput.current?.click()} disabled={analyzing} className="px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-[13px] font-bold flex items-center gap-2 disabled:opacity-50">
              <Upload size={14} /> {analyzing ? "ANALYZING…" : "UPLOAD AUDIO"}
            </button>
            <input ref={fileInput} type="file" accept="audio/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          {backendLive
            ? `Backend connected (${BACKEND_STATUS.url}) — uploads are really analyzed. Mic streams live chunks when monitoring. ${backendNote}`
            : "Demo only: these buttons simulate an incoming call. Set VITE_BACKEND_URL to analyze real audio."}
        </p>
      </Card>

      {/* Highlighted live assistant — appears mid-call when verification is needed */}
      <div
        ref={assistRef}
        className={assistActive
          ? "mb-4 ring-2 ring-amber-400 border-2 border-amber-500 shadow-lg animate-pulse"
          : "mb-4"}
        style={assistActive ? { animationDuration: "2s" } : undefined}
      >
        <OperatorInstructions
          active={assistActive}
          challengePhrase={challenge?.phrase}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Pipeline */}
        <div className="xl:col-span-2">
          <Card title="AI ANALYSIS PIPELINE">
            <div className="space-y-2.5">
              {pipelineStages.map((s) => {
                const st = stages[s.id];
                const Icon = ICONS[s.icon] || Mic;
                const dot = st.status === "done" ? "bg-green-500" : st.status === "active" ? "bg-sky-500 animate-pulse" : "bg-slate-300";
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 border border-slate-100 bg-slate-50/50">
                    <div className="p-2 bg-white border border-slate-200 text-sky-700"><Icon size={17} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dot}`} />
                        <span className="text-[12px] font-bold tracking-wide">{s.label}</span>
                        <span className="text-[11px] text-slate-400">· {s.model}</span>
                      </div>
                      <div className="text-[12px] text-slate-600 truncate mt-0.5">{st.result}</div>
                      {st.status === "active" && (
                        <div className="h-1 mt-1.5 bg-slate-200 overflow-hidden"><div className="h-full w-2/5 bg-sky-500 animate-scan" /></div>
                      )}
                    </div>
                    {st.confidence != null && (
                      <div className="text-right shrink-0">
                        <div className="text-sm font-extrabold text-slate-900">{st.confidence}%</div>
                        <div className="text-[10px] text-slate-400">confidence</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Challenge */}
          {challenge && !challenge.passed && !challenge.failed && (
            <div className="mt-4 border-2 border-amber-300 bg-amber-50 p-5">
              <div className="text-[12px] font-extrabold tracking-widest text-amber-800">ADDITIONAL VERIFICATION REQUIRED</div>
              <div className="text-sm text-amber-900 mt-1">Dynamic Challenge — “Please repeat the displayed phrase.”</div>
              <div className="mt-3 text-2xl font-extrabold tracking-wide bg-white border border-amber-200 px-4 py-3 text-center">
                “{challenge.phrase}”
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => submitChallenge(true)} className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-[13px] font-bold">SUBMIT CHALLENGE (demo: pass)</button>
                <button onClick={() => submitChallenge(false)} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold">SUBMIT CHALLENGE (demo: fail)</button>
              </div>
            </div>
          )}
          {challenge?.passed && (
            <div className="mt-4 border border-green-300 bg-green-50 p-5 flex items-center gap-3">
              <ShieldCheck className="text-green-600" /> <div className="font-extrabold text-green-800 tracking-wide">CHALLENGE PASSED — CALL ALLOWED</div>
            </div>
          )}
          {(challenge?.failed || incident) && (
            <div className="mt-4 border-2 border-red-300 bg-red-50 p-5">
              <div className="flex items-center gap-2 font-extrabold text-red-700 tracking-wide"><ShieldX size={18} /> THREAT BLOCKED {incident && <span className="font-mono text-xs">· {incident}</span>}</div>
              <div className="flex flex-wrap gap-2 mt-3">
                <button className="px-4 py-2 bg-red-600 text-white text-[13px] font-bold flex items-center gap-1.5"><Ban size={14} /> BLOCK CALL</button>
                <button className="px-4 py-2 bg-slate-800 text-white text-[13px] font-bold flex items-center gap-1.5"><Bell size={14} /> ALERT SECURITY TEAM</button>
                <button className="px-4 py-2 border border-red-300 text-red-700 text-[13px] font-bold flex items-center gap-1.5"><Flag size={14} /> CREATE INCIDENT</button>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card title="RISK ENGINE">
            <div className="text-center py-2">
              <div className="text-[11px] font-bold tracking-widest text-slate-500">RISK SCORE</div>
              <div className="text-5xl font-extrabold text-slate-900">{risk}<span className="text-lg text-slate-400"> / 100</span></div>
              <div className={`inline-block mt-2 px-3 py-1 text-xs font-extrabold tracking-widest ${risk >= 80 ? "bg-red-600 text-white" : risk >= 55 ? "bg-amber-500 text-white" : "bg-green-600 text-white"}`}>{riskLevel}</div>
              <div className="mt-4"><RiskMeter score={risk} /></div>
            </div>
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {RISK_BREAKDOWN.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between text-[12px] font-medium"><span>{b.label}</span><span className="font-bold">{risk >= 55 ? b.value : Math.max(4, b.value - 80)}%</span></div>
                  <div className="h-1.5 bg-slate-100 mt-1"><div className="h-full bg-sky-600 transition-all duration-700" style={{ width: `${risk >= 55 ? b.value : Math.max(4, b.value - 80)}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="EVENT LOG">
            <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-[11px]">
              {log.length === 0 && <div className="text-slate-400">No events yet. Start monitoring or run the attack simulation.</div>}
              {log.map((e, i) => (
                <div key={i} className="flex gap-2"><span className="text-slate-400 shrink-0">{e.t}</span><span className="text-slate-700">{e.msg}</span></div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
