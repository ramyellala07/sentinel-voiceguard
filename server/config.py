"""Central configuration — every setting comes from environment / .env."""
import os

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # dotenv optional; env vars still work
    pass


def _num(name: str, fallback: float) -> float:
    try:
        return float(os.getenv(name, fallback))
    except (TypeError, ValueError):
        return fallback


def _bool(name: str, fallback: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return fallback
    return v.strip().lower() in ("1", "true", "yes", "on")


PORT = int(_num("PORT", 5000))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

MONGO_URI = os.getenv("MONGO_URI", "").strip()
MONGO_DB = os.getenv("MONGO_DB", "sentinel").strip() or "sentinel"

ML_SERVICE_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8001").strip().rstrip("/")

THRESHOLDS = {
    "security": int(_num("SECURITY_THRESHOLD", 70)),
    "similarity": int(_num("SIMILARITY_THRESHOLD", 75)),
    "challenge": int(_num("CHALLENGE_THRESHOLD", 55)),
    "autoBlock": _bool("AUTO_BLOCK", True),
}

TWILIO = {
    "account_sid": os.getenv("TWILIO_ACCOUNT_SID", ""),
    "auth_token": os.getenv("TWILIO_AUTH_TOKEN", ""),
    "api_key_sid": os.getenv("TWILIO_API_KEY_SID", ""),
    "api_key_secret": os.getenv("TWILIO_API_KEY_SECRET", ""),
    "twiml_app_sid": os.getenv("TWILIO_TWIML_APP_SID", ""),
    "phone_number": os.getenv("TWILIO_PHONE_NUMBER", ""),
    "public_url": os.getenv("PUBLIC_BACKEND_URL", "http://localhost:5000").rstrip("/"),
}
TWILIO["configured"] = bool(TWILIO["account_sid"] and TWILIO["auth_token"])
TWILIO["voice_ready"] = bool(
    TWILIO["account_sid"]
    and TWILIO["api_key_sid"]
    and TWILIO["api_key_secret"]
    and TWILIO["twiml_app_sid"]
)
