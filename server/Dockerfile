# ── Sentinel FastAPI Backend — Railway / Cloud Run Dockerfile ─────────────────
# Slim build. Uses Python 3.11-slim to keep image size small.
# Railway injects $PORT at runtime — we must NOT hardcode EXPOSE to a fixed port.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install Python dependencies ───────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ─────────────────────────────────────────────────────
COPY . .

# ── Startup ───────────────────────────────────────────────────────────────────
# Railway injects $PORT — uvicorn must bind to it.
# Default to 8080 if PORT is not set (local docker run).
CMD ["sh", "-c", "uvicorn main:socket_app --host 0.0.0.0 --port ${PORT:-8080}"]
