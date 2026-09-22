from fastapi import APIRouter, File, Form, UploadFile

import config
from services import ml_client
from services.audio import detect_clone, verify_speaker
from services.risk import fuse_risk, score_context
from store import get_store

router = APIRouter()
MAX_BYTES = 15 * 1024 * 1024


async def _bytes(audio: UploadFile) -> bytes:
    buf = await audio.read()
    if not buf:
        from fastapi import HTTPException

        raise HTTPException(400, "No audio file. Send multipart field 'audio'.")
    if len(buf) > MAX_BYTES:
        from fastapi import HTTPException

        raise HTTPException(413, "Audio too large (max 15 MB).")
    return buf


@router.post("/api/analyze/clone")
async def clone(audio: UploadFile = File(...), demo: str = Form("")):
    buf = await _bytes(audio)
    ml = await ml_client.try_clone(buf, audio.filename or "audio",
                                   audio.content_type or "")
    if ml:
        return {"label": ml["label"], "confidence": ml["confidence"],
                "synthScore": ml.get("synth_score"), "model": ml.get("model"),
                "reasons": ml.get("reasons", []), "features": None, "mlUsed": True}
    return {**detect_clone(buf, audio.content_type or "", demo), "mlUsed": False}


@router.post("/api/verify/speaker")
async def speaker(audio: UploadFile = File(...), speakerId: str = Form("SPK-001"),
                  threshold: str = Form(""), demo: str = Form("")):
    buf = await _bytes(audio)
    store = await get_store()
    spk = await store.speaker(speakerId)
    th = float(threshold) if str(threshold).strip() else (
        (spk or {}).get("threshold") or config.THRESHOLDS["similarity"])
    ml = await ml_client.try_verify(buf, audio.filename or "audio",
                                    audio.content_type or "", speakerId)
    if ml:
        sim = ml["similarity"]
        return {"speakerId": speakerId, "similarity": sim,
                "match": sim >= th, "threshold": th,
                "model": ml.get("model"), "mlUsed": True}
    return {**verify_speaker(buf, audio.content_type or "", speakerId, th, demo),
            "mlUsed": False}


@router.post("/api/analyze/context")
async def context(body: dict):
    transcript = (body or {}).get("transcript", "")
    metadata = (body or {}).get("metadata", {})
    ml = await ml_client.try_context(transcript, metadata)
    if ml:
        return {"risk": ml["risk"], "indicators": ml.get("indicators", []),
                "model": ml.get("model"), "mlUsed": True}
    return {**score_context(transcript, metadata), "mlUsed": False}


@router.post("/api/analyze/full")
async def full(audio: UploadFile = File(...), transcript: str = Form(""),
               caller: str = Form("Unknown Caller"),
               speakerId: str = Form("SPK-001"), demo: str = Form("")):
    buf = await _bytes(audio)
    mime = audio.content_type or ""
    store = await get_store()

    ml_c = await ml_client.try_clone(buf, audio.filename or "audio", mime)
    clone = ({"label": ml_c["label"], "confidence": ml_c["confidence"],
              "synthScore": ml_c.get("synth_score"), "model": ml_c.get("model"),
              "reasons": ml_c.get("reasons", [])} if ml_c
             else detect_clone(buf, mime, demo))

    ml_s = await ml_client.try_verify(buf, audio.filename or "audio", mime, speakerId)
    speaker = ({"speakerId": speakerId, "similarity": ml_s["similarity"],
                "model": ml_s.get("model")} if ml_s
               else verify_speaker(buf, mime, speakerId,
                                   config.THRESHOLDS["similarity"], demo))

    ml_x = await ml_client.try_context(transcript, {"caller": caller}) if transcript else None
    context = ({"risk": ml_x["risk"], "indicators": ml_x.get("indicators", [])}
               if ml_x else score_context(transcript, {"caller": caller}))

    behavioral = round(max(5, min(95, clone["synthScore"] * 0.6 + context["risk"] * 0.4)))
    risk = fuse_risk(clone, speaker, context, behavioral, config.THRESHOLDS)

    action = ("Blocked" if risk["decision"] == "BLOCKED"
              else "Challenge" if risk["decision"] == "CHALLENGED" else "Allowed")
    event = await store.push_event({
        "caller": caller,
        "speakerMatch": ("Matched" if speaker["similarity"] >= config.THRESHOLDS["similarity"]
                         else "Failed"),
        "aiDetection": ({"genuine": "Genuine", "synthetic": "Synthetic"}
                        .get(clone["label"], "Suspicious")),
        "riskScore": risk["score"],
        "context": transcript[:40] if transcript else "Voice analysis",
        "action": action,
        "status": ("CRITICAL" if risk["score"] >= 80
                   else "WARNING" if risk["score"] >= 55 else "SAFE"),
    })

    incident = None
    if risk["score"] >= config.THRESHOLDS["challenge"]:
        incident = await store.push_incident({
            "type": "Voice Clone" if clone["label"] == "synthetic" else "Suspicious Voice",
            "caller": caller, "risk": risk["score"],
            "method": "Full Pipeline (heuristic)",
            "action": ("Blocked" if action == "Blocked" and config.THRESHOLDS["autoBlock"]
                       else "Challenged"),
            "status": ("Escalated" if risk["score"] >= config.THRESHOLDS["security"]
                       else "Under Review"),
        })

    await store.save_threat({
        "timestamp": __import__("seed_data").now_time() + " IST",
        "caller": caller, "voiceAuthenticity": clone["synthScore"],
        "speakerSimilarity": speaker["similarity"], "contextRisk": context["risk"],
        "behavioralAnomaly": behavioral, "finalRisk": risk["score"],
        "decision": risk["decision"],
        "reasons": list(clone.get("reasons", [])) + list(context.get("indicators", [])[:2]),
    })

    return {
        "clone": clone,
        "speaker": {**speaker,
                    "match": speaker["similarity"] >= config.THRESHOLDS["similarity"],
                    "threshold": config.THRESHOLDS["similarity"]},
        "context": context, "behavioral": behavioral, "risk": risk,
        "event": event, "incident": incident,
        "challenge": ({"phrase": store.challenge_phrase()}
                      if risk["challengeRequired"] else None),
        "mlUsed": bool(ml_c or ml_s),
    }


@router.post("/api/challenge/verify")
async def challenge(body: dict):
    store = await get_store()
    incident_id, passed = (body or {}).get("incidentId"), bool((body or {}).get("passed"))
    inc = await store.update_incident(incident_id, {
        "status": "Closed" if passed else "Escalated",
        "action": "Allowed" if passed else "Blocked"}) if incident_id else None
    return {"ok": True, "incident": inc, "passed": passed}
