"""Context heuristics + risk fusion (weights mirror the React Risk Engine).

Upgrade path: score_context() can call Llama/Ollama (see ml_client.try_context
or ../backend/ml-service). fuse_risk() stays identical — only its inputs get
smarter, so neither the API shape nor the frontend ever changes.
"""
URGENCY = ["urgent", "immediately", "right now", "asap", "hurry",
           "emergency", "jaldi", "turant"]
FINANCIAL = ["transfer", "upi", "otp", "pin", "account", "bank", "payment",
             "money", "rupees", "lakh", "crore", "refund", "kyc", "password", "paise"]
AUTHORITY = ["police", "cbi", "rbi", "officer", "government", "court",
             "income tax", "customs", "cyber cell"]
SECRECY = ["don't tell", "do not tell", "secret", "no one", "nobody",
           "kisi ko mat", "chup"]


def score_context(transcript: str = "", metadata: dict | None = None) -> dict:
    metadata = metadata or {}
    t = (transcript or "").lower()

    def hits(words):
        return [w for w in words if w in t]

    urg, fin, auth, sec = hits(URGENCY), hits(FINANCIAL), hits(AUTHORITY), hits(SECRECY)
    risk, indicators = 8, []
    if urg:
        risk += 22
        indicators.append(f"Urgency pressure ({', '.join(urg[:3])})")
    if fin:
        risk += 30
        indicators.append(f"Financial/sensitive request ({', '.join(fin[:3])})")
    if auth:
        risk += 18
        indicators.append(f"Authority impersonation cue ({', '.join(auth[:2])})")
    if sec:
        risk += 12
        indicators.append("Secrecy instruction — do-not-tell pattern")
    if 0 < len(t) < 20:
        risk += 6
        indicators.append("Very short utterance — low context confidence")
    if not t.strip():
        indicators.append("No transcript supplied — context scored from call metadata only")
    if metadata.get("firstContact"):
        risk += 8
        indicators.append("First contact from this caller")
    if metadata.get("numberSpoofSuspected"):
        risk += 15
        indicators.append("Caller-ID / number anomaly")
    if not indicators:
        indicators.append("Routine conversational pattern, no pressure tactics")
    return {"risk": max(2, min(99, round(risk))), "indicators": indicators,
            "model": "heuristic-v1 (Llama via Ollama plug-in ready)"}


def fuse_risk(clone: dict, speaker: dict | None, context: dict,
              behavioral: float, thresholds: dict) -> dict:
    voice_risk = (clone or {}).get("synthScore", 50)
    speaker_risk = (100 - speaker["similarity"]) if speaker else voice_risk * 0.4
    context_risk = (context or {}).get("risk", 30)
    score = round(voice_risk * 0.5 + speaker_risk * 0.2
                  + context_risk * 0.2 + behavioral * 0.1)
    score = max(1, min(99, score))
    level = ("CRITICAL" if score >= 80 else "HIGH" if score >= 55
             else "MEDIUM" if score >= 30 else "LOW")
    decision = ("BLOCKED" if score >= thresholds["security"]
                else "CHALLENGED" if score >= thresholds["challenge"] else "ALLOWED")
    return {"score": score, "level": level, "decision": decision,
            "challengeRequired": thresholds["challenge"] <= score < thresholds["security"],
            "breakdown": {"voiceAuthenticity": round(voice_risk),
                          "speakerVerification": round(speaker_risk),
                          "contextRisk": round(context_risk),
                          "behavioralAnomaly": round(behavioral)}}
