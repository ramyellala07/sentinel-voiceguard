from fastapi import APIRouter

import config
from store import get_store

router = APIRouter()


@router.get("/api/dashboard/stats")
async def stats():
    return await (await get_store()).stats()


@router.get("/api/events/recent")
async def events():
    return await (await get_store()).recent_events()


@router.get("/api/incidents")
async def incidents():
    return await (await get_store()).incidents()


@router.post("/api/incidents", status_code=201)
async def create_incident(body: dict):
    store = await get_store()
    return await store.push_incident({
        "type": body.get("type", "Manual"),
        "caller": body.get("caller", "Unknown"),
        "risk": int(body.get("risk", 50)),
        "method": body.get("method", "Operator"),
        "action": body.get("action", "Logged"),
        **({"status": body["status"]} if body.get("status") else {}),
    })


@router.get("/api/models/performance")
async def models():
    return await (await get_store()).models()


@router.get("/api/threats/current")
async def threat_current():
    return await (await get_store()).threat()


@router.get("/api/threats/{threat_id}")
async def threat_by_id(threat_id: str):
    t = dict(await (await get_store()).threat())
    t["threatId"] = threat_id
    return t


@router.get("/api/speakers")
async def speakers():
    return await (await get_store()).speakers()


@router.get("/api/settings")
async def settings():
    return dict(config.THRESHOLDS)
