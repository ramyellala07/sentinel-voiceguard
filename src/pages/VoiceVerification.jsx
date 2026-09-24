import { useEffect, useRef, useState } from "react";
import { UserCheck, Mic, CheckCircle2, XCircle, Upload } from "lucide-react";
import { analyzeVoice, enrollSpeaker, fetchSpeakers, BACKEND_STATUS } from "../services/api";
import { blobToWav16k } from "../services/audio";
import { Card, DemoBanner, RiskMeter, Waveform } from "../components/ui";

export default function VoiceVerification() {
  const [speakers, setSpeakers] = useState([]);
  const [speakerId, setSpeakerId] = useState("SPK-001");
  const [name, setName] = useState("Rahul Sharma");
  const [similarity, setSimilarity] = useState(null);
  const [matchInfo, setMatchInfo] = useState(null); // {match, enrolled, model}
  const [verifying, setVerifying] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [note, setNote] = useState("");
  const fileInput = useRef(null);
  const backendLive = Boolean(import.meta.env.VITE_BACKEND_URL);

  const loadSpeakers = async () => {
    const rows = await fetchSpeakers();
    setSpeakers(rows || []);
  };

  useEffect(() => {
    let live = true;
    fetchSpeakers().then((rows) => {
      if (live && rows?.length) {
        setSpeakers(rows);
        const preferred = rows.find((r) => r.id === "SPK-003") || rows.find((r) => r.enrolled) || rows[0];
        if (preferred) {
          setSpeakerId(preferred.id);
          setName(preferred.name);
        }
      }
    });
    return () => { live = false; };
  }, []);

  const runEnroll = async (files) => {
    if (!files?.length) return;
    setEnrolling(true);
    setNote(`Enrolling ${files.length} clip(s)…`);
    try {
      const out = await enrollSpeaker(files, speakerId, name);
      if (out.mock && backendLive) setNote("Backend unreachable — enrollment not saved.");
      else setNote(out.enrolled ? `Enrolled ✓ ${out.samples} clip(s) averaged into a 192-d ECAPA voiceprint.` : "Enrollment failed.");
      await loadSpeakers();
    } catch (e) {
      setNote(`Enroll failed: ${e.message} (clips must be .wav ≥ 0.5s)`);
    } finally {
      setEnrolling(false);
    }
  };

  // Mic enrollment: record 3 x 5 s clips in-browser, convert, enroll directly.
  // No Audacity/files needed — enroll and verify share the identical pipeline.
  const [micStep, setMicStep] = useState("");
  const runMicEnroll = async (nClips = 3, secs = 5) => {
    setEnrolling(true);
    setMicStep("");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const wavs = [];
      for (let c = 1; c <= nClips; c++) {
        setMicStep(`Recording clip ${c}/${nClips} — speak now…`);
        const chunks = [];
        const rec = new MediaRecorder(mic);
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        const done = new Promise((r) => { rec.onstop = r; });
        rec.start();
        await new Promise((r) => setTimeout(r, secs * 1000));
        rec.stop();
        await done;
        const wav = await blobToWav16k(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        wavs.push(new File([wav], `${speakerId}-mic-${c}.wav`, { type: "audio/wav" }));
      }
      mic.getTracks().forEach((t) => t.stop());
      setMicStep("");
      await runEnroll(wavs);
    } catch (e) {
      setNote(`Mic enroll failed: ${e.message} (mic permission needed)`);
      setEnrolling(false);
    }
  };

  // Real verification: 3 s mic sample -> ECAPA cosine vs enrolled voiceprint.
  const runVerification = async () => {
    setVerifying(true);
    setSimilarity(null);
    setMatchInfo(null);
    setNote("Recording 3 s of mic audio…");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const rec = new MediaRecorder(mic);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((r) => { rec.onstop = r; });
      rec.start();
      setTimeout(() => rec.stop(), 3000);
      await done;
      mic.getTracks().forEach((t) => t.stop());
      setNote("Converting to 16kHz WAV…");
      const file = await blobToWav16k(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      setNote("Verifying against enrolled voiceprint…");
      const out = await analyzeVoice(file, { speakerId });
      if (out.mock && backendLive) throw new Error("backend unreachable");
      setSimilarity(out.similarity);
      setMatchInfo({ match: out.fingerprint_match, enrolled: out.speaker_enrolled, model: out.model });
      setNote(out.speaker_enrolled === false
        ? "Speaker not enrolled — enroll 3 clips first."
        : `Real ECAPA-TDNN cosine similarity vs enrolled print.`);
    } catch (e) {
      setNote(`Verify failed: ${e.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const match = matchInfo?.match === true;
  const currentThreshold = speakers.find((s) => s.id === speakerId)?.threshold ?? 75;

  return (
    <div>
      <DemoBanner active={!backendLive} />
      {backendLive && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-800 text-xs font-semibold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          BACKEND CONNECTED ({BACKEND_STATUS.url}) — real ECAPA-TDNN verification
        </div>
      )}
      <h1 className="text-2xl font-extrabold text-slate-900">Voice Verification</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">Enroll trusted speakers, then verify incoming voices with ECAPA-TDNN embeddings.</p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card title="1 · ENROLL SPEAKER (3 WAV CLIPS)">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={speakerId} onChange={(e) => setSpeakerId(e.target.value)} placeholder="SPK-001" className="border border-slate-300 px-3 py-2 text-[13px] font-mono" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="border border-slate-300 px-3 py-2 text-[13px]" />
          </div>
          <button onClick={() => fileInput.current?.click()} disabled={enrolling} className="w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-[13px] font-bold flex items-center justify-center gap-2">
            <Upload size={14} /> {enrolling && !micStep ? "ENROLLING…" : "SELECT 1–5 WAV CLIPS & ENROLL"}
          </button>
          <button onClick={() => runMicEnroll()} disabled={enrolling} className="w-full px-4 py-2.5 mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] font-bold flex items-center justify-center gap-2">
            <Mic size={14} /> {micStep || "🎙 RECORD 3×5s CLIPS & ENROLL (NO FILES NEEDED)"}
          </button>
          <input ref={fileInput} type="file" accept=".wav,audio/wav" multiple className="hidden" onChange={(e) => { runEnroll(e.target.files); e.target.value = ""; }} />
          <div className="mt-3 space-y-1.5">
            {speakers.map((s) => (
              <div
                key={s.id}
                onClick={() => { setSpeakerId(s.id); setName(s.name); }}
                className={`flex justify-between items-center border p-2.5 text-[13px] cursor-pointer transition-colors ${
                  speakerId === s.id ? "border-sky-500 bg-sky-50/80" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${speakerId === s.id ? "bg-sky-500" : "bg-slate-300"}`} />
                  <span className="font-bold text-slate-800">{s.name} <span className="font-mono text-slate-400 text-xs">{s.id}</span></span>
                </div>
                <span className={`font-bold ${s.enrolled ? "text-green-700" : "text-amber-700"}`}>
                  {s.enrolled ? `● ENROLLED (${s.samples} clips)` : "○ NOT ENROLLED"}
                </span>
              </div>
            ))}
            {speakers.length === 0 && <div className="text-slate-400 text-[13px]">No speakers yet.</div>}
          </div>
        </Card>

        <Card title="2 · VERIFY INCOMING VOICE">
          <Waveform active={verifying} />
          <button onClick={runVerification} disabled={verifying} className="w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-[13px] font-bold mt-2">
            {verifying ? "VERIFYING…" : `VERIFY 3-S MIC SAMPLE vs ${speakerId}`}
          </button>
          {note && <div className="text-[11px] text-slate-500 mt-2">{note}</div>}
          {similarity != null && matchInfo?.enrolled !== false && (
            <div className="mt-4">
              <div className="flex justify-between text-[12px] font-bold"><span>SPEAKER SIMILARITY (ECAPA cosine)</span><span>{similarity}% (threshold {currentThreshold}%)</span></div>
              <div className="mt-2"><RiskMeter score={Math.round(similarity)} /></div>
              <div className={`mt-3 flex items-center gap-2 p-3 font-extrabold tracking-wide text-sm ${match ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {match ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {match ? "MATCH — IDENTITY CONFIRMED" : "MISMATCH — POSSIBLE IMPOSTOR"}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="HOW SPEAKER VERIFICATION WORKS">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 text-center text-[12px] font-bold">
          {["Enroll 3 clips", "ECAPA-TDNN", "192-d Voiceprint", "Cosine Comparison", "Match / Mismatch"].map((s, i, arr) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={`flex-1 border px-3 py-3 ${i === arr.length - 1 ? "border-sky-600 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                {i === arr.length - 1 ? <UserCheck size={16} className="mx-auto mb-1" /> : <Mic size={16} className="mx-auto mb-1 text-slate-400" />}
                {s}
              </div>
              {i < arr.length - 1 && <span className="text-sky-600 font-extrabold">↓</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
