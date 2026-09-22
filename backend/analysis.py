"""Analysis pipeline: file -> models -> chart numbers -> report -> Supabase log.

Single entry point run_analysis() is used by BOTH:
  - POST /api/analyze-voice (direct upload, synchronous), and
  - POST /api/simulate-live-call (pre-saved sample, background task + polling).
"""
import asyncio
import os

import config
import models
import reports
from services import llm as llm_svc
from services import prosody as prosody_svc
from services import risk as risk_svc
from store import get_session, get_store, update_session

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "samples")


def pick_report_key(ai_prob: float) -> str:
    return reports.pick_key(ai_prob, config.HIGH_RISK_AT, config.MEDIUM_RISK_AT)


async def run_analysis(blob: bytes, filename: str, session_id: str,
                       speaker_id: str = "auto", demo: str = "",
                       transcript: str = "") -> dict:
    """Full pipeline. Returns the exact JSON the React Chart.js UI renders."""
    store = await get_store()

    voice = models.wav2vec2_predict(blob, demo)
    if (speaker_id or "auto").lower() == "auto":
        # 1:N identification: no name needed — rank every enrolled print.
        candidates = await store.enrolled_vectors()
        finger = await asyncio.to_thread(models.identify, blob, candidates, demo)
        finger["speakerId"] = finger.get("identified_as")
        finger["enrolled"] = bool(candidates)
    else:
        # 1:1 verification against one named print.
        spk = await store.get_speaker(speaker_id) or {}
        enrolled = spk.get("embedding")
        threshold = spk.get("threshold", config.SIMILARITY_THRESHOLD)
        finger = await asyncio.to_thread(models.ecapa_verify, blob, enrolled,
                                         threshold, demo)
        finger["speakerId"] = speaker_id
        finger["identified_as"] = speaker_id if finger.get("match") else None
        finger["all_scores"] = []
    ai = voice["ai_probability"]

    # Real transcript (faster-whisper) unless the caller supplied one, then
    # multilingual scam-pattern scoring over the actual words.
    if transcript:
        heard = {"text": transcript, "language": "", "lang_prob": 0.0}
        stt_skipped = False
    elif models.TRANSCRIBER_READY.is_set():
        try:
            heard = await asyncio.to_thread(models.transcribe_clip, blob)
        except Exception:  # noqa: BLE001 — non-WAV input: no transcript
            heard = {"text": "", "language": "", "lang_prob": 0.0}
        stt_skipped = False
    else:
        # Transcriber still warming: answer fast with scores now, words later.
        heard = {"text": "", "language": "", "lang_prob": 0.0}
        stt_skipped = True
    transcript = heard["text"]
    context = risk_svc.score_context(transcript, {}, heard["language"])

    # Deep voice-cue layer: pitch / breathing / pauses / rate (WAV only),
    # plus claimed-identity, impersonation cross-check and call-time risk.
    try:
        dec = models._decode_wav(blob)
        if dec:
            _s16, _sr = dec
            if _sr != 16000:
                _s16 = models._resample(_s16, _sr, 16000)
            prosody = await asyncio.to_thread(
                prosody_svc.analyze_prosody, _s16, 16000, transcript)
        else:
            raise ValueError("non-WAV")
    except Exception:  # noqa: BLE001 — cues are enrichment, never fatal
        prosody = {"features": {}, "cues": [], "prosody_risk": 0}
    claimed = risk_svc.extract_claimed_identity(transcript)
    impersonation = bool(claimed["text"]) and not finger.get("match")
    call_time = risk_svc.call_hour_risk()

    breakdown = {
        "voice_authenticity": ai,
        "speaker_risk": round(100 - finger["similarity"], 1),
        "context_risk": context["risk"],
        "behavioral": round(max(5, min(95, ai * 0.7 + 12)), 1),
    }
    risk_score = round(ai * 0.5 + breakdown["speaker_risk"] * 0.2
                       + breakdown["context_risk"] * 0.2 + breakdown["behavioral"] * 0.1, 1)
    level = ("HIGH" if ai >= config.HIGH_RISK_AT
             else "MEDIUM" if ai >= config.MEDIUM_RISK_AT else "LOW")
    action = ("Blocked" if risk_score >= config.HIGH_RISK_AT
              else "Challenge" if risk_score >= config.MEDIUM_RISK_AT else "Allowed")

    from datetime import datetime, timezone
    timestamp = datetime.now(timezone.utc).isoformat()[:19] + "Z"
    feats = prosody["features"]
    # --- full-report context from already-computed values (no logic change) ---
    verdict = "BLOCK" if action == "Blocked" else "CHALLENGE" if action == "Challenge" else "ALLOW"
    if finger.get("match"):
        speaker_match_str = "matched"
    elif not finger.get("enrolled", True):
        speaker_match_str = "unverified"
    else:
        speaker_match_str = "not matched"
    base_ctx = {
        "verdict": verdict,
        "score": ai,  # existing AI% score
        "risk_score": risk_score,
        "level": level,
        "call_time": timestamp,
        "call_time_note": call_time.get("note", ""),
        "duration": feats.get("duration_s", 0),
        "claimed_identity": claimed.get("text", "") or "Not detected",
        "claimed_authority": bool(claimed.get("authority", False)),
        "speaker_match": speaker_match_str,
        "similarity": finger["similarity"],
        "identified_as": finger.get("identified_as"),
        "identified_name": finger.get("identified_name"),
        "synthetic_level": ai,
        "synthetic_flags": list(prosody.get("cues", [])[:4]),
        "info_requested": list(context.get("indicators", [])),
        "transcript": transcript,
    }
    template_base = await store.get_report(pick_report_key(ai))
    # Enrich template to full structure via reports.py (formats scenario_summary)
    report = reports.build_full_template(pick_report_key(ai), template_base, base_ctx)

    # Cloud-LLM stage: generated analyst report when a key exists, else the
    # pre-made template. Response always carries both (badge shows which).
    llm_report = await llm_svc.generate_report({
        "session_id": session_id,
        "timestamp": timestamp,
        "language": heard["language"], "transcript": transcript,
        "ai_probability": ai, "clone_model": voice["model"],
        "identified_as": finger.get("identified_as"),
        "identified_name": finger.get("identified_name"),
        "similarity": finger["similarity"],
        "threshold": finger.get("threshold", config.SIMILARITY_THRESHOLD),
        "claimed_identity": claimed, "impersonation": impersonation,
        "context_risk": breakdown["context_risk"],
        "context_indicators": context["indicators"],
        "prosody_risk": prosody["prosody_risk"], "prosody_cues": prosody["cues"],
        "pitch": {k: feats.get(k) for k in ("pitch_mean", "pitch_std")},
        "pauses": feats.get("pause_count", 0),
        "breaths": feats.get("breath_count", 0),
        "wpm": feats.get("speech_rate_wpm", 0),
        "duration": feats.get("duration_s", 0),
        "risk_score": risk_score, "level": level, "action": action,
        "verdict": verdict,
    })
    if llm_report:
        # Keep measured structured fields from base_ctx, use LLM only for narrative text
        report = {**report, **base_ctx, "title": llm_report.get("title", report.get("title")),
                  "text": llm_report.get("text", report.get("text")),
                  "scenario_summary": llm_report.get("text", report.get("scenario_summary")),
                  "recommendation": llm_report.get("recommendation", report.get("recommendation")),
                  "model": llm_report.get("model"), "generated": True,
                  "template": template_base}
    else:
        report["generated"] = False

    log = await store.save_log({
        "session_id": session_id,
        "ai_confidence": ai,
        "fingerprint_match": bool(finger["match"]),
        "label": voice["label"],
        "similarity": finger["similarity"],
        "file": filename,
    })

    # SOC mirror: every analysis also becomes a security-event row.
    who = finger.get("identified_name") or finger.get("speakerId") or "Unknown Caller"
    await store.save_event({
        "caller": who if finger.get("match") else "Unknown Caller",
        "speakerMatch": ("Matched" if finger.get("match") else "Failed"),
        "aiDetection": voice["label"].capitalize(),
        "riskScore": risk_score,
        "context": (transcript[:40] if transcript
                    else f"{voice['label']} voice · {filename}"),
        "action": action,
        "status": ("CRITICAL" if risk_score >= 80
                   else "WARNING" if risk_score >= 55 else "SAFE"),
        "session_id": session_id,
        "voice_score": ai,
        "speaker_score": finger["similarity"],
        "context_score": breakdown["context_risk"],
        "behavioral_score": breakdown["behavioral"],
        "decision": ("BLOCKED" if action == "Blocked"
                     else "CHALLENGED" if action == "Challenge" else "ALLOWED"),
        "reasons": [
            f"AI-generation probability {ai}% ({voice['model'][:60]})",
            (f"Speaker similarity {finger['similarity']}% vs {who} — match"
             if finger.get("match") else
             f"Speaker similarity {finger['similarity']}% — no enrolled match"),
            f"Fused risk {risk_score}/100 ({level}); context {breakdown['context_risk']}",
            *([f"Conversation pattern: {context['indicators'][0]}"]
              if context["risk"] >= 55 else []),
            *([f"Voice cues: {prosody['cues'][0]}"]
              if prosody["cues"] and prosody["prosody_risk"] >= 30 else []),
            *([f"Impersonation alert: caller claims '{claimed['text']}' but "
               f"voice matches nobody enrolled"
               + (" — invoked authority" if claimed["authority"] else "")]
              if impersonation else []),
            *([f"Call-time flag: {call_time['note']}"]
              if call_time["risk"] > 0 else []),
        ],
    })

    return {
        "session_id": session_id,
        "file": filename,
        "label": voice["label"],
        "level": level,
        "ai_probability": ai,
        "genuine_probability": voice["genuine_probability"],
        "fingerprint_match": bool(finger["match"]),
        "similarity": finger["similarity"],
        "speaker_enrolled": bool(finger.get("enrolled", False)),
        "identified_as": finger.get("identified_as"),
        "identified_name": finger.get("identified_name"),
        "all_scores": finger.get("all_scores", []),
        "transcript": transcript,
        "transcript_language": heard["language"],
        "stt_pending": stt_skipped,
        "voice_cues": {
            "prosody_risk": prosody["prosody_risk"],
            "cues": prosody["cues"][:3],
            "pitch": {k: prosody["features"].get(k) for k in
                      ("pitch_mean", "pitch_std", "pitch_range")},
            "pauses": prosody["features"].get("pause_count", 0),
            "breaths": prosody["features"].get("breath_count", 0),
            "speech_rate_wpm": prosody["features"].get("speech_rate_wpm", 0),
        },
        "claimed_identity": claimed,
        "impersonation": impersonation,
        "call_time": call_time,
        "scores": {"ai_probability": ai,
                   "genuine_probability": voice["genuine_probability"],
                   "speaker_similarity": finger["similarity"],
                   **breakdown,
                   "risk_score": risk_score},
        "timeline": voice["timeline"],   # 40 real per-frame points for Chart.js line
        "report": report,
        "model": voice["model"],
        "log_saved": bool(log),
    }


async def simulate_session(session_id: str):
    """Background 'live call': staged progress, then real analysis of the sample."""
    import asyncio

    sess = get_session(session_id)
    if not sess:
        return
    blob = await load_sample_bytes(sess["sample"])
    if blob is None:
        update_session(session_id, status="error", progress=100,
                       result={"error": f"sample not found: {sess['sample']}"})
        return
    for p in (15, 40, 70):  # fake streaming progress for the spinner UI
        await asyncio.sleep(1.2)
        update_session(session_id, progress=p, status="processing")
    result = await run_analysis(blob, sess["sample"], session_id)
    update_session(session_id, status="complete", progress=100, result=result)


async def load_sample_bytes(filename: str):
    """Sample audio: Supabase Storage first, local samples/ as offline fallback."""
    import asyncio

    try:
        import storage as storage_svc

        return await asyncio.to_thread(storage_svc.download_sample, filename)
    except Exception:  # noqa: BLE001 — offline? use the local copy
        path = os.path.join(SAMPLE_DIR, os.path.basename(filename))
        if not os.path.isfile(path):
            return None
        with open(path, "rb") as f:
            return f.read()


async def list_samples():
    """Sample catalogue: Supabase Storage first, local samples/ as fallback."""
    import asyncio

    try:
        import storage as storage_svc

        rows = await asyncio.to_thread(storage_svc.list_sample_files)
        return [{**r, "source": "supabase"} for r in rows]
    except Exception:  # noqa: BLE001
        out = []
        if os.path.isdir(SAMPLE_DIR):
            for f in sorted(os.listdir(SAMPLE_DIR)):
                if f.lower().endswith(".wav"):
                    out.append({"file": f, "size": os.path.getsize(
                        os.path.join(SAMPLE_DIR, f)), "source": "disk"})
        return out
