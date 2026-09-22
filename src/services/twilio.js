// Twilio Voice input — PLACEHOLDER for the hackathon prototype.
//
// TODAY: no real Twilio integration. Audio is simulated by
// `src/hooks/useRecording.js` (fake timer + level meter). Every function
// below returns mock data and logs a warning, so the UI works with no
// credentials and judges can still see the full demo.
//
// TOMORROW (real Twilio wiring, 3 steps):
//   1. Backend: add POST /api/twilio/token that returns a Twilio access
//      token (use the Twilio Node SDK + your ACCOUNT_SID / API key).
//      Test it with Postman: POST {BACKEND_URL}/api/twilio/token.
//   2. Frontend: `npm install @twilio/voice-sdk`, then fill in
//      `connectTwilioCall()` below with `new Twilio.Device(token)`.
//   3. Twilio Console: point your phone number's webhook at your backend's
//      /api/twilio/voice endpoint so calls stream to your Socket.IO server,
//      which then emits voice_detected / clone_analysis / ... events.
//
// Env vars used later (see .env.example):
//   VITE_BACKEND_URL  — your backend (token endpoint + Socket.IO server)
//   VITE_TWILIO_NUMBER — your Twilio phone number (display only)

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

function warnOnce(msg) {
  console.warn(`[twilio placeholder] ${msg}`);
}

// Step 1 (later): fetch a Twilio access token from YOUR backend.
// Postman test: POST {BACKEND_URL}/api/twilio/token -> { token: "..." }
export async function fetchTwilioToken(identity = "operator-demo") {
  if (!BACKEND_URL) {
    warnOnce("VITE_BACKEND_URL not set — returning mock token. Wire POST /api/twilio/token later.");
    return { token: "MOCK_TOKEN", identity, mock: true };
  }
  const res = await fetch(`${BACKEND_URL}/api/twilio/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity }),
  });
  if (!res.ok) throw new Error(`token endpoint failed: ${res.status}`);
  return res.json(); // expected: { token }
}

// Step 2 (later): join a live Twilio voice call from the browser.
// Requires: npm install @twilio/voice-sdk
export async function connectTwilioCall() {
  warnOnce("connectTwilioCall() is a stub — install @twilio/voice-sdk and implement Device setup.");
  return { status: "mock-connected", mock: true };
}

// Step 3 (later): disconnect the Twilio call.
export async function disconnectTwilioCall() {
  warnOnce("disconnectTwilioCall() is a stub — nothing to hang up in mock mode.");
  return { status: "mock-disconnected", mock: true };
}

// Where live Twilio audio goes once wired: Twilio Media Stream ->
// backend -> Socket.IO "audio_chunk" events -> see sendAudioChunk() in socket.js.
export const TWILIO_STATUS = {
  mode: BACKEND_URL ? "ready-to-wire" : "mock",
  backendUrl: BACKEND_URL || "(not set — see .env.example)",
};

export default { fetchTwilioToken, connectTwilioCall, disconnectTwilioCall, TWILIO_STATUS };
