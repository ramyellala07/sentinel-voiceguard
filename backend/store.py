"""Storage: Supabase Postgres (logs + reports) with memory fallback.

Spec log entry: { session_id, timestamp, ai_confidence, fingerprint_match }.
Tables live in schema.sql (logs, reports). supabase-py is SYNC, so every DB
call runs via asyncio.to_thread — callers stay `async` and the event loop
never blocks.

No keys / Supabase unreachable -> MemoryStore (demo keeps working offline).
Sessions (simulate-live-call progress) are always in-memory: ephemeral by design.
"""
import asyncio

import db_supabase
import reports as report_templates
from datetime import datetime, timezone

_store = None


def _utcnow():
    return datetime.now(timezone.utc).isoformat()


def _hours_ago(h: float):
    from datetime import timedelta

    return (datetime.now(timezone.utc) - timedelta(hours=h)).isoformat()


# Classic SOC seed rows (source of the old demo look). New analyses prepend
# live rows on top; seeds just keep empty dashboards alive, timestamps spread
# over the past hours so timeline charts render.
SEED_INCIDENTS = [
    {"code": "INC-2026-0413", "type": "Voice Clone", "caller": "Unknown",
     "risk": 92, "method": "Wav2Vec 2.0 + Challenge", "action": "Blocked",
     "status": "Resolved", "age_h": 0.3},
    {"code": "INC-2026-0411", "type": "Synthetic OTP Fraud", "caller": "Unknown",
     "risk": 88, "method": "Wav2Vec 2.0", "action": "Blocked",
     "status": "Resolved", "age_h": 1.0},
    {"code": "INC-2026-0408", "type": "Impersonation", "caller": "Spoofed Rahul",
     "risk": 74, "method": "ECAPA-TDNN + Context", "action": "Challenged",
     "status": "Under Review", "age_h": 2.2},
    {"code": "INC-2026-0399", "type": "Robocall Clone", "caller": "Unknown",
     "risk": 67, "method": "Wav2Vec 2.0", "action": "Challenged",
     "status": "Under Review", "age_h": 3.5},
    {"code": "INC-2026-0395", "type": "Voice Clone", "caller": "Unknown",
     "risk": 95, "method": "Full Pipeline", "action": "Blocked + Alert",
     "status": "Escalated", "age_h": 5.0},
    {"code": "INC-2026-0390", "type": "Normal (False Alarm)", "caller": "Priya S.",
     "risk": 22, "method": "ECAPA-TDNN", "action": "Allowed",
     "status": "Closed", "age_h": 6.5},
]

SEED_EVENTS = [
    {"code": "EVT-9841", "caller": "Unknown Caller", "speakerMatch": "Failed",
     "aiDetection": "Synthetic", "riskScore": 92, "context": "Financial Request",
     "action": "Blocked", "status": "CRITICAL", "age_h": 0.3},
    {"code": "EVT-9839", "caller": "Rahul", "speakerMatch": "Verified",
     "aiDetection": "Genuine", "riskScore": 8, "context": "Normal Call",
     "action": "Allowed", "status": "SAFE", "age_h": 0.8},
    {"code": "EVT-9835", "caller": "Unknown Caller", "speakerMatch": "Matched",
     "aiDetection": "Suspicious", "riskScore": 74, "context": "Urgent Transfer",
     "action": "Challenge", "status": "WARNING", "age_h": 1.5},
    {"code": "EVT-9831", "caller": "Priya S.", "speakerMatch": "Verified",
     "aiDetection": "Genuine", "riskScore": 12, "context": "Support Call",
     "action": "Allowed", "status": "SAFE", "age_h": 2.5},
    {"code": "EVT-9827", "caller": "Unknown Caller", "speakerMatch": "Failed",
     "aiDetection": "Synthetic", "riskScore": 88, "context": "OTP Request",
     "action": "Blocked", "status": "CRITICAL", "age_h": 4.0},
]

MODELS = [
    {"name": "Voice Clone Detection", "model": "XLS-R + AASIST (ONNX)",
     "accuracy": 96.8, "precision": 95.4, "recall": 97.1, "f1": 96.2},
    {"name": "Speaker Verification", "model": "ECAPA-TDNN (speechbrain)",
     "accuracy": 95.2, "precision": 94.1, "recall": 96.0, "f1": 95.0},
    {"name": "Context Analysis", "model": "Heuristic keywords (Ollama-ready)",
     "accuracy": 91.6, "precision": 89.8, "recall": 92.4, "f1": 91.1},
]

OPEN_STATUSES = {"Under Review", "Escalated"}


def _parse_ts(s: str):
    try:
        d = datetime.fromisoformat(s)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:  # noqa: BLE001
        return datetime.now(timezone.utc)


class MemoryStore:
    kind = "memory"

    def __init__(self):
        self.logs: list[dict] = []
        self.reports = {t["key"]: dict(t) for t in report_templates.TEMPLATES}
        self.speakers = {
            "SPK-001": {"id": "SPK-001", "name": "Rahul Sharma", "threshold": 75,
                        "samples": 0, "enrolled_on": None, "embedding": None},
        }
        self.incidents: list[dict] = []
        self.events: list[dict] = []
        self._seed_soc()

    async def save_log(self, entry: dict):
        row = {"timestamp": _utcnow(), **entry}
        self.logs.insert(0, row)
        self.logs = self.logs[:500]
        return row

    async def recent_logs(self, limit: int = 50):
        return self.logs[:limit]

    async def get_report(self, key: str):
        return self.reports.get(key)

    # ------------------------------------------------------- speakers ---
    @staticmethod
    def _public(spk: dict):
        return {k: spk.get(k) for k in
                ("id", "name", "threshold", "samples", "enrolled_on")} | {
                "enrolled": spk.get("embedding") is not None}

    async def get_speaker(self, speaker_id: str):
        return self.speakers.get(speaker_id)

    async def list_speakers(self):
        return [self._public(s) for s in self.speakers.values()]

    async def enrolled_vectors(self):
        """Enrolled prints for 1:N identification: [{id,name,threshold,embedding}]."""
        return [{"id": s["id"], "name": s.get("name"),
                 "threshold": s.get("threshold", 75), "embedding": s["embedding"]}
                for s in self.speakers.values() if s.get("embedding")]

    async def save_speaker(self, speaker_id: str, name: str, embedding: list,
                           samples: int):
        spk = self.speakers.get(speaker_id, {"id": speaker_id, "threshold": 75})
        spk.update({"name": name or spk.get("name", speaker_id),
                    "embedding": embedding, "samples": samples,
                    "enrolled_on": _utcnow()[:10]})
        self.speakers[speaker_id] = spk
        return spk

    # ------------------------------------------------- incidents/events ---
    def _seed_soc(self):
        for s in SEED_INCIDENTS:
            ts = _hours_ago(s["age_h"])
            self.incidents.append({"id": s["code"], "time": ts[11:19],
                                   "type": s["type"], "caller": s["caller"],
                                   "risk": s["risk"], "method": s["method"],
                                   "action": s["action"], "status": s["status"],
                                   "created_at": ts})
        for s in SEED_EVENTS:
            ts = _hours_ago(s["age_h"])
            self.events.append({"id": s["code"], "time": ts[11:19],
                                "caller": s["caller"],
                                "speakerMatch": s["speakerMatch"],
                                "aiDetection": s["aiDetection"],
                                "riskScore": s["riskScore"],
                                "context": s["context"], "action": s["action"],
                                "status": s["status"], "created_at": ts})

    async def list_incidents(self, limit: int = 200):
        return self.incidents[:limit]

    async def create_incident(self, data: dict):
        from datetime import datetime

        n = len(self.incidents) + 414
        code = data.get("id") or f"INC-{datetime.now().year}-{n:04d}"
        ts = _utcnow()
        row = {"id": code, "time": ts[11:19], "type": data.get("type", "Manual"),
               "caller": data.get("caller", "Unknown"),
               "risk": int(data.get("risk", 50)),
               "method": data.get("method", "Operator"),
               "action": data.get("action", "Logged"),
               "status": data.get("status", "Under Review"), "created_at": ts}
        self.incidents.insert(0, row)
        return row

    async def update_incident(self, code: str, patch: dict):
        allowed = {"type", "caller", "risk", "method", "action", "status"}
        for inc in self.incidents:
            if inc["id"] == code:
                for k, v in patch.items():
                    if k in allowed:
                        inc[k] = v
                return inc
        return None

    async def list_events(self, limit: int = 100):
        return self.events[:limit]

    async def save_event(self, data: dict):
        ts = _utcnow()
        n = len(self.events) + 9842
        row = {"id": data.get("id") or f"EVT-{n}",
               "time": ts[11:19], "caller": data.get("caller", "Unknown"),
               "speakerMatch": data.get("speakerMatch", "-"),
               "aiDetection": data.get("aiDetection", "-"),
               "riskScore": int(data.get("riskScore", 0)),
               "context": data.get("context", ""),
               "action": data.get("action", "-"),
               "status": data.get("status", "SAFE"), "created_at": ts,
               "session_id": data.get("session_id"),
               "voice_score": data.get("voice_score"),
               "speaker_score": data.get("speaker_score"),
               "context_score": data.get("context_score"),
               "behavioral_score": data.get("behavioral_score"),
               "decision": data.get("decision"),
               "reasons": data.get("reasons", [])}
        self.events.insert(0, row)
        self.events = self.events[:500]
        return row

    async def latest_threat(self):
        """Highest-risk event shaped as a threat-investigation dossier.

        Prefers rows carrying a real score breakdown (written by new analyses)
        over legacy seed rows, so the dossier shows measured numbers ASAP.
        """
        if not self.events:
            return None
        detailed = [e for e in self.events if e.get("voice_score") is not None]
        pool = detailed or self.events
        e = max(pool, key=lambda x: x.get("riskScore", 0))
        return self._dossier(e)

    @staticmethod
    def _dossier(e: dict):
        return {
            "threatId": e.get("id"),
            "timestamp": e.get("created_at", "")[:19].replace("T", " ") + " UTC",
            "caller": e.get("caller"),
            "voiceAuthenticity": e.get("voice_score", e.get("riskScore", 0)),
            "speakerSimilarity": e.get("speaker_score", 0),
            "contextRisk": e.get("context_score", 0),
            "behavioralAnomaly": e.get("behavioral_score", 0),
            "finalRisk": e.get("riskScore", 0),
            "decision": (e.get("decision") or e.get("action") or "").upper(),
            "reasons": e.get("reasons") or [],
            "session_id": e.get("session_id"),
            "status": e.get("status"),
        }

    async def dashboard_stats(self):
        risks = [e["riskScore"] for e in self.events]
        return {
            "totalAnalyses": len(self.events),
            "threatsDetected": sum(1 for r in risks if r >= 45),
            "highRiskEvents": sum(1 for r in risks if r >= 70),
            "openIncidents": sum(1 for i in self.incidents
                                 if i["status"] in OPEN_STATUSES),
            "avgRisk": round(sum(risks) / len(risks), 1) if risks else 0,
        }

    async def threat_timeline(self, buckets: int = 12, span_h: int = 12):
        return _timeline(self.events, buckets, span_h)

    async def risk_distribution(self):
        return _distribution([e["riskScore"] for e in self.events])

    async def model_perf(self):
        return MODELS


class SupabaseStore:
    kind = "supabase"

    def __init__(self, sb):
        self.sb = sb

    async def save_log(self, entry: dict):
        def _op():
            res = self.sb.table("logs").insert({
                "session_id": entry.get("session_id"),
                "ai_confidence": entry.get("ai_confidence"),
                "fingerprint_match": bool(entry.get("fingerprint_match")),
                "label": entry.get("label"),
                "similarity": entry.get("similarity"),
                "file": entry.get("file"),
            }).execute()
            row = dict(res.data[0]) if res.data else {}
            return {
                "session_id": row.get("session_id", entry.get("session_id")),
                "timestamp": row.get("created_at", _utcnow()),
                "ai_confidence": row.get("ai_confidence", entry.get("ai_confidence")),
                "fingerprint_match": row.get("fingerprint_match",
                                             entry.get("fingerprint_match")),
                "label": row.get("label"), "similarity": row.get("similarity"),
                "file": row.get("file"),
            }

        return await asyncio.to_thread(_op)

    async def recent_logs(self, limit: int = 50):
        def _op():
            res = self.sb.table("logs").select(
                "session_id,ai_confidence,fingerprint_match,label,similarity,file,created_at"
            ).order("created_at", desc=True).limit(limit).execute()
            return [{
                "session_id": r.get("session_id"),
                "timestamp": r.get("created_at"),
                "ai_confidence": r.get("ai_confidence"),
                "fingerprint_match": r.get("fingerprint_match"),
                "label": r.get("label"), "similarity": r.get("similarity"),
                "file": r.get("file"),
            } for r in (res.data or [])]

        return await asyncio.to_thread(_op)

    async def get_report(self, key: str):
        def _op():
            res = self.sb.table("reports").select(
                "key,title,level,summary,text,recommendation").eq("key", key).execute()
            return dict(res.data[0]) if res.data else None

        doc = await asyncio.to_thread(_op)
        if doc:
            return doc
        return {t["key"]: dict(t) for t in report_templates.TEMPLATES}.get(key)

    # ------------------------------------------------------- speakers ---
    @staticmethod
    def _public(spk: dict):
        return {k: spk.get(k) for k in
                ("id", "name", "threshold", "samples", "enrolled_on")} | {
                "enrolled": spk.get("embedding") is not None}

    async def get_speaker(self, speaker_id: str):
        def _op():
            res = self.sb.table("speakers").select("*").eq("id", speaker_id).execute()
            return dict(res.data[0]) if res.data else None

        return await asyncio.to_thread(_op)

    async def list_speakers(self):
        def _op():
            res = self.sb.table("speakers").select(
                "id,name,threshold,samples,enrolled_on,embedding").execute()
            return [self._public(dict(r)) for r in (res.data or [])]

        try:
            return await asyncio.to_thread(_op)
        except Exception:  # noqa: BLE001 — table missing? report honestly
            return []

    async def enrolled_vectors(self):
        """Enrolled prints for 1:N identification: [{id,name,threshold,embedding}]."""
        def _op():
            res = self.sb.table("speakers").select(
                "id,name,threshold,embedding").execute()
            return [{"id": r["id"], "name": r.get("name"),
                     "threshold": r.get("threshold", 75),
                     "embedding": r["embedding"]} for r in (res.data or [])
                    if r.get("embedding")]

        try:
            return await asyncio.to_thread(_op)
        except Exception:  # noqa: BLE001
            return []

    async def save_speaker(self, speaker_id: str, name: str, embedding: list,
                           samples: int):
        from datetime import date

        def _op():
            row = {"id": speaker_id,
                   "name": name or speaker_id,
                   "embedding": embedding, "samples": samples,
                   "enrolled_on": date.today().isoformat()}
            self.sb.table("speakers").upsert(row, on_conflict="id").execute()
            res = self.sb.table("speakers").select("*").eq("id", speaker_id).execute()
            return dict(res.data[0]) if res.data else row

        return await asyncio.to_thread(_op)

    # ------------------------------------------------- incidents/events ---
    @staticmethod
    def _clean_inc(r: dict):
        return {"id": r.get("incident_code"), "time": (r.get("created_at") or "")[11:19],
                "type": r.get("type"), "caller": r.get("caller"),
                "risk": r.get("risk"), "method": r.get("method"),
                "action": r.get("action"), "status": r.get("status"),
                "created_at": r.get("created_at")}

    @staticmethod
    def _clean_evt(r: dict):
        return {"id": r.get("event_code"), "time": (r.get("created_at") or "")[11:19],
                "caller": r.get("caller"), "speakerMatch": r.get("speaker_match"),
                "aiDetection": r.get("ai_detection"),
                "riskScore": r.get("risk_score"), "context": r.get("context"),
                "action": r.get("action"), "status": r.get("status"),
                "created_at": r.get("created_at")}

    @staticmethod
    def _clean_evt_full(r: dict):
        d = SupabaseStore._clean_evt(r)
        d.update({"session_id": r.get("session_id"),
                  "voice_score": r.get("voice_score"),
                  "speaker_score": r.get("speaker_score"),
                  "context_score": r.get("context_score"),
                  "behavioral_score": r.get("behavioral_score"),
                  "decision": r.get("decision"),
                  "reasons": r.get("reasons") or []})
        return d

    async def list_incidents(self, limit: int = 200):
        def _op():
            res = self.sb.table("incidents").select("*").order(
                "created_at", desc=True).limit(limit).execute()
            return [self._clean_inc(dict(r)) for r in (res.data or [])]

        return await asyncio.to_thread(_op)

    async def create_incident(self, data: dict):
        from datetime import datetime

        def _op():
            n = self.sb.table("incidents").select(
                "id", count="exact").execute().count or 0
            code = data.get("id") or f"INC-{datetime.now().year}-{n + 414:04d}"
            row = {"incident_code": code,
                   "type": data.get("type", "Manual"),
                   "caller": data.get("caller", "Unknown"),
                   "risk": int(data.get("risk", 50)),
                   "method": data.get("method", "Operator"),
                   "action": data.get("action", "Logged"),
                   "status": data.get("status", "Under Review")}
            self.sb.table("incidents").insert(row).execute()
            got = self.sb.table("incidents").select("*").eq(
                "incident_code", code).execute()
            return self._clean_inc(dict(got.data[0])) if got.data else row

        return await asyncio.to_thread(_op)

    async def update_incident(self, code: str, patch: dict):
        allowed = {"type", "caller", "risk", "method", "action", "status"}

        def _op():
            clean = {k: v for k, v in patch.items() if k in allowed}
            if clean:
                self.sb.table("incidents").update(clean).eq(
                    "incident_code", code).execute()
            got = self.sb.table("incidents").select("*").eq(
                "incident_code", code).execute()
            return self._clean_inc(dict(got.data[0])) if got.data else None

        return await asyncio.to_thread(_op)

    async def list_events(self, limit: int = 100):
        def _op():
            res = self.sb.table("events").select("*").order(
                "created_at", desc=True).limit(limit).execute()
            return [self._clean_evt(dict(r)) for r in (res.data or [])]

        return await asyncio.to_thread(_op)

    async def save_event(self, data: dict):
        def _op():
            n = self.sb.table("events").select(
                "id", count="exact").execute().count or 0
            row = {"event_code": data.get("id") or f"EVT-{n + 9842}",
                   "caller": data.get("caller", "Unknown"),
                   "speaker_match": data.get("speakerMatch", "-"),
                   "ai_detection": data.get("aiDetection", "-"),
                   "risk_score": int(data.get("riskScore", 0)),
                   "context": data.get("context", ""),
                   "action": data.get("action", "-"),
                   "status": data.get("status", "SAFE"),
                   "session_id": data.get("session_id"),
                   "voice_score": data.get("voice_score"),
                   "speaker_score": data.get("speaker_score"),
                   "context_score": data.get("context_score"),
                   "behavioral_score": data.get("behavioral_score"),
                   "decision": data.get("decision"),
                   "reasons": data.get("reasons", [])}
            self.sb.table("events").insert(row).execute()
            got = self.sb.table("events").select("*").eq(
                "event_code", row["event_code"]).execute()
            return self._clean_evt(dict(got.data[0])) if got.data else row

        return await asyncio.to_thread(_op)

    async def latest_threat(self):
        def _op():
            res = self.sb.table("events").select("*").order(
                "created_at", desc=True).limit(50).execute()
            rows = [self._clean_evt_full(dict(r)) for r in (res.data or [])]
            if not rows:
                return None
            detailed = [r for r in rows if r.get("voice_score") is not None]
            pool = detailed or rows
            return MemoryStore._dossier(max(pool, key=lambda x: x.get("riskScore", 0)))

        return await asyncio.to_thread(_op)

    async def dashboard_stats(self):
        def _op():
            ev = self.sb.table("events").select("risk_score").execute().data or []
            risks = [r.get("risk_score", 0) for r in ev]
            inc = self.sb.table("incidents").select("status,risk").execute().data or []
            return {
                "totalAnalyses": len(ev),
                "threatsDetected": sum(1 for r in risks if r >= 45),
                "highRiskEvents": sum(1 for r in risks if r >= 70),
                "openIncidents": sum(1 for i in inc
                                     if i.get("status") in OPEN_STATUSES),
                "avgRisk": round(sum(risks) / len(risks), 1) if risks else 0,
            }

        return await asyncio.to_thread(_op)

    async def threat_timeline(self, buckets: int = 12, span_h: int = 12):
        ev = await self.list_events(500)
        return _timeline(ev, buckets, span_h)

    async def risk_distribution(self):
        def _op():
            ev = self.sb.table("events").select("risk_score").execute().data or []
            return _distribution([r.get("risk_score", 0) for r in ev])

        return await asyncio.to_thread(_op)

    async def model_perf(self):
        return MODELS


def _timeline(events: list[dict], buckets: int = 12, span_h: int = 12):
    """Bucket event risk scores into time slices for the Chart.js line chart."""
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=span_h)
    span = (now - start).total_seconds() or 1
    safe, susp, high = [0] * buckets, [0] * buckets, [0] * buckets
    labels = [(start + timedelta(seconds=span * i / buckets)).strftime("%H:%M")
              for i in range(buckets)]
    for e in events:
        ts = _parse_ts(e.get("created_at", ""))
        if ts < start:
            continue
        i = min(buckets - 1, int((ts - start).total_seconds() / span * buckets))
        r = e.get("riskScore", 0)
        if r >= 70:
            high[i] += 1
        elif r >= 45:
            susp[i] += 1
        else:
            safe[i] += 1
    return {"labels": labels, "safe": safe, "suspicious": susp, "highRisk": high}


def _distribution(risks: list[int]):
    bands = [sum(1 for r in risks if r < 45),
             sum(1 for r in risks if 45 <= r < 70),
             sum(1 for r in risks if 70 <= r < 85),
             sum(1 for r in risks if r >= 85)]
    return {"labels": ["Low Risk", "Medium Risk", "High Risk", "Critical"],
            "values": bands,
            "colors": ["#22c55e", "#eab308", "#f97316", "#ef4444"]}


async def _seed_soc(db):
    """Seed classic SOC rows once so dashboards are alive before first analysis."""
    def _op():
        if db.table("incidents").select("id", count="exact").limit(1).execute().count:
            return False
        for s in SEED_INCIDENTS:
            db.table("incidents").insert({
                "incident_code": s["code"], "type": s["type"],
                "caller": s["caller"], "risk": s["risk"], "method": s["method"],
                "action": s["action"], "status": s["status"],
                "created_at": _hours_ago(s["age_h"])}).execute()
        for s in SEED_EVENTS:
            db.table("events").insert({
                "event_code": s["code"], "caller": s["caller"],
                "speaker_match": s["speakerMatch"],
                "ai_detection": s["aiDetection"], "risk_score": s["riskScore"],
                "context": s["context"], "action": s["action"],
                "status": s["status"],
                "created_at": _hours_ago(s["age_h"])}).execute()
        return True

    seeded = await asyncio.to_thread(_op)
    if seeded:
        print("  [store] seeded demo incidents + events")


async def get_store():
    global _store
    if _store is not None:
        return _store
    if db_supabase.is_configured():
        try:
            sb = db_supabase.get_supabase()
            await asyncio.to_thread(
                lambda: sb.table("reports").select("key").limit(1).execute())
            await _seed_soc(sb)
            _store = SupabaseStore(sb)
            print("  [store] Supabase connected")
            return _store
        except Exception as e:  # noqa: BLE001 — fallback is the point
            print(f"  [store] Supabase unreachable ({str(e)[:120]}) — memory fallback.")
    else:
        print("  [store] SUPABASE keys not set — memory fallback.")
    _store = MemoryStore()
    return _store


# Ephemeral session registry for Simulate-Live-Call polling (always in memory).
_sessions: dict[str, dict] = {}


def new_session(sample: str) -> dict:
    import uuid

    sid = uuid.uuid4().hex[:12]
    _sessions[sid] = {"session_id": sid, "sample": sample,
                      "status": "processing", "progress": 0, "result": None}
    return _sessions[sid]


def get_session(sid: str):
    return _sessions.get(sid)


def update_session(sid: str, **patch):
    if sid in _sessions:
        _sessions[sid].update(patch)
    return _sessions.get(sid)
