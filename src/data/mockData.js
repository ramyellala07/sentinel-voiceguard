// ---- Site branding (edit name + tagline here) ----
export const siteConfig = {
  name: "SENTINEL VOICE",
  tagline: "REAL-TIME COMPLETE VOICE ANALYSIS",
};

// Central mock data store. Everything here is DEMO data for the hackathon prototype.
// Later: replace imports from this file with real API / Socket.IO responses.

export const dashboardStats = {
  activeCalls: 12,
  threatsDetected: 7,
  highRiskEvents: 3,
  detectionAccuracy: 96.8,
};

export const threatTimelineLabels = [
  "10:00", "10:05", "10:10", "10:15", "10:20", "10:25",
  "10:30", "10:35", "10:40", "10:45", "10:50", "10:55",
];

export const threatTimeline = {
  safe: [42, 45, 40, 48, 52, 47, 50, 44, 46, 49, 51, 48],
  suspicious: [6, 8, 5, 9, 7, 10, 8, 12, 9, 7, 6, 8],
  highRisk: [1, 2, 1, 3, 2, 2, 4, 3, 5, 2, 3, 2],
};

export const riskDistribution = {
  labels: ["Low Risk", "Medium Risk", "High Risk", "Critical"],
  values: [64, 19, 11, 6],
  colors: ["#22c55e", "#eab308", "#f97316", "#ef4444"],
};

export const recentEvents = [
  {
    id: "EVT-9841",
    time: "10:42:13",
    caller: "Unknown Caller",
    speakerMatch: "Failed",
    aiDetection: "Synthetic",
    riskScore: 92,
    context: "Financial Request",
    action: "Blocked",
    status: "CRITICAL",
  },
  {
    id: "EVT-9839",
    time: "10:39:21",
    caller: "Rahul",
    speakerMatch: "Verified",
    aiDetection: "Genuine",
    riskScore: 8,
    context: "Normal Call",
    action: "Allowed",
    status: "SAFE",
  },
  {
    id: "EVT-9835",
    time: "10:35:47",
    caller: "Unknown Caller",
    speakerMatch: "Matched",
    aiDetection: "Suspicious",
    riskScore: 74,
    context: "Urgent Transfer",
    action: "Challenge",
    status: "WARNING",
  },
  {
    id: "EVT-9831",
    time: "10:31:02",
    caller: "Priya S.",
    speakerMatch: "Verified",
    aiDetection: "Genuine",
    riskScore: 12,
    context: "Support Call",
    action: "Allowed",
    status: "SAFE",
  },
  {
    id: "EVT-9827",
    time: "10:27:55",
    caller: "Unknown Caller",
    speakerMatch: "Failed",
    aiDetection: "Synthetic",
    riskScore: 88,
    context: "OTP Request",
    action: "Blocked",
    status: "CRITICAL",
  },
];

export const pipelineStages = [
  { id: "audio-input", label: "AUDIO INPUT", model: "Mic Stream 16kHz", icon: "mic" },
  { id: "audio-processing", label: "AUDIO PROCESSING", model: "Denoise + VAD", icon: "audio" },
  { id: "clone-detection", label: "VOICE CLONE DETECTION", model: "Wav2Vec 2.0", icon: "brain" },
  { id: "speaker-verification", label: "SPEAKER VERIFICATION", model: "ECAPA-TDNN", icon: "user" },
  { id: "context-analysis", label: "CONTEXT ANALYSIS", model: "LLM Context", icon: "file" },
  { id: "risk-engine", label: "RISK ENGINE", model: "Fusion Scorer", icon: "gauge" },
  { id: "final-decision", label: "FINAL DECISION", model: "Policy Engine", icon: "shield" },
];

// Full scripted attack simulation — each step maps to a socket event name
// defined in services/socket.js
export const attackSimulationScript = [
  { event: "voice_detected", delay: 800, payload: { caller: "Unknown Caller", duration: "00:03" } },
  { event: "audio_processed", delay: 1200, payload: { snr: "21.4 dB", vad: "Speech 98%" } },
  { event: "clone_analysis", delay: 1600, payload: { result: "SYNTHETIC VOICE DETECTED", confidence: 94.2, model: "Wav2Vec 2.0" } },
  { event: "speaker_analysis", delay: 1600, payload: { result: "MATCH", similarity: 91.8, model: "ECAPA-TDNN" } },
  { event: "context_analysis", delay: 1600, payload: { result: "HIGH-RISK REQUEST", indicators: ["Urgency", "Financial request", "Unusual interaction", "Sensitive action"] } },
  { event: "risk_updated", delay: 1200, payload: { score: 92, level: "CRITICAL" } },
  { event: "challenge_required", delay: 1000, payload: { phrase: "Blue river seven nine" } },
  { event: "challenge_failed", delay: 2500, payload: { score: 18 } },
  { event: "threat_blocked", delay: 1200, payload: { incidentId: "INC-2026-0413" } },
];

export const threatDetail = {
  threatId: "THR-2026-0917",
  timestamp: "2026-09-04 10:42:13 IST",
  caller: "Unknown Caller (+91 ••• ••• 4413)",
  voiceAuthenticity: 94.2,
  speakerSimilarity: 91.8,
  contextRisk: 88,
  behavioralAnomaly: 82,
  finalRisk: 92,
  decision: "BLOCKED",
  reasons: [
    "Synthetic speech characteristics (vocoder artefacts, flat prosody)",
    "High speaker similarity — likely targeted voice clone",
    "Sensitive financial request with urgency pressure",
    "Unusual interaction pattern vs. caller history",
  ],
};

export const incidents = [
  { id: "INC-2026-0413", time: "10:42:13", type: "Voice Clone", caller: "Unknown", risk: 92, method: "Wav2Vec 2.0 + Challenge", action: "Blocked", status: "Resolved" },
  { id: "INC-2026-0411", time: "10:27:55", type: "Synthetic OTP Fraud", caller: "Unknown", risk: 88, method: "Wav2Vec 2.0", action: "Blocked", status: "Resolved" },
  { id: "INC-2026-0408", time: "10:05:19", type: "Impersonation", caller: "Spoofed Rahul", risk: 74, method: "ECAPA-TDNN + Context", action: "Challenged", status: "Under Review" },
  { id: "INC-2026-0399", time: "09:48:02", type: "Robocall Clone", caller: "Unknown", risk: 67, method: "Wav2Vec 2.0", action: "Challenged", status: "Under Review" },
  { id: "INC-2026-0395", time: "09:21:44", type: "Voice Clone", caller: "Unknown", risk: 95, method: "Full Pipeline", action: "Blocked + Alert", status: "Escalated" },
  { id: "INC-2026-0390", time: "08:57:31", type: "Normal (False Alarm)", caller: "Priya S.", risk: 22, method: "ECAPA-TDNN", action: "Allowed", status: "Closed" },
];

export const modelPerformance = [
  { name: "Voice Clone Detection", model: "Wav2Vec 2.0", accuracy: 96.8, precision: 95.4, recall: 97.1, f1: 96.2 },
  { name: "Speaker Verification", model: "ECAPA-TDNN", accuracy: 95.2, precision: 94.1, recall: 96.0, f1: 95.0 },
  { name: "Context Analysis", model: "Llama / Mistral (Ollama)", accuracy: 91.6, precision: 89.8, recall: 92.4, f1: 91.1 },
];

export const registeredSpeaker = {
  name: "Rahul Sharma",
  id: "SPK-001",
  samples: 3,
  embeddingStatus: "Ready (192-d ECAPA embedding)",
  enrolledOn: "2026-08-12",
  threshold: 75,
};

export const defaultSettings = {
  securityThreshold: 70,
  similarityThreshold: 75,
  challengeThreshold: 55,
  autoBlock: true,
  securityAlerts: true,
  apiStatus: "Online",
  socketStatus: "Connected (mock)",
  audioStatus: "Ready",
};

// Prompts the operator reads out when the model cannot fully verify a call.
// Unpredictable phrases/digits are hard for voice clones to produce on demand.
export const operatorPrompts = [
  { id: "repeat-phrase", label: "Repeat phrase", text: "Please repeat after me: Blue river seven nine." },
  { id: "say-digits", label: "Say digits", text: "Please say these digits slowly: 7 3 9 1." },
  { id: "repeat-question", label: "Repeat question", text: "Please repeat this question back to me: Why was my last transfer flagged?" },
  { id: "full-name", label: "Full name check", text: "Please say your full name slowly, then spell your surname." },
  { id: "callback", label: "Callback check", text: "For your safety, I will disconnect and call you back on your registered number." },
];
