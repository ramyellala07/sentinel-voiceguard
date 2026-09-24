"""Central configuration — everything comes from environment / .env."""
import os

try:
    from pathlib import Path
    from dotenv import load_dotenv

    _backend_dir = Path(__file__).resolve().parent
    _root_dir = _backend_dir.parent

    # 1. Load backend .env if present
    if (_backend_dir / ".env").is_file():
        load_dotenv(_backend_dir / ".env")
    # 2. Load root .env if present
    if (_root_dir / ".env").is_file():
        load_dotenv(_root_dir / ".env")
    # 3. Fallback to standard CWD .env
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
