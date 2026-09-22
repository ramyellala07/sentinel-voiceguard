"""Supabase client — lazy singleton (None when keys are missing).

Usage from any route:
    from db_supabase import get_supabase
    sb = get_supabase()          # None -> raise HTTPException(503, ...)
    sb.table("incidents").select("*").execute()

supabase-py is sync: call it from plain `def` routes (FastAPI threadpools them).
"""
import config

_sb = None


def get_supabase():
    global _sb
    if _sb is not None:
        return _sb
    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        return None
    from supabase import create_client

    _sb = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
    return _sb


def is_configured() -> bool:
    return bool(config.SUPABASE_URL and config.SUPABASE_KEY)
