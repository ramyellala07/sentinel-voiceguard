"""Twilio endpoints — MOCK by default, REAL when TWILIO_* env vars are set.

Postman:
  POST /api/twilio/token  {"identity": "operator-demo"} -> {token, identity, mock}
  POST /api/twilio/voice  (x-www-form-urlencoded, as Twilio sends) -> TwiML XML
  GET  /api/twilio/status -> {mode, ...}

Go-live: fill TWILIO_* in server/.env, expose via ngrok (PUBLIC_BACKEND_URL),
point the Twilio number's Voice webhook at POST {PUBLIC}/api/twilio/voice.
"""
from fastapi import APIRouter, Request
from fastapi.responses import Response

import config

router = APIRouter()


@router.get("/api/twilio/status")
async def status():
    t = config.TWILIO
    return {
        "mode": "ready" if t["voice_ready"] else ("partial" if t["configured"] else "mock"),
        "voiceReady": t["voice_ready"], "configured": t["configured"],
        "phoneNumber": t["phone_number"] or "(not set)",
        "publicBackendUrl": t["public_url"],
        "hint": ("Twilio credentials present. Wire the Voice webhook + SDK."
                 if t["voice_ready"]
                 else "Set TWILIO_* in server/.env to go live. Mock mode until then."),
    }


@router.post("/api/twilio/token")
async def token(body: dict):
    identity = str((body or {}).get("identity", "operator-demo"))[:64]
    if not config.TWILIO["voice_ready"]:
        print("[twilio] token requested without credentials — returning MOCK token.")
        return {"token": "MOCK_TOKEN", "identity": identity, "mock": True}
    try:
        from twilio.jwt.access_token import AccessToken
        from twilio.jwt.access_token.grants import VoiceGrant

        t = config.TWILIO
        tok = AccessToken(t["account_sid"], t["api_key_sid"], t["api_key_secret"],
                          identity=identity, ttl=3600)
        tok.add_grant(VoiceGrant(outgoing_application_sid=t["twiml_app_sid"],
                                 incoming_allow=True))
        return {"token": tok.to_jwt(), "identity": identity, "mock": False}
    except Exception as e:  # noqa: BLE001
        from fastapi import HTTPException

        raise HTTPException(500, f"Failed to mint Twilio token: {e}")


@router.post("/api/twilio/voice")
async def voice(request: Request):
    form = await request.form()  # noqa: F841 (CallSid/From/To logged below)
    print(f"[twilio] incoming call: {dict(form)}")
    ws_url = config.TWILIO["public_url"].replace("http", "ws", 1) + "/twilio-stream"
    twiml = (f'<?xml version="1.0" encoding="UTF-8"?><Response>'
             f"<Say>Sentinel voice verification is now monitoring this call "
             f"for your safety.</Say>"
             f"<Connect><Stream url=\"{ws_url}\"/></Connect></Response>")
    return Response(twiml, media_type="text/xml")
