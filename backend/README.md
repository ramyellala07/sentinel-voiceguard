# Sentinel backend — spec build

FastAPI backend implementing the team spec: **uploads, `/api/analyze-voice`, Chart.js numbers, Supabase logs, Simulate-Live-Call, pre-made reports.** No sockets, no live Twilio, no Ollama — deliberate hackathon shortcuts.

## Run

```powershell
cd backend
pip install -r requirements.txt
uvicorn main:app --port 5000 --reload
# docs: http://localhost:5000/docs
```

> Stop anything else on port 5000 first. Without Supabase keys it runs on memory fallback (logs reset on restart).

## Database (Supabase = Postgres + Storage)

1. Supabase → new project → SQL Editor → run `schema.sql` (`logs`, `reports`, `incidents`, `events`, `speakers`).
2. Storage → create private buckets `audio-samples` + `user-uploads`.
3. Seed the samples once: `python seed_storage.py` (safe to re-run — upsert).
4. Project Settings → API → paste `Project URL` + `service_role` key into `.env`.
5. Restart → `/api/health` shows `"store": "supabase"`.

Offline safety: keys/Storage unreachable → disk + memory fallback, same API shapes.

## Endpoints (the spec, mapped)

| Spec item | Endpoint |
|---|---|
| Audio upload & storage | `POST /api/analyze-voice` (multipart `audio`) → saved to `uploads/{session}.wav`, served at `/uploads/...` |
| AI trigger | same call → real ECAPA-TDNN + heuristic spoof score, returns `ai_probability`, `similarity`, `fingerprint_match` |
| Dynamic Chart.js | response includes `scores` (doughnut/bar) + `timeline` (40 real per-frame points for the line chart) |
| Supabase logs | `GET /api/logs` → `{session_id, timestamp, ai_confidence, fingerprint_match, ...}` |
| Simulate Live Call | `POST /api/simulate-live-call` → `{session_id}` instantly; `GET /api/session/{id}` polls `processing → complete` |
| Pre-made reports | `GET /api/reports` → Safe / Medium / High templates; analysis auto-attaches the matching one |
| Dashboard + SOC | `GET /api/dashboard/stats|timeline|distribution`, `/api/events/recent`, `/api/incidents` (+POST/PATCH), `/api/models/performance` — seeded demo base, live analyses prepend |
| Samples | `GET /api/samples` lists `samples/*.wav` (generate with `python samples_gen.py`) |
| Enrollment | `POST /api/speakers/enroll` (1–5 WAV clips → 192-d ECAPA print in `speakers`), `GET /api/speakers` (enrolled status, no vectors). Frontend also offers in-browser mic enrollment (3×5 s, auto-converted). |
| Auto-identify | `speaker_id: "auto"` (default) → 1:N ranking across all prints → `identified_as` + `all_scores`, or UNKNOWN below threshold |

`?demo=genuine|suspicious|synthetic` (form field `demo`) forces a result path for rehearsed demos.

## Swapping in real models

ECAPA-TDNN is real (`speechbrain/spkrec-ecapa-voxceleb`) and the spoof scorer is
real W2V2-AASIST (XLS-R 300M + AASIST, ONNX). Both run on **GPU when available**
(Quadro-tested: ECAPA ~6s cold load, AASIST ~9s, full analysis ~5s round-trip)
with automatic CPU fallback. Setup for a fresh NVIDIA machine:

```powershell
pip install torch torchaudio              # default index = CUDA build
pip install onnxruntime-gpu               # NOT onnxruntime (they conflict)
```

CPU-only machines: torch from `https://download.pytorch.org/whl/cpu` and plain
`onnxruntime` instead — code auto-falls-back, no changes needed. Enrollment clips must be 16-bit PCM `.wav`; mic audio is converted to 16 kHz WAV in the browser (`src/services/audio.js`). Spoof model override:
`SPOOF_MODEL` env (default `SpeechAntiSpoofingBenchmarks/W2V2-AASIST`).

## Transcription + context (real, not placeholder)

Every WAV analysis is transcribed with faster-whisper (base, CPU/int8 — the
GPU cublas DLLs are absent on this laptop, CPU does a 6 s clip in ~3 s) and
scored by the multilingual keyword engine (`services/risk.py`: English, Hindi
+ Telugu, transliterated + native script). Response carries `transcript` +
`transcript_language`; scam text (urgency + financial + secrecy) scores ~70+,
routine speech ~8. Caller-supplied `transcript` form field skips STT.
`WHISPER_DEVICE=cuda` opts into GPU if the libs ever land.

## Voice-cue layer (prosody + impersonation + call-time)

`services/prosody.py` (pure numpy): pitch tracking (autocorrelation F0),
energy-VAD pause segmentation, breath-burst detection, speech rate. Flags flat
pitch, missing breathing, machine-regular pauses as authenticity cues —
reported separately (`voice_cues`), fused formula untouched.
`services/risk.py` adds credential/device-access keyword sets (EN+HI+TE),
claimed-identity extraction with ECAPA cross-check (claim without match =
impersonation alert), and IST call-time risk. Shown in UI voice-cues grid.

## Cloud-LLM reports (Groq, optional)

Set `GROQ_API_KEY` (+ optional `GROQ_MODEL`, default llama-3.3-70b-versatile)
from console.groq.com. Each analysis then also requests a six-block analyst
report (verdict, metadata, per-domain findings, reasoning trace with fusion
weights, recommendations, limitations); UI badges GENERATED LIVE vs TEMPLATE.
No key / offline / rate-limit → template serves instantly. Nothing breaks.

## Operator auth (Supabase Auth, backend-owned)

No anonymous access: every `/api/*` route (except health/docs/auth/uploads)
requires `Authorization: Bearer <JWT>`. Flow: `POST /api/auth/login`
(email+password) → token in localStorage → sent on all calls → 401 bounces
to the login gate (never masked by mock data). Users are created in Supabase
Dashboard → Authentication → Users (no public signup by design). Frontend
holds zero Supabase keys.

## Hardening (active)

- Uploads: 15 MB cap, empty-file rejection, WAV content validated by header
  (extension alone proves nothing) — corrupt files get HTTP 400, never a crash.
- Retention: `uploads/*.wav` older than 7 days are deleted at every boot.
- Enrollment rejects non-WAV/short clips per file with a named error.

## Files

`main.py` (routes) · `analysis.py` (pipeline) · `models.py` (AI stand-ins) · `store.py` (Supabase logs/reports + memory fallback) · `db_supabase.py` (client) · `reports.py` (3 templates) · `schema.sql` (tables) · `config.py` · `samples_gen.py` · `samples/` · `uploads/`
