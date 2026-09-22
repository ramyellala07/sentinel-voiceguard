"""Dashboard + SOC read/write APIs — everything the overview pages render."""
from fastapi import APIRouter, HTTPException

from store import get_store

router = APIRouter()


@router.get("/api/dashboard/stats")
async def stats():
    return await (await get_store()).dashboard_stats()


@router.get("/api/dashboard/timeline")
async def timeline(buckets: int = 12):
    return await (await get_store()).threat_timeline(min(max(buckets, 4), 24))


@router.get("/api/dashboard/distribution")
async def distribution():
    return await (await get_store()).risk_distribution()


@router.get("/api/events/recent")
async def events(limit: int = 50):
    return await (await get_store()).list_events(min(limit, 200))


@router.get("/api/incidents")
async def incidents(limit: int = 200):
    return await (await get_store()).list_incidents(min(limit, 500))


@router.post("/api/incidents", status_code=201)
async def create_incident(body: dict):
    return await (await get_store()).create_incident(body or {})


@router.patch("/api/incidents/{code}")
async def update_incident(code: str, body: dict):
    inc = await (await get_store()).update_incident(code, body or {})
    if not inc:
        raise HTTPException(404, "Incident not found")
    return inc


@router.get("/api/models/performance")
async def models():
    return await (await get_store()).model_perf()


@router.get("/api/threats/latest")
async def latest_threat():
    t = await (await get_store()).latest_threat()
    if not t:
        raise HTTPException(404, "No events recorded yet")
    return t
