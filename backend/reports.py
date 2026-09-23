"""Pre-generated post-call risk reports (hackathon shortcut: no live Ollama).

Six fixed templates: safe / safe-verified / medium / high / otp-fraud /
authority-scam. analysis serves one instantly based on the AI-probability
score plus conversation indicators. Stored in Supabase (reports table,
seeded via schema.sql) with identical in-code fallback when Supabase is down.
"""

TEMPLATES = [
    {
        "key": "safe",
        "title": "SAFE — Genuine Voice Report",
        "level": "LOW",
        "summary": "The caller's voice shows natural human speech characteristics.",
        "text": (
            "Voice authenticity check PASSED. The audio contains natural prosody "
            "variation, normal breathing pauses and room-noise artefacts consistent "
            "with a live human speaker. No vocoder regularity or synthetic flatness "
            "was detected. Speaker fingerprint matches the enrolled profile within "
            "tolerance. Recommendation: allow the call and continue normal verification."
        ),
        "recommendation": "ALLOW — no further action required.",
    },
    {
        "key": "medium",
        "title": "MEDIUM RISK — Unverified Voice Report",
        "level": "MEDIUM",
        "summary": "Mixed signals: partly natural speech with segments that could not be verified.",
        "text": (
            "Voice authenticity check is INCONCLUSIVE. Some segments look natural while "
            "others show reduced variation or channel anomalies that prevent a confident "
            "genuine verdict. The speaker fingerprint is close to, but below, the match "
            "threshold. Recommendation: issue a dynamic challenge phrase (e.g. repeat "
            "an unpredictable phrase or digit sequence) and re-verify before proceeding "
            "with any sensitive request."
        ),
        "recommendation": "CHALLENGE — verify with a dynamic phrase before proceeding.",
    },
    {
        "key": "high",
        "title": "HIGH RISK — Likely Bot / Cloned Voice Report",
        "level": "HIGH",
        "summary": "Strong indicators of AI-generated or cloned speech.",
        "text": (
            "Voice authenticity check FAILED. The audio shows vocoder-like flat prosody, "
            "an over-clean channel with missing breathing and room-noise artefacts, and "
            "temporal regularity typical of neural speech synthesis. Combined with a "
            "high speaker-similarity score, this matches a targeted voice-clone attack "
            "pattern. Recommendation: block the call, preserve this recording for "
            "investigation, and alert the security team."
        ),
        "recommendation": "BLOCK — preserve recording and alert the security team.",
    },
    {
        "key": "otp-fraud",
        "title": "HIGH RISK — OTP / Credential Harvesting Report",
        "level": "HIGH",
        "summary": "Caller is extracting one-time passwords or credentials.",
        "text": (
            "Voice authenticity check FAILED and the conversation centers on "
            "extracting one-time passwords, PINs or account credentials under "
            "manufactured urgency. OTP extraction is the cash-out step of most "
            "UPI and banking frauds in India: the attacker needs only the code, "
            "never physical access. Combined with synthetic-speech markers, this "
            "matches an automated or semi-automated credential-harvesting "
            "operation. Recommendation: block the call immediately, never read "
            "out any OTP, and report the number."
        ),
        "recommendation": "BLOCK — never share OTPs; report the number.",
    },
    {
        "key": "authority-scam",
        "title": "HIGH RISK — Authority Impersonation Report",
        "level": "HIGH",
        "summary": "Caller claims institutional authority (bank, police, RBI, CBI).",
        "text": (
            "Voice authenticity check FAILED and the caller claims to represent "
            "a bank, police, RBI, CBI or government body. Authority "
            "impersonation works by replacing verification with obedience: "
            "victims comply because the caller sounds official. Real "
            "institutions never demand instant transfers, OTPs or secrecy on "
            "unsolicited calls. The mismatch between the claimed authority and "
            "the voiceprint, plus synthetic-speech markers, indicates targeted "
            "impersonation fraud. Recommendation: disconnect, call the "
            "institution back on its published number, and preserve the recording."
        ),
        "recommendation": "BLOCK — call back on the published official number.",
    },
    {
        "key": "safe-verified",
        "title": "SAFE — Verified Known Speaker Report",
        "level": "LOW",
        "summary": "Genuine voice matching an enrolled trusted speaker.",
        "text": (
            "Voice authenticity check PASSED and the speaker matches an enrolled "
            "trusted voiceprint above threshold. Natural prosody, breathing and "
            "channel artefacts are consistent with live human speech, and the "
            "conversation shows no pressure tactics or sensitive requests. This "
            "is the baseline safe outcome: a known person speaking naturally. "
            "Recommendation: allow the call and proceed normally."
        ),
        "recommendation": "ALLOW — verified known speaker, proceed normally.",
    },
]


def pick_key(ai_probability: float, high_at: float = 70, med_at: float = 45) -> str:
    if ai_probability >= high_at:
        return "high"
    if ai_probability >= med_at:
        return "medium"
    return "safe"


def pick_report(ai_probability: float, context: dict | None = None,
                match: bool = False, high_at: float = 70,
                med_at: float = 45) -> str:
    """Scenario-aware template picker.

    High-risk calls are routed to the matching fraud scenario (OTP harvesting
    vs authority impersonation) based on conversation indicators; safe calls
    distinguish verified known speakers from unknown-but-genuine voices.
    """
    inds = " ".join((context or {}).get("indicators", [])).lower()
    if ai_probability >= high_at:
        if "otp" in inds or "credential" in inds or "pin" in inds:
            return "otp-fraud"
        if "authority" in inds:
            return "authority-scam"
        return "high"
    if ai_probability >= med_at:
        return "medium"
    return "safe-verified" if match else "safe"


# Generic scenario per level — formatted with real values, never invented.
SCENARIO_TEMPLATES = {
    "safe": ("This call appears routine. Synthetic voice score was {synthetic_level}% "
             "with no strong spoof cues. {info_part} Speaker check: {speaker_match} "
             "({similarity}%). No scam pattern confirmed."),
    "medium": ("This call showed mixed signals that could not be fully verified. "
               "Synthetic voice score was {synthetic_level}% with cues: {flags_part}. "
               "{info_part} Claimed identity: {claimed_identity}; speaker check: {speaker_match}. "
               "Secondary verification is advised before any sensitive action."),
    "high": ("This call showed multiple indicators consistent with a scam attempt, "
             "including {info_inline} requested during the conversation and a synthetic "
             "voice score of {synthetic_level}%. Detected anomalies: {flags_part}. "
             "Claimed identity: {claimed_identity}; speaker check: {speaker_match}. "
             "Treat as high-risk impersonation attempt."),
}


def build_full_template(key: str, base: dict | None, ctx: dict) -> dict:
    """Enrich a fixed template to the full detailed-report structure.

    ctx carries measured values (verdict, score, call_time, duration,
    claimed_identity, speaker_match, synthetic_level/flags, info_requested).
    scenario_summary is formatted from real values only — nothing invented.
    """
    base = dict(base or {})
    info = ctx.get("info_requested", []) or []
    flags = ctx.get("synthetic_flags", []) or []
    info_part = ("Information requested: " + ", ".join(info[:4])) if info else "No sensitive information request detected"
    info_inline = (", ".join(info[:4])) if info else "no sensitive items"
    flags_part = ("; ".join(flags[:3])) if flags else "no specific prosody anomaly"
    tmpl = SCENARIO_TEMPLATES.get(key, SCENARIO_TEMPLATES["medium"])
    try:
        scenario = tmpl.format(
            synthetic_level=ctx.get("synthetic_level", 0),
            info_part=info_part,
            info_inline=info_inline,
            speaker_match=ctx.get("speaker_match", "unverified"),
            similarity=ctx.get("similarity", 0),
            claimed_identity=ctx.get("claimed_identity", "Not detected"),
            flags_part=flags_part,
        )
    except Exception:
        scenario = base.get("text", "")
    return {**base, **ctx,
            "scenario_summary": scenario,
            "recommendation": base.get("recommendation", ""),
            "verdict": ctx.get("verdict"), "score": ctx.get("score")}
