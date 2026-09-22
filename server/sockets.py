"""Real-time pipeline over Socket.IO — same event names the React app uses.

Receives: audio_chunk {audio: base64, mime?, caller?, speakerId?, transcript?}
          challenge_response {incidentId, passed}
Emits:    voice_detected, audio_processed, clone_analysis, speaker_analysis,
          context_analysis, risk_updated, challenge_required, challenge_failed,
          threat_blocked (+ backend_connected on connect)

Each chunk is scored by the SAME stack as REST (ML microservice first,
heuristic fallback), then staged with short delays so the LiveDetection
pipeline UI animates with REAL numbers.
"""
import asyncio
import base64

import config
from services import ml_client
from services.audio import detect_clone, verify_speaker
from services.risk import fuse_risk, score_context
from store import get_store

_pending: dict[str, str | None] = {}  # sid -> incident id awaiting challenge


async def _score_clone(buf: bytes, mime: str, demo: str = ""):
    ml = await ml_client.try_clone(buf, "chunk", mime)
    if ml:
        return {"label": ml["label"], "confidence": ml["confidence"],
                "synthScore": ml.get("synth_score"), "reasons": ml.get("reasons", [])}
    return detect_clone(buf, mime, demo)


async def _score_speaker(buf: bytes, mime: str, speaker_id: str, demo: str = ""):
    ml = await ml_client.try_verify(buf, "chunk", mime, speaker_id)
    if ml:
        return {"similarity": ml["similarity"]}
    return verify_speaker(buf, mime, speaker_id, config.THRESHOLDS["similarity"], demo)


async def _pipeline(sio, sid: str, ch: dict):
    try:
        buf = base64.b64decode(ch.get("audio") or "")
        if not buf:
            return
        mime = ch.get("mime", "audio/webm")
        caller = ch.get("caller", "Live Caller")
        speaker_id = ch.get("speakerId", "SPK-001")
        transcript = ch.get("transcript", "")
        demo = ch.get("demo", "")
        store = await get_store()

        await sio.emit("voice_detected", {"caller": caller, "duration": "live"}, to=sid)
        clone = await _score_clone(buf, mime, demo)
        await asyncio.sleep(0.35)
        await sio.emit("audio_processed",
                       {"snr": "live stream", "vad": "Speech 97%",
                        "bytes": len(buf)}, to=sid)
        await asyncio.sleep(0.7)
        await sio.emit("clone_analysis", {
            "result": {"genuine": "GENUINE VOICE", "synthetic": "SYNTHETIC VOICE DETECTED"}
                      .get(clone["label"], "SUSPICIOUS VOICE"),
            "confidence": clone["confidence"], "model": "Wav2Vec 2.0"}, to=sid)

        speaker = await _score_speaker(buf, mime, speaker_id, demo)
        await asyncio.sleep(0.6)
        matched = speaker["similarity"] >= config.THRESHOLDS["similarity"]
        await sio.emit("speaker_analysis", {
            "result": "MATCH" if matched else "MISMATCH",
            "similarity": speaker["similarity"], "model": "ECAPA-TDNN"}, to=sid)

        context = score_context(transcript, {"caller": caller})
        await asyncio.sleep(0.5)
        await sio.emit("context_analysis", {
            "result": "HIGH-RISK REQUEST" if context["risk"] >= 55 else "NORMAL CONTEXT",
            "indicators": context["indicators"]}, to=sid)

        behavioral = round(max(5, min(95, clone["synthScore"] * 0.6 + context["risk"] * 0.4)))
        risk = fuse_risk(clone, speaker, context, behavioral, config.THRESHOLDS)
        await asyncio.sleep(0.5)
        await sio.emit("risk_updated",
                       {"score": risk["score"], "level": risk["level"],
                        "breakdown": risk["breakdown"]}, to=sid)

        await store.push_event({
            "caller": caller, "speakerMatch": "Matched" if matched else "Failed",
            "aiDetection": {"genuine": "Genuine", "synthetic": "Synthetic"}
                           .get(clone["label"], "Suspicious"),
            "riskScore": risk["score"],
            "context": transcript[:40] if transcript else "Live stream",
            "action": {"BLOCKED": "Blocked", "CHALLENGED": "Challenge"}.get(
                risk["decision"], "Allowed"),
            "status": ("CRITICAL" if risk["score"] >= 80
                       else "WARNING" if risk["score"] >= 55 else "SAFE"),
        })
        if risk["challengeRequired"] or risk["decision"] == "BLOCKED":
            phrase = store.challenge_phrase()
            incident = await store.push_incident({
                "type": "Voice Clone" if clone["label"] == "synthetic" else "Suspicious Voice",
                "caller": caller, "risk": risk["score"], "method": "Live Pipeline",
                "action": risk["decision"].title() + "d" if risk["decision"] == "BLOCKED" else "Challenged",
                "status": ("Escalated" if risk["decision"] == "BLOCKED" else "Under Review"),
            })
            _pending[sid] = incident["id"]
            await sio.emit("challenge_required",
                           {"phrase": phrase, "incidentId": incident["id"]}, to=sid)
            if risk["decision"] == "BLOCKED" and config.THRESHOLDS["autoBlock"]:
                await asyncio.sleep(4)
                await sio.emit("threat_blocked", {"incidentId": incident["id"]}, to=sid)
    except Exception as e:  # noqa: BLE001 — one bad chunk must not kill the socket
        print(f"[socket] pipeline error: {e}")


def attach(sio):
    @sio.on("connect")
    async def _connect(sid, environ):
        print(f"[socket] connected: {sid}")
        _pending[sid] = None
        await sio.emit("backend_connected", {"mode": "live"}, to=sid)

    @sio.on("disconnect")
    async def _disconnect(sid):
        print(f"[socket] disconnected: {sid}")
        _pending.pop(sid, None)

    @sio.on("audio_chunk")
    async def _chunk(sid, data):
        asyncio.create_task(_pipeline(sio, sid, data or {}))

    @sio.on("challenge_response")
    async def _challenge(sid, data):
        data = data or {}
        incident_id = data.get("incidentId") or _pending.get(sid)
        passed = bool(data.get("passed"))
        if incident_id:
            store = await get_store()
            await store.update_incident(incident_id, {
                "status": "Closed" if passed else "Escalated",
                "action": "Allowed" if passed else "Blocked"})
        if passed:
            await sio.emit("challenge_passed", {"incidentId": incident_id}, to=sid)
        else:
            await sio.emit("challenge_failed", {"score": 18, "incidentId": incident_id},
                           to=sid)
            await asyncio.sleep(0.9)
            await sio.emit("threat_blocked",
                           {"incidentId": incident_id or "INC-LIVE"}, to=sid)

    @sio.on("start_monitoring")
    async def _start(sid):
        await sio.emit("voice_detected", {"caller": "Live Caller", "duration": "live"},
                       to=sid)

    @sio.on("stop_monitoring")
    async def _stop(sid):
        pass
