# Sentinel backend — CPU cloud image (Cloud Run / Render).
# GPU is auto-used when present (code falls back to CPU otherwise).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# libgomp1: required by onnxruntime's CPU kernels on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU torch FIRST so pip keeps it (default index would pull the CUDA build).
COPY requirements.txt .
RUN pip install --no-cache-dir torch torchaudio \
        --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

# Render/HF inject $PORT; default matches HF Spaces convention.
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
