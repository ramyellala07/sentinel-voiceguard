"""Supabase Storage for audio (disk stays as offline fallback).

Buckets (private, created in Dashboard -> Storage):
  audio-samples  - pre-saved demo clips for Simulate Live Call
  user-uploads   - call clips uploaded via POST /api/analyze-voice

The service_role key bypasses storage access rules: no bucket policies needed
for backend use. supabase-py storage is SYNC: async callers wrap with
asyncio.to_thread (see analysis.py / main.py).
"""
import db_supabase

SAMPLES_BUCKET = "audio-samples"
UPLOADS_BUCKET = "user-uploads"
SIGNED_URL_EXPIRY = 7 * 24 * 3600  # signed playback URLs last 7 days


def _sb():
    sb = db_supabase.get_supabase()
    if sb is None:
        raise RuntimeError("supabase not configured")
    return sb


def _bucket(name: str):
    return _sb().storage.from_(name)


# ------------------------------------------------------------ samples ---
def list_sample_files() -> list[dict]:
    """[{file, size}] from the audio-samples bucket. Raises when unreachable."""
    entries = _bucket(SAMPLES_BUCKET).list() or []
    out = []
    for e in entries:
        name = (e.get("name") or "")
        if name.lower().endswith(".wav"):
            meta = e.get("metadata") or {}
            out.append({"file": name, "size": meta.get("size", 0)})
    return sorted(out, key=lambda x: x["file"])


def download_sample(filename: str) -> bytes:
    res = _bucket(SAMPLES_BUCKET).download(filename.lstrip("/"))
    return bytes(res)


# ------------------------------------------------------------ uploads ---
def upload_clip(filename: str, blob: bytes, content_type: str = "audio/wav") -> None:
    """Upload (upsert) a user clip. Raises when unreachable."""
    _bucket(UPLOADS_BUCKET).upload(
        filename, bytes(blob),
        {"content-type": content_type or "audio/wav", "upsert": "true"})


def playback_url(bucket: str, filename: str) -> str:
    res = _bucket(bucket).create_signed_url(filename, SIGNED_URL_EXPIRY)
    return res.get("signedURL") or res.get("signedUrl") or ""
