"""Central configuration — everything comes from environment / .env."""
import os

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


def _num(name: str, fallback: float) -> float:
    try:
        return float(os.getenv(name, fallback))
    except (TypeError, ValueError):
        return fallback


PORT = int(_num("PORT", 5000))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ---- Supabase (optional: Auth / Storage / Postgres tables in schema.sql) ----
# Dashboard → Project Settings → API → Project URL + service_role key.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()

HIGH_RISK_AT = _num("HIGH_RISK_AT", 70)
MEDIUM_RISK_AT = _num("MEDIUM_RISK_AT", 45)
SIMILARITY_THRESHOLD = _num("SIMILARITY_THRESHOLD", 75)

# ---- Cloud LLM (Groq free tier) for generated risk reports ----
# console.groq.com → API Keys → paste here. Empty = template reports only.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
