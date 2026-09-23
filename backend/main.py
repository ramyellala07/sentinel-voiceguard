"""Sentinel backend — spec build: uploads + /api/analyze-voice + Supabase logs
+ Simulate-Live-Call + pre-made reports. No sockets, no live Twilio, no Ollama.

Run (from voiceguard-ai/backend):
    pip install -r requirements.txt
    uvicorn main:app --port 5000 --reload

Frontend polling pattern for Simulate Live Call:
    POST /api/simulate-live-call -> { session_id }   (spinner starts)
    GET  /api/session/{id} every 1s                  (progress bar)
    status == "complete" -> render result.scores + result.timeline in Chart.js
"""
import asyncio
import os
import random
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import analysis
import config
import db_supabase
import models
from analysis import SAMPLE_DIR, UPLOAD_DIR
from contextlib import asynccontextmanager
from routers import dashboard as dashboard_router
from store import get_session, get_store, new_session

os.makedirs(UPLOAD_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app):
    # All model warmups run in BACKGROUND: a throttled model download must
    # never block port binding. First requests pay cold-load cost instead
    # (covered by the frontend's 90 s analysis timeout), everything after is fast.
    async def _warm(name, fn, ok_msg, skip_msg):
        try:
            await asyncio.to_thread(fn)
            print(f"  [models] {ok_msg}")
        except Exception as e:  # noqa: BLE001 — lazy load per request covers
            print(f"  [models] {skip_msg} ({e})")
    asyncio.create_task(_warm("ecapa", models._get_encoder,
                              "ECAPA encoder warmed", "ECAPA warmup skipped"))
    asyncio.create_task(_warm("spoof", models._get_spoof,
                              "spoof scorer warmed", "spoof warmup skipped"))
    asyncio.create_task(_warm("transcriber", models._get_transcriber,
                              "transcriber warmed", "transcriber warmup skipped"))
    try:
        cleaned = await asyncio.to_thread(_retention_cleanup)
        if cleaned:
            print(f"  [uploads] retention cleanup removed {cleaned} file(s) >7d old")
    except Exception as e:  # noqa: BLE001 — cleanup is best-effort
        print(f"  [uploads] cleanup skipped ({e})")
    yield


def _retention_cleanup(max_age_days: int = 7) -> int:
    """Delete uploaded wavs older than max_age_days. Returns count removed."""
    import time

    cutoff = time.time() - max_age_days * 86400
    removed = 0
    for f in os.listdir(UPLOAD_DIR):
        p = os.path.join(UPLOAD_DIR, f)
        if f == ".gitkeep" or not os.path.isfile(p):
            continue
        if os.path.getmtime(p) < cutoff:
            try:
                os.remove(p)
                removed += 1
            except OSError:
                pass
    return removed


def _assert_valid_wav(blob: bytes) -> None:
    """Reject corrupt/empty WAV content (extension alone proves nothing)."""
    import io
    import wave

    try:
        with wave.open(io.BytesIO(bytes(blob)), "rb") as w:
            if w.getnframes() <= 0 or w.getsampwidth() not in (1, 2):
                raise ValueError("empty or unsupported WAV")
    except Exception:
        raise HTTPException(400, "Invalid WAV content — upload a real 16-bit PCM .wav")


app = FastAPI(title="Sentinel backend (uploads + analyze-voice + Supabase logs)",
              lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # Local dev: allow localhost AND 127.0.0.1 on any port — browsers treat
    # them as different origins, and a mismatch means silent "unreachable".
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    # Production: FRONTEND_URL points at the deployed Vercel origin, e.g.
    # https://voiceguard-ai.vercel.app (no trailing slash — CORS compares
    # origins literally).
    allow_origins=[config.FRONTEND_URL],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
# NOTE: FastAPI 0.141's include_router() silently drops APIRouter routes, so
# register by direct append (APIRoute objects are self-contained for serving).
app.router.routes.extend(dashboard_router.router.routes)

MAX_BYTES = 15 * 1024 * 1024


@app.get("/")
def root():
    return {"service": "sentinel-backend", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health")
async def health():
    store = await get_store()
    out = {"status": "ok", "service": "sentinel-backend",
           "store": getattr(store, "kind", "memory"),
           "samples": len(await analysis.list_samples()),
           "supabase_configured": db_supabase.is_configured(),
           "groq_configured": bool(config.GROQ_API_KEY)}
    if db_supabase.is_configured():
        try:
            db_supabase.get_supabase().table("reports").select(
                "key", count="exact").limit(1).execute()
            out["supabase_reachable"] = True
        except Exception as e:  # noqa: BLE001 — health reports, not crashes
            out["supabase_reachable"] = False
            out["supabase_error"] = str(e)[:200]
    return out


# ------------------------------------------------------- core spec ---
@app.post("/api/analyze-voice")
async def analyze_voice(audio: UploadFile = File(...),
                        speaker_id: str = Form("auto"),
                        demo: str = Form(""),
                        transcript: str = Form("")):
    """AI Trigger Endpoint: audio in -> Wav2Vec2 + ECAPA scores + report out.

    speaker_id: enrolled ID for 1:1 verification, or "auto" (default) for 1:N
    identification — no name needed, returns identified_as + ranking.
    transcript: optional caller-supplied text; otherwise faster-whisper
    transcribes the clip and multilingual scam-pattern scoring runs on it.
    """
    blob = await audio.read()
    if not blob:
        raise HTTPException(400, "Empty audio file.")
    if len(blob) > MAX_BYTES:
        raise HTTPException(413, "Audio too large (max 15 MB).")
    session_id = uuid.uuid4().hex[:12]
    ext = os.path.splitext(audio.filename or "")[1].lower() or ".wav"
    if ext == ".wav":
        _assert_valid_wav(blob)
    filename = f"{session_id}{ext if ext in ('.wav', '.mp3', '.webm', '.ogg') else '.wav'}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(blob)
    # Mirror to Supabase Storage; playback prefers the signed URL so the
    # frontend streams from Supabase. Disk copy stays as offline fallback.
    audio_url = f"/uploads/{filename}"
    try:
        import storage as storage_svc

        await asyncio.to_thread(storage_svc.upload_clip, filename, blob,
                                audio.content_type or "audio/wav")
        signed = await asyncio.to_thread(storage_svc.playback_url,
                                         storage_svc.UPLOADS_BUCKET, filename)
        if signed:
            audio_url = signed
    except Exception:  # noqa: BLE001 — offline? local /uploads URL still works
        pass
    result = await analysis.run_analysis(blob, filename, session_id, speaker_id,
                                           demo, transcript)
    result["audio_url"] = audio_url
    return result


@app.get("/api/logs")
async def logs(limit: int = 50):
    """Supabase log entries: session_id, timestamp, ai_confidence, fingerprint_match."""
    return await (await get_store()).recent_logs(min(limit, 200))


@app.get("/api/reports")
async def reports_list():
    import reports as r

    store = await get_store()
    return [await store.get_report(t["key"]) for t in r.TEMPLATES]


# ------------------------------------------------------- speakers ---
@app.get("/api/speakers")
async def speakers():
    """Enrolled speakers (public view — vectors never leave the backend)."""
    return await (await get_store()).list_speakers()


@app.post("/api/speakers/enroll", status_code=201)
async def enroll_speaker(speaker_id: str = Form(...), name: str = Form(""),
                         files: list[UploadFile] = File(...)):
    """Enroll a voiceprint: 1-5 WAV clips -> mean 192-d ECAPA vector in Supabase.

    Clips must be 16-bit PCM .wav >= 0.5 s.
    """
    if not speaker_id.strip():
        raise HTTPException(400, "speaker_id is required")
    if not 1 <= len(files) <= 5:
        raise HTTPException(400, "send 1-5 enrollment clips")
    vecs = []
    for f in files:
        blob = await f.read()
        if not blob:
            continue
        try:
            vecs.append(await asyncio.to_thread(models.embed_clip, blob))
        except Exception as e:  # noqa: BLE001 — report which clip failed
            raise HTTPException(400, f"clip '{f.filename}' rejected: {e}")
    if not vecs:
        raise HTTPException(400, "no usable audio received")
    store = await get_store()
    spk = await store.save_speaker(speaker_id.strip(), name.strip(),
                                   models.mean_embedding(vecs), len(vecs))
    return {"speaker_id": spk["id"], "name": spk.get("name"),
            "samples": spk.get("samples"), "enrolled": True,
            "enrolled_on": spk.get("enrolled_on")}


# ------------------------------------------------- simulate live call ---
@app.get("/api/samples")
async def samples():
    return await analysis.list_samples()


@app.post("/api/simulate-live-call")
async def simulate_live_call(sample: str = Form("")):
    """Mock Twilio: run a pre-saved sample as if it were a live call.

    sample: exact file name, or "" / "random" / "auto" for a surprise pick.
    Default is random so repeated clicks don't replay the same call.
    """
    available = [s["file"] for s in await analysis.list_samples()]
    if not available:
        raise HTTPException(404, "No samples in backend/samples/. Add .wav files first.")
    if sample in available:
        pick = sample
    elif (sample or "").lower() in ("", "random", "auto"):
        pick = random.choice(available)
    else:
        pick = available[0]
    sess = new_session(pick)
    sess["scenario"] = analysis.scenario_for(pick)
    asyncio.create_task(analysis.simulate_session(sess["session_id"]))
    return {"session_id": sess["session_id"], "sample": pick,
            "status": "processing", "scenario": sess["scenario"],
            "poll": f"/api/session/{sess['session_id']}"}


@app.get("/api/session/{session_id}")
def session_status(session_id: str):
    sess = get_session(session_id)
    if not sess:
        raise HTTPException(404, "Unknown session id")
    return sess


@app.get("/uploads/{filename}")
def download_upload(filename: str):
    path = os.path.join(UPLOAD_DIR, os.path.basename(filename))
    if not os.path.isfile(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
