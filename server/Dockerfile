# ── Sentinel FastAPI Backend — Railway / Cloud Run Dockerfile ─────────────────
# Slim build. Uses Python 3.11-slim to keep image size small.
# PORT is injected by the platform (Railway injects 8080, Cloud Run also 8080).

FROM python:3.11-slim AS base

# System deps (curl for health-check, others for compiled packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install Python dependencies ──────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ─────────────────────────────────────────────────────
COPY . .

# ── Runtime config ────────────────────────────────────────────────────────────
# Cloud Run injects PORT; default to 8080 for local docker runs.
ENV PORT=8080

# Expose the port (documentation only for Cloud Run; CR uses $PORT at runtime)
EXPOSE 8080

# ── Health-check (Cloud Run sends to /api/health) ────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# ── Startup ───────────────────────────────────────────────────────────────────
# uvicorn's --host 0.0.0.0 and PORT env var are required by Cloud Run.
CMD ["sh", "-c", "uvicorn main:socket_app --host 0.0.0.0 --port ${PORT}"]
