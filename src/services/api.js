// API service layer — backend-aware with mock fallback.
//
// If VITE_BACKEND_URL is set AND the backend answers, real data is used.
// Otherwise the original mock data is returned, so the app ALWAYS works
// (judges see the demo even with no server running).
//
// Backend contract (voiceguard-ai/backend):
//   GET  /api/dashboard/stats | /api/events/recent | /api/incidents
//   GET  /api/models/performance | /api/threats/current
//   POST /api/analyze/clone     (multipart audio) -> { label, confidence }
//   POST /api/verify/speaker    (multipart audio+speakerId) -> { similarity, match }
//   POST /api/analyze/context   { transcript, metadata } -> { risk, indicators }
//   POST /api/analyze/full      (multipart audio+transcript) -> full pipeline
import {
  threatDetail,
} from "../data/mockData";

const BACKEND = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

export const BACKEND_STATUS = {
  url: BACKEND || "(not set — see .env.example)",
  mode: BACKEND ? "backend" : "mock",
};

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

async function tryBackend(path, options, fallback, timeoutMs = 8000) {
  if (!BACKEND) return fallback();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${BACKEND}${path}`, { ...options, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`backend ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`[api] backend ${path} unreachable (${e.message}) — using mock data.`);
    return fallback();
  }
}

export async function fetchDashboardStats() {
  return tryBackend("/api/dashboard/stats", undefined, async () => {
    await delay();
    return { totalAnalyses: 0, threatsDetected: 0, highRiskEvents: 0, openIncidents: 0, avgRisk: 0 };
  });
}

export async function fetchThreatTimeline() {
  return tryBackend("/api/dashboard/timeline", undefined, async () => {
    await delay();
    return { labels: [], safe: [], suspicious: [], highRisk: [] };
  });
}

export async function fetchRiskDistribution() {
  return tryBackend("/api/dashboard/distribution", undefined, async () => {
    await delay();
    return { labels: [], values: [], colors: [] };
  });
}

export async function fetchRecentEvents() {
  return tryBackend("/api/events/recent", undefined, async () => {
    await delay();
    return [];
  });
}

export async function fetchIncidents() {
  return tryBackend("/api/incidents", undefined, async () => {
    await delay();
    return [];
  });
}

export async function createIncident(data) {
  return tryBackend("/api/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }, async () => ({ ...data, id: "MOCK", mock: true }));
}

export async function fetchModelPerformance() {
  return tryBackend("/api/models/performance", undefined, async () => {
    await delay();
    return [];
  });
}

export async function fetchThreatDetail() {
  return tryBackend("/api/threats/current", undefined, async () => {
    await delay();
    return threatDetail;
  });
}

export async function fetchLatestThreat() {
  return tryBackend("/api/threats/latest", undefined, async () => {
    await delay();
    return null;
  });
}

export async function fetchHealth() {
  if (!BACKEND) return { status: "mock", mode: "mock" };
  return tryBackend("/api/health", undefined, async () => ({ status: "mock", mode: "mock" }));
}

// ---- Real audio endpoints (used by LiveDetection / VoiceVerification) ----

export async function analyzeClone(file, opts = {}) {
  if (!BACKEND) {
    await delay(800);
    return { label: "synthetic", confidence: 94.2, mock: true };
  }
  const fd = new FormData();
  fd.append("audio", file);
  if (opts.demo) fd.append("demo", opts.demo);
  return tryBackend(`/api/analyze/clone${opts.demo ? `?demo=${opts.demo}` : ""}`, {
    method: "POST",
    body: fd,
  }, async () => {
    await delay(800);
    return { label: "synthetic", confidence: 94.2, mock: true };
  });
}

export async function verifySpeaker(file, speakerId = "SPK-001", opts = {}) {
  if (!BACKEND) {
    await delay(800);
    return { similarity: 91.8, match: true, mock: true };
  }
  const fd = new FormData();
  fd.append("audio", file);
  fd.append("speakerId", speakerId);
  if (opts.demo) fd.append("demo", opts.demo);
  return tryBackend("/api/verify/speaker", { method: "POST", body: fd }, async () => {
    await delay(800);
    return { similarity: 91.8, match: true, mock: true };
  });
}

export async function analyzeContext(transcript, metadata = {}) {
  if (!BACKEND) {
    await delay(400);
    return { risk: 30, indicators: ["Mock context"], mock: true };
  }
  return tryBackend("/api/analyze/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, metadata }),
  }, async () => {
    await delay(400);
    return { risk: 30, indicators: ["Mock context"], mock: true };
  });
}

export async function analyzeFull(file, { transcript = "", caller = "Unknown Caller", speakerId = "SPK-001", demo = "" } = {}) {
  const fd = new FormData();
  fd.append("audio", file);
  fd.append("transcript", transcript);
  fd.append("caller", caller);
  fd.append("speakerId", speakerId);
  if (demo) fd.append("demo", demo);
  return tryBackend("/api/analyze/full", { method: "POST", body: fd }, async () => {
    await delay(800);
    return { mock: true, risk: { score: 92, level: "CRITICAL", decision: "BLOCKED" } };
  });
}

// ---- Spec backend: voice analysis, simulated live calls, logs ----
// POST /api/analyze-voice (multipart audio) -> scores + timeline + report.
// Falls back to mock when the backend is absent so the UI never breaks.
export async function analyzeVoice(file, opts = {}) {
  if (!BACKEND) {
    await delay(1200);
    return {
      session_id: "MOCK", label: "suspicious", level: "MEDIUM",
      ai_probability: 68, genuine_probability: 32,
      fingerprint_match: false, similarity: 58,
      scores: { ai_probability: 68, speaker_similarity: 58, risk_score: 59 },
      timeline: Array.from({ length: 40 }, (_, i) => Math.round(60 + Math.sin(i / 3) * 8)),
      report: { title: "MEDIUM RISK — Unverified Voice Report", level: "MEDIUM", text: "Mock report (no backend).", recommendation: "CHALLENGE" },
      mock: true,
    };
  }
  const fd = new FormData();
  fd.append("audio", file);
  fd.append("speaker_id", opts.speakerId || "SPK-001");
  if (opts.demo) fd.append("demo", opts.demo);
  return tryBackend("/api/analyze-voice", { method: "POST", body: fd }, async () => {
    await delay(800);
    return { mock: true, label: "suspicious", ai_probability: 68, timeline: [] };
  }, 90000); // cold ECAPA load can take ~30s on first call
}

export async function simulateLiveCall(sample = "") {
  if (!BACKEND) {
    await delay(500);
    return { session_id: "MOCK", sample: sample || "mock-sample", status: "processing", mock: true };
  }
  const fd = new FormData();
  if (sample) fd.append("sample", sample);
  return tryBackend("/api/simulate-live-call", { method: "POST", body: fd }, async () => ({
    session_id: "MOCK", status: "processing", mock: true,
  }));
}

export async function fetchSession(sessionId) {
  if (!BACKEND || sessionId === "MOCK") {
    await delay(900);
    return {
      session_id: "MOCK", status: "complete", progress: 100, mock: true,
      result: {
        label: "synthetic", level: "HIGH", ai_probability: 89.5,
        genuine_probability: 10.5, fingerprint_match: false, similarity: 70.3,
        scores: { ai_probability: 89.5, speaker_similarity: 70.3, risk_score: 82 },
        timeline: Array.from({ length: 40 }, (_, i) => Math.round(85 + Math.sin(i / 3) * 6)),
        report: { title: "HIGH RISK — Likely Bot / Cloned Voice Report", level: "HIGH", text: "Mock report (no backend connected).", recommendation: "BLOCK" },
      },
    };
  }
  return tryBackend(`/api/session/${sessionId}`, undefined, async () => ({
    session_id: sessionId, status: "processing", progress: 50, mock: true,
  }));
}

export async function fetchSamples() {
  if (!BACKEND) return [];
  return tryBackend("/api/samples", undefined, async () => []);
}

export async function fetchSpeakers() {
  if (!BACKEND) {
    await delay();
    return [{ id: "SPK-001", name: "Rahul Sharma", threshold: 75, samples: 0, enrolled: false }];
  }
  return tryBackend("/api/speakers", undefined, async () => []);
}

export async function enrollSpeaker(files, speakerId = "SPK-001", name = "") {
  if (!BACKEND) {
    await delay(1200);
    return { speaker_id: speakerId, name, samples: files.length, enrolled: true, mock: true };
  }
  const fd = new FormData();
  fd.append("speaker_id", speakerId);
  fd.append("name", name);
  [...files].slice(0, 5).forEach((f) => fd.append("files", f));
  return tryBackend("/api/speakers/enroll", { method: "POST", body: fd }, async () => {
    await delay(800);
    return { speaker_id: speakerId, enrolled: false, mock: true };
  }, 90000); // embedding up to 5 clips + possible cold model load
}

export async function fetchLogs(limit = 50) {
  if (!BACKEND) {
    await delay();
    return [];
  }
  return tryBackend(`/api/logs?limit=${limit}`, undefined, async () => []);
}

// Legacy mock used by older code paths — kept for compatibility.
export async function analyzeAudioMock() {
  await delay(800);
  return { label: "synthetic", confidence: 94.2 };
}
