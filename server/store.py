"""Storage layer — ONE async interface, two engines.

- MONGO_URI set + reachable  -> MongoStore (persistent, motor/asyncio)
- otherwise                  -> MemoryStore (seed demo data, resets on restart)

Routers/sockets only use the functions below, so swapping engines (or adding
Postgres later) never touches route code. Enrollments (ECAPA 192-d vectors),
calls, incidents and events all live here.
"""
import config
from seed_data import now_time, seed_state

_store = None


# ---------------------------------------------------------------- memory ---
class MemoryStore:
    kind = "memory"

    def __init__(self):
        self.s = seed_state()

    async def stats(self):
        return self.s["stats"]

    async def recent_events(self, limit: int = 100):
        return self.s["events"][:limit]

    async def incidents(self, limit: int = 200):
        return self.s["incidents"][:limit]

    async def models(self):
        return self.s["models"]

    async def threat(self):
        return self.s["threat"]

    async def save_threat(self, patch: dict):
        self.s["threat"].update(patch)
        return self.s["threat"]

    async def speakers(self):
        return list(self.s["speakers"].values())

    async def speaker(self, speaker_id: str):
        return self.s["speakers"].get(speaker_id)

    async def save_speaker_embedding(self, speaker_id: str, embedding: list):
        if speaker_id in self.s["speakers"]:
            self.s["speakers"][speaker_id]["embedding"] = embedding
        return self.s["speakers"].get(speaker_id)

    async def push_event(self, e: dict):
        self.s["counters"]["evt"] += 1
        row = {"id": f"EVT-{self.s['counters']['evt']}", "time": now_time(),
               "status": "SAFE", **e}
        self.s["events"].insert(0, row)
        self.s["events"] = self.s["events"][:100]
        return row

    async def push_incident(self, i: dict):
        from datetime import datetime

        self.s["counters"]["inc"] += 1
        year = datetime.now().year
        row = {"time": now_time(), "status": "Under Review", **i}
        if not row.get("id"):
            row["id"] = f"INC-{year}-{self.s['counters']['inc']:04d}"
        self.s["incidents"].insert(0, row)
        self.s["incidents"] = self.s["incidents"][:200]
        self.s["stats"]["threatsDetected"] += 1
        if (row.get("risk") or 0) >= 70:
            self.s["stats"]["highRiskEvents"] += 1
        return row

    async def update_incident(self, incident_id: str, patch: dict):
        for inc in self.s["incidents"]:
            if inc["id"] == incident_id:
                inc.update(patch)
                return inc
        return None

    def challenge_phrase(self):
        import random

        return random.choice(self.s["challenge_phrases"])


# ----------------------------------------------------------------- mongo ---
class MongoStore:
    kind = "mongodb"

    def __init__(self, db):
        self.db = db

    async def stats(self):
        doc = await self.db.meta.find_one({"_id": "stats"})
        return doc["value"] if doc else (await MemoryStore().stats())

    async def recent_events(self, limit=100):
        return [self._clean(d) async for d in
                self.db.events.find().sort("_ts", -1).limit(limit)]

    async def incidents(self, limit=200):
        return [self._clean(d) async for d in
                self.db.incidents.find().sort("_ts", -1).limit(limit)]

    async def models(self):
        doc = await self.db.meta.find_one({"_id": "models"})
        return doc["value"] if doc else []

    async def threat(self):
        doc = await self.db.meta.find_one({"_id": "threat"})
        return doc["value"] if doc else {}

    async def save_threat(self, patch: dict):
        t = await self.threat()
        t.update(patch)
        await self.db.meta.update_one({"_id": "threat"}, {"$set": {"value": t}})
        return t

    async def speakers(self):
        return [self._clean(d) async for d in self.db.speakers.find()]

    async def speaker(self, speaker_id: str):
        d = await self.db.speakers.find_one({"id": speaker_id})
        return self._clean(d) if d else None

    async def save_speaker_embedding(self, speaker_id: str, embedding: list):
        await self.db.speakers.update_one({"id": speaker_id},
                                          {"$set": {"embedding": embedding}})
        return await self.speaker(speaker_id)

    async def push_event(self, e: dict):
        from datetime import datetime, timezone

        count = await self.db.events.count_documents({})
        row = {"id": f"EVT-{9842 + count + 1}", "time": now_time(),
               "status": "SAFE", "_ts": datetime.now(timezone.utc), **e}
        await self.db.events.insert_one(row)
        return self._clean(row)

    async def push_incident(self, i: dict):
        from datetime import datetime, timezone

        count = await self.db.incidents.count_documents({})
        year = datetime.now().year
        row = {"time": now_time(), "status": "Under Review",
               "_ts": datetime.now(timezone.utc),
               **i, "id": i.get("id") or f"INC-{year}-{414 + count + 1:04d}"}
        await self.db.incidents.insert_one(row)
        await self.db.meta.update_one({"_id": "stats"}, {"$inc": {
            "value.threatsDetected": 1,
            "value.highRiskEvents": 1 if (row.get("risk") or 0) >= 70 else 0}})
        return self._clean(row)

    async def update_incident(self, incident_id: str, patch: dict):
        await self.db.incidents.update_one({"id": incident_id}, {"$set": patch})
        d = await self.db.incidents.find_one({"id": incident_id})
        return self._clean(d) if d else None

    def challenge_phrase(self):
        import random

        return random.choice(["Blue river seven nine", "Seven three nine one",
                              "Crimson falcon forty two"])

    @staticmethod
    def _clean(d: dict):
        d = dict(d)
        d.pop("_id", None)
        d.pop("_ts", None)
        return d


async def _seed_mongo(db):
    """First run: copy demo seed into empty collections + create indexes."""
    s = seed_state()
    if await db.meta.count_documents({}) == 0:
        await db.meta.insert_many([
            {"_id": "stats", "value": s["stats"]},
            {"_id": "models", "value": s["models"]},
            {"_id": "threat", "value": s["threat"]},
        ])
    if await db.speakers.count_documents({}) == 0:
        await db.speakers.insert_many(list(s["speakers"].values()))
    if await db.events.count_documents({}) == 0:
        await db.events.insert_many([{**e} for e in s["events"]])
    if await db.incidents.count_documents({}) == 0:
        await db.incidents.insert_many([{**i} for i in s["incidents"]])
    await db.events.create_index("id", unique=True)
    await db.incidents.create_index("id", unique=True)
    await db.speakers.create_index("id", unique=True)


async def get_store():
    """Singleton. Tries Mongo (2s timeout), falls back to memory with a warning."""
    global _store
    if _store is not None:
        return _store
    if config.MONGO_URI:
        try:
            from motor.motor_asyncio import AsyncIOMotorClient

            client = AsyncIOMotorClient(config.MONGO_URI, serverSelectionTimeoutMS=2000)
            await client.admin.command("ping")
            db = client[config.MONGO_DB]
            await _seed_mongo(db)
            _store = MongoStore(db)
            print(f"  [store] MongoDB connected ({config.MONGO_DB})")
            return _store
        except Exception as e:  # noqa: BLE001 — fallback is the point
            print(f"  [store] Mongo unreachable ({e}) — using in-memory store.")
    else:
        print("  [store] MONGO_URI not set — using in-memory store.")
    _store = MemoryStore()
    return _store
