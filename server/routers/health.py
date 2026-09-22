import time

from fastapi import APIRouter

import config
from services import ml_client
from store import get_store

router = APIRouter()
_started = time.time()


@router.get("/api/health")
async def health():
    store = await get_store()
    return {
        "status": "ok",
        "service": "sentinel-fastapi",
        "time": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat(),
        "uptimeSec": round(time.time() - _started),
        "mode": "heuristic",
        "store": getattr(store, "kind", "memory"),
        "mlService": await ml_client.health(),
        "twilio": {
            "configured": config.TWILIO["configured"],
            "voiceReady": config.TWILIO["voice_ready"],
            "mode": ("ready" if config.TWILIO["voice_ready"]
                     else "partial" if config.TWILIO["configured"] else "mock"),
        },
        "thresholds": config.THRESHOLDS,
        "stats": await store.stats(),
    }
