"""Cloud-LLM risk reports (Groq free tier, OpenAI-compatible API).

Takes everything the pipeline measured and returns a full seven-section
narrative report (verdict+score, call time/duration, claimed identity+match,
synthetic level+flags, info requested, scenario summary, recommendation).
Any failure (no key, no network, rate limit) -> None, and the caller serves
the pre-made template instead. Offline-safe by design.
"""
import config

ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
TIMEOUT_S = 40


def _build_prompt(p: dict) -> str:
    idn = (f"{p['identified_name']} ({p['identified_as']}, "
           f"{p['similarity']}%)" if p.get("identified_as")
           else f"UNKNOWN (best match {p.get('similarity', 0)}%)")
    claim = p.get("claimed_identity") or {}
    return f"""Using ONLY the measured data provided below, write a complete call risk report with these exact sections in order:
1. Verdict (ALLOW/CHALLENGE/BLOCK) and risk score (0-100)
2. Call time and duration
3. Claimed caller identity, and whether it matches the verified voice profile
4. Synthetic voice level (%) with 2-3 specific detected anomalies from the prosody data
5. Information requested during the call (list the specific items detected: OTP, bank details, remote access, etc.)
6. Scenario summary: a 4-6 sentence paragraph in plain language describing what happened during the call, referencing approximately when key moments occurred
7. Recommendation for the user

Never invent facts not present in the measured data provided. If a field has no data, write 'Not detected' instead of guessing. Do not add scores or claims beyond what is given. Keep it under 300 words.

MEASURED DATA:
- Session: {p['session_id']} | Time: {p.get('timestamp', 'n/a')} | Language: {p.get('language', 'n/a')}
- Transcript: "{p.get('transcript', '')[:600]}"
- AI-generation probability: {p['ai_probability']}% (model: {p.get('clone_model', 'wav2vec2')})
- Speaker: {idn} (match threshold {p.get('threshold', 75)}%)
- Claimed identity in call: "{claim.get('text', '')}" (authority claim: {claim.get('authority', False)}); impersonation flag: {p.get('impersonation', False)}
- Context risk: {p['context_risk']}/100; indicators: {'; '.join(p.get('context_indicators', [])[:4])}
- Prosody risk: {p.get('prosody_risk', 0)}/100; cues: {'; '.join(p.get('prosody_cues', [])[:3])}
- Pitch: {p.get('pitch', {})}; pauses: {p.get('pauses', 0)}; breaths: {p.get('breaths', 0)}; speech rate: {p.get('wpm', 0)} wpm
- Fusion weights used: voice 0.50, speaker 0.20, context 0.20, behavioral 0.10 -> final {p['risk_score']}/100 ({p['level']})
- Duration: {p.get('duration', 'Not detected')}s
- Verdict: {p.get('verdict', p.get('action', 'Review'))}
- System recommendation: {p.get('action', 'Review')}"""


async def generate_report(payload: dict) -> dict | None:
    """Returns {title, text, model, generated: True} or None on any failure."""
    if not config.GROQ_API_KEY:
        return None
    import httpx

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as c:
            r = await c.post(
                ENDPOINT,
                headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
                json={"model": config.GROQ_MODEL,
                      "messages": [{"role": "user",
                                    "content": _build_prompt(payload)}],
                      "temperature": 0.2, "max_tokens": 700})
            r.raise_for_status()
            text = (r.json()["choices"][0]["message"]["content"] or "").strip()
            if not text:
                return None
            return {"title": f"AI-GENERATED RISK REPORT — {payload['level']}",
                    "level": payload["level"], "text": text,
                    "recommendation": payload.get("action", "Review"),
                    "model": config.GROQ_MODEL, "generated": True}
    except Exception as e:  # noqa: BLE001 — template fallback covers everything
        print(f"  [llm] Groq report failed ({str(e)[:120]}) — template fallback")
        return None
