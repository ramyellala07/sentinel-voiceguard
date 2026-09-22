"""Sentinel FastAPI backend — entry point.

Run (from voiceguard-ai/server):
    pip install -r requirements.txt
    copy .env.example .env        # fill MONGO_URI for Atlas, else memory mode
    uvicorn main:socket_app --port 5000 --reload

Drop-in replacement for the Node backend: same REST paths, same Socket.IO
event names — the React frontend needs NO changes (it already points at
VITE_BACKEND_URL / VITE_SOCKET_URL = http://localhost:5000).
"""
import socketio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import config
import sockets
from routers import analyze, dashboard, health, twilio

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

app = FastAPI(title="Sentinel backend (FastAPI + MongoDB)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_URL, "http://localhost:5173",
                   "http://localhost:5174"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(dashboard.router)
app.include_router(analyze.router)
app.include_router(twilio.router)


@app.get("/")
async def root():
    return {"service": "sentinel-fastapi", "docs": "/docs",
            "health": "/api/health", "frontend": config.FRONTEND_URL}


@app.websocket("/twilio-stream")
async def twilio_stream(ws: WebSocket):
    """Twilio Media Streams endpoint (Twilio <Stream> connects here).

    Frames are JSON text: {"event":"media","media":{"payload":"<base64 μ-law>"}}.
    Next step: decode μ-law 8kHz -> resample 16kHz PCM -> feed sockets._pipeline.
    """
    await ws.accept()
    print("[twilio-stream] media stream connected")
    total = 0
    try:
        while True:
            msg = await ws.receive_json()
            ev = msg.get("event")
            if ev == "media" and (msg.get("media") or {}).get("payload"):
                import base64

                total += len(base64.b64decode(msg["media"]["payload"]))
            elif ev == "start":
                print(f"[twilio-stream] call started: {(msg.get('start') or {}).get('callSid')}")
            elif ev == "stop":
                print(f"[twilio-stream] call stopped. ~{total} bytes received.")
    except WebSocketDisconnect:
        print("[twilio-stream] disconnected")
    except Exception as e:  # noqa: BLE001
        print(f"[twilio-stream] error: {e}")


sockets.attach(sio)
socket_app = socketio.ASGIApp(sio, app)  # uvicorn target: main:socket_app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:socket_app", host="0.0.0.0", port=config.PORT, reload=True)
