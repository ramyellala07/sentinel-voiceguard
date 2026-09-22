// Real-time layer.
//
// TODAY (hackathon demo): `mockSocket` simulates all backend events in the
// browser — no server needed. Pages only use mockSocket.on()/emit(), so the
// UI does not change when a real backend arrives.
//
// TOMORROW (real backend): call `connectBackendSocket(url)` once at startup.
// It opens a real socket.io connection and forwards these backend events
// into the same local listeners pages already use:
//   voice_detected, audio_processed, clone_analysis, speaker_analysis,
//   context_analysis, risk_updated, challenge_required, threat_blocked
//
// Backend contract (for your backend teammate / Postman testing):
//   Server -> client emits one of SOCKET_EVENTS with a JSON payload.
//   Client -> server emits "audio_chunk" { base64 } or "challenge_response".

import { io } from "socket.io-client";
import { attackSimulationScript } from "../data/mockData";

const listeners = {};

function on(event, cb) {
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(cb);
  return () => listeners[event]?.delete(cb);
}

function emitLocal(event, payload) {
  (listeners[event] || []).forEach((cb) => {
    try { cb(payload); } catch (e) { console.error("socket listener error", e); }
  });
  (listeners["*"] || []).forEach((cb) => {
    try { cb(event, payload); } catch (e) { console.error("socket listener error", e); }
  });
}

let simulationTimers = [];
let simulating = false;

function runAttackSimulation(onStep) {
  stopSimulation();
  simulating = true;
  emitLocal("simulation_started", { at: Date.now() });
  let elapsed = 0;
  attackSimulationScript.forEach((step, i) => {
    elapsed += step.delay;
    const t = setTimeout(() => {
      emitLocal(step.event, { ...step.payload, stepIndex: i });
      onStep?.(step.event, step.payload);
      if (i === attackSimulationScript.length - 1) simulating = false;
    }, elapsed);
    simulationTimers.push(t);
  });
  return elapsed;
}

function stopSimulation() {
  simulationTimers.forEach(clearTimeout);
  simulationTimers = [];
  if (simulating) {
    simulating = false;
    emitLocal("simulation_stopped", {});
  }
}

function isSimulating() {
  return simulating;
}

export const mockSocket = {
  on,
  emit: emitLocal,
  runAttackSimulation,
  stopSimulation,
  isSimulating,
  mode: "mock", // "mock" | "live"
};

// ---- Real backend hookup (placeholder, safe to call) ----
// Usage later in main.jsx or App.jsx:
//   import { connectBackendSocket } from "./services/socket";
//   connectBackendSocket(import.meta.env.VITE_SOCKET_URL);
let liveSocket = null;

export function connectBackendSocket(url) {
  if (!url) {
    console.warn("[socket] No VITE_SOCKET_URL set — staying in mock mode.");
    return null;
  }
  if (liveSocket) return liveSocket;
  stopSimulation();
  liveSocket = io(url, { transports: ["websocket", "polling"] });
  // Forward every known backend event into local listeners.
  SOCKET_EVENTS.forEach((event) => {
    liveSocket.on(event, (payload) => emitLocal(event, payload));
  });
  liveSocket.on("connect", () => {
    mockSocket.mode = "live";
    emitLocal("backend_connected", { url });
  });
  liveSocket.on("disconnect", () => {
    mockSocket.mode = "mock";
    emitLocal("backend_disconnected", {});
  });
  return liveSocket;
}

export function disconnectBackendSocket() {
  liveSocket?.disconnect();
  liveSocket = null;
  mockSocket.mode = "mock";
}

// Send audio to the backend later (currently logs in mock mode).
export function sendAudioChunk(base64Audio, mime = "audio/webm", extra = {}) {
  if (liveSocket?.connected) {
    liveSocket.emit("audio_chunk", { audio: base64Audio, mime, ...extra });
  } else {
    console.debug("[socket mock] audio_chunk not sent — no backend connected.");
  }
}

export function sendChallengeResponse(incidentId, passed) {
  if (liveSocket?.connected) {
    liveSocket.emit("challenge_response", { incidentId, passed });
  } else {
    console.debug("[socket mock] challenge_response not sent — no backend connected.");
  }
}

export const SOCKET_EVENTS = [
  "voice_detected",
  "audio_processed",
  "clone_analysis",
  "speaker_analysis",
  "context_analysis",
  "risk_updated",
  "challenge_required",
  "challenge_failed",
  "threat_blocked",
];

export default mockSocket;
