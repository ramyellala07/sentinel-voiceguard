"""Operator auth via Supabase Auth — backend-owned.

The frontend never holds Supabase keys: it POSTs email/password here and gets
a JWT back, then sends it as `Authorization: Bearer` (see api.js tryBackend).
Middleware in main.py enforces it on every /api/* route except health/docs/
auth/uploads. Users are created in Supabase Dashboard → Authentication → Users
(or SQL); no signup endpoint on purpose (controlled operator list).
"""
import db_supabase


def _sb():
    sb = db_supabase.get_supabase()
    if sb is None:
        raise RuntimeError("Supabase not configured")
    return sb


def login_user(email: str, password: str) -> dict:
    res = _sb().auth.sign_in_with_password({"email": email.strip(),
                                            "password": password})
    if not res.session or not res.user:
        raise ValueError("Invalid email or password")
    return {"access_token": res.session.access_token,
            "token_type": "bearer",
            "user": {"id": res.user.id, "email": res.user.email}}


def verify_token(token: str) -> dict:
    res = _sb().auth.get_user(token)
    if not res or not res.user:
        raise ValueError("Invalid session")
    return {"id": res.user.id, "email": res.user.email}
