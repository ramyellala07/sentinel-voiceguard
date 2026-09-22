"""Hybrid seam to the Python ML microservice (../backend/ml-service/app.py).

If ML_SERVICE_URL answers, its scores win (ml_used=True). Otherwise None is
returned and routers fall back to services.audio / services.risk.
Contract (keep in sync with ml-service/app.py):
  POST {ML}/ml/clone   multipart(audio)            -> {synth_score,label,confidence}
  POST {ML}/ml/verify  multipart(audio)+speaker_id -> {similarity,match}
  POST {ML}/ml/context json{transcript,metadata}    -> {risk,indicators}
"""
import config

TIMEOUT = 6.0


def _client():
    import httpx

    # Short connect timeout: a dead ML service must not slow live streaming.
    return httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=1.5))


def enabled() -> bool:
    return bool(config.ML_SERVICE_URL)


async def health() -> dict:
    if not enabled():
        return {"configured": False, "online": False}
    try:
        async with _client() as c:
            r = await c.get(f"{config.ML_SERVICE_URL}/health", timeout=3.0)
            return {"configured": True, "online": r.is_success,
                    "detail": r.json() if r.is_success else None}
    except Exception:
        return {"configured": True, "online": False}


async def try_clone(buf: bytes, filename: str, mimetype: str):
    if not enabled():
        return None
    try:
        async with _client() as c:
            r = await c.post(f"{config.ML_SERVICE_URL}/ml/clone",
                             files={"audio": (filename, buf, mimetype or "audio/wav")})
            r.raise_for_status()
            return {**r.json(), "ml_used": True}
    except Exception as e:  # noqa: BLE001 — fallback is the point
        print(f"  [ml] clone fallback to heuristic ({e})")
        return None


async def try_verify(buf: bytes, filename: str, mimetype: str, speaker_id: str):
    if not enabled():
        return None
    try:
        async with _client() as c:
            r = await c.post(f"{config.ML_SERVICE_URL}/ml/verify",
                             files={"audio": (filename, buf, mimetype or "audio/wav")},
                             data={"speaker_id": speaker_id})
            r.raise_for_status()
            return {**r.json(), "ml_used": True}
    except Exception as e:  # noqa: BLE001
        print(f"  [ml] verify fallback to heuristic ({e})")
        return None


async def try_context(transcript: str, metadata: dict):
    if not enabled():
        return None
    try:
        async with _client() as c:
            r = await c.post(f"{config.ML_SERVICE_URL}/ml/context",
                             json={"transcript": transcript, "metadata": metadata})
            r.raise_for_status()
            return {**r.json(), "ml_used": True}
    except Exception as e:  # noqa: BLE001
        print(f"  [ml] context fallback to heuristic ({e})")
        return None
