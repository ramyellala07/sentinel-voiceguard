"""Multilingual scam-pattern scorer over real transcripts.

English + Hindi (transliterated + Devanagari) + Telugu (transliterated +
Telugu script) keyword sets — matching the project's Indian-call focus.
Upgrade path is Llama/Ollama; shape stays identical.
"""
URGENCY = ["urgent", "immediately", "right now", "asap", "hurry", "emergency",
           "jaldi", "turant", "जल्दी", "तुरंत", "अभी",
           "ventane", "tvaraga", "వెంటనే", "త్వరగా", "అత్యవసరం"]
FINANCIAL = ["transfer", "upi", "otp", "pin", "account", "bank", "payment",
             "money", "rupees", "lakh", "crore", "refund", "kyc", "password",
             "paise", "paisa", "khata", "पैसे", "खाता", "बैंक",
             "dabbu", "డబ్బు"]
AUTHORITY = ["police", "cbi", "rbi", "officer", "government", "court",
             "income tax", "customs", "cyber cell", "पुलिस",
             "పోలీసు", "polisu"]
SECRECY = ["don't tell", "do not tell", "secret", "no one", "nobody",
           "kisi ko mat", "chup", "गुप्त", "रहस्य",
           "rahasyam", "రహస్యం", "evariki cheppaku", "ఎవరికీ చెప్పకు"]

# What is being asked for — credentials weigh heaviest, device access is the
# classic Indian remote-access scam pattern (AnyDesk/TeamViewer + "support").
CREDENTIALS = ["otp", "pin", "cvv", "password", "aadhaar", "aadhar", "pan ",
               "account number", "card number", "debit card", "credit card",
               "upi pin", "mpin", "आधार", "ओटीपी", "पासवर्ड",
               "ఓటీపీ", "పిన్", "ఆధార్"]
DEVICE_ACCESS = ["anydesk", "teamviewer", "quicksupport", "install the app",
                 "install app", "download the app", "share your screen",
                 "screen share", "give access", "remote access",
                 "एनीडेस्क", "स्क्रीन शेयर",
                 "యానీడెస్క్", "స్క్రీన్ షేర్"]
# Claimed-identity patterns: "i am X", "calling from X", "this is X".
CLAIM_PATTERNS = ["i am ", "i'm ", "this is ", "calling from ", "speaking from ",
                  "representing ", "on behalf of ", "मैं ", "నేను "]


def score_context(transcript: str = "", metadata: dict | None = None,
                  language: str = "") -> dict:
    metadata = metadata or {}
    t = (transcript or "").lower()

    def hits(words):
        return [w for w in words if w.lower() in t]

    urg, fin, auth, sec = (hits(URGENCY), hits(FINANCIAL), hits(AUTHORITY),
                           hits(SECRECY))
    cred, dev = hits(CREDENTIALS), hits(DEVICE_ACCESS)
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
    if cred:
        risk += 26
        indicators.append(f"Credential harvesting ({', '.join(cred[:3])})")
    if dev:
        risk += 24
        indicators.append(f"Remote-access / app-install request ({', '.join(dev[:2])})")
    if transcript and len(transcript.strip().split()) < 4:
        risk += 6
        indicators.append("Very short utterance — low context confidence")
    if not (transcript or "").strip():
        indicators.append("No transcript — context scored from call metadata only")
    if metadata.get("firstContact"):
        risk += 8
        indicators.append("First contact from this caller")
    if metadata.get("numberSpoofSuspected"):
        risk += 15
        indicators.append("Caller-ID / number anomaly")
    if language and language not in ("en",):
        indicators.append(f"Non-English transcript ({language}) — multilingual check")
    if not indicators:
        indicators.append("Routine conversational pattern, no pressure tactics")
    return {"risk": max(2, min(99, round(risk))), "indicators": indicators,
            "model": "keyword-v2 multilingual (Llama via Ollama plug-in ready)"}


def extract_claimed_identity(transcript: str = "") -> dict:
    """Who does the caller CLAIM to be? Returns {text, authority}.

    authority=True when the claim invokes an institution (bank/police/RBI…).
    The backend cross-checks this against the acoustic identification to flag
    impersonation: claimed authority + voice matching nobody enrolled (or a
    different person) is the classic pattern.
    """
    t = (transcript or "").lower()
    found, authority = "", False
    for pat in CLAIM_PATTERNS:
        i = t.find(pat)
        if i >= 0:
            found = t[i + len(pat):].split(".")[0].strip()[:60]
            break
    if found:
        auth_hits = [w for w in AUTHORITY if w in found or w in t]
        authority = bool(auth_hits)
    return {"text": found, "authority": authority}


def call_hour_risk(hour_ist: int | None = None) -> dict:
    """Time-of-call risk: late-night and off-hour calls are classic fraud windows."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    h = hour_ist if hour_ist is not None else datetime.now(
        ZoneInfo("Asia/Kolkata")).hour
    if 23 <= h or h < 5:
        return {"hour": h, "risk": 25, "note": f"Late-night call ({h}:00 IST)"}
    if h < 8 or h >= 21:
        return {"hour": h, "risk": 8, "note": f"Off-hours call ({h}:00 IST)"}
    return {"hour": h, "risk": 0, "note": f"Daytime call ({h}:00 IST)"}
