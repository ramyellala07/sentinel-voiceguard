# Sentinel backend — FastAPI + MongoDB

Drop-in replacement for `../backend/` (Node). Same REST paths, same Socket.IO event names — the React frontend needs **no changes**.

## Quick start (works without Mongo)

```powershell
cd server
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:socket_app --port 5000 --reload
# health: http://localhost:5000/api/health
# docs:   http://localhost:5000/docs   (interactive Postman alternative)
```

> Stop the Node backend first — both default to port 5000.

## Going persistent with MongoDB (2 options)

**A. Atlas cloud (recommended, free):**
1. Create a free cluster at cloud.mongodb.com → Database Access (user+password) → Network Access (allow your IP).
2. Connect → copy the `mongodb+srv://...` string.
3. Put it in `server/.env`: `MONGO_URI=mongodb+srv://user:pass@cluster.../sentinel`
4. Restart — first boot auto-seeds demo data + creates indexes.

**B. Local MongoDB:** install Community Server → `MONGO_URI=mongodb://localhost:27017`.

Without `MONGO_URI` the server runs in **memory mode** (same demo data, resets on restart) and says so in `/api/health` (`"store": "memory"` vs `"mongodb"`).

## Collections

| Collection | Holds |
|---|---|
| `speakers` | id, name, threshold, `embedding` (192 floats once ECAPA enrols) |
| `events` | live detection log rows |
| `incidents` | investigations + statuses |
| `meta` | `_id: stats/models/threat` singletons |

## API map (mirrors Node backend)

- `GET /api/health`, `/api/dashboard/stats`, `/api/events/recent`, `/api/incidents`, `POST /api/incidents`, `/api/models/performance`, `/api/threats/current`, `/api/speakers`, `/api/settings`
- `POST /api/analyze/clone | /api/verify/speaker | /api/analyze/context | /api/analyze/full | /api/challenge/verify` (`?demo=`/`demo` field forces genuine/suspicious/synthetic)
- `POST /api/twilio/token`, `POST /api/twilio/voice`, `GET /api/twilio/status`, WS `/twilio-stream`
- Socket.IO: `audio_chunk` → staged `clone_analysis`/`speaker_analysis`/`context_analysis`/`risk_updated`/`challenge_required`/`threat_blocked`

## Where the real models plug in

- `services/audio.py` → XLS-R/Wav2Vec2 (clone) + ECAPA-TDNN (speaker). `save_speaker_embedding()` in `store.py` already persists 192-d vectors.
- `services/risk.py` → Llama/Ollama context scorer.
- `services/ml_client.py` → forwards to `../backend/ml-service` when `ML_SERVICE_URL` is reachable.
