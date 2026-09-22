"""Demo seed — same data the React frontend used in mock mode."""
from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def now_time() -> str:
    return datetime.now(IST).strftime("%H:%M:%S")


def seed_state() -> dict:
    return {
        "stats": {"activeCalls": 12, "threatsDetected": 7,
                  "highRiskEvents": 3, "detectionAccuracy": 96.8},
        "events": [
            {"id": "EVT-9841", "time": "10:42:13", "caller": "Unknown Caller",
             "speakerMatch": "Failed", "aiDetection": "Synthetic", "riskScore": 92,
             "context": "Financial Request", "action": "Blocked", "status": "CRITICAL"},
            {"id": "EVT-9839", "time": "10:39:21", "caller": "Rahul",
             "speakerMatch": "Verified", "aiDetection": "Genuine", "riskScore": 8,
             "context": "Normal Call", "action": "Allowed", "status": "SAFE"},
            {"id": "EVT-9835", "time": "10:35:47", "caller": "Unknown Caller",
             "speakerMatch": "Matched", "aiDetection": "Suspicious", "riskScore": 74,
             "context": "Urgent Transfer", "action": "Challenge", "status": "WARNING"},
            {"id": "EVT-9831", "time": "10:31:02", "caller": "Priya S.",
             "speakerMatch": "Verified", "aiDetection": "Genuine", "riskScore": 12,
             "context": "Support Call", "action": "Allowed", "status": "SAFE"},
            {"id": "EVT-9827", "time": "10:27:55", "caller": "Unknown Caller",
             "speakerMatch": "Failed", "aiDetection": "Synthetic", "riskScore": 88,
             "context": "OTP Request", "action": "Blocked", "status": "CRITICAL"},
        ],
        "incidents": [
            {"id": "INC-2026-0413", "time": "10:42:13", "type": "Voice Clone",
             "caller": "Unknown", "risk": 92, "method": "Wav2Vec 2.0 + Challenge",
             "action": "Blocked", "status": "Resolved"},
            {"id": "INC-2026-0411", "time": "10:27:55", "type": "Synthetic OTP Fraud",
             "caller": "Unknown", "risk": 88, "method": "Wav2Vec 2.0",
             "action": "Blocked", "status": "Resolved"},
            {"id": "INC-2026-0408", "time": "10:05:19", "type": "Impersonation",
             "caller": "Spoofed Rahul", "risk": 74, "method": "ECAPA-TDNN + Context",
             "action": "Challenged", "status": "Under Review"},
            {"id": "INC-2026-0399", "time": "09:48:02", "type": "Robocall Clone",
             "caller": "Unknown", "risk": 67, "method": "Wav2Vec 2.0",
             "action": "Challenged", "status": "Under Review"},
            {"id": "INC-2026-0395", "time": "09:21:44", "type": "Voice Clone",
             "caller": "Unknown", "risk": 95, "method": "Full Pipeline",
             "action": "Blocked + Alert", "status": "Escalated"},
            {"id": "INC-2026-0390", "time": "08:57:31", "type": "Normal (False Alarm)",
             "caller": "Priya S.", "risk": 22, "method": "ECAPA-TDNN",
             "action": "Allowed", "status": "Closed"},
        ],
        "models": [
            {"name": "Voice Clone Detection", "model": "XLS-R + Wav2Vec 2.0",
             "accuracy": 96.8, "precision": 95.4, "recall": 97.1, "f1": 96.2},
            {"name": "Speaker Verification", "model": "ECAPA-TDNN",
             "accuracy": 95.2, "precision": 94.1, "recall": 96.0, "f1": 95.0},
            {"name": "Context Analysis", "model": "Llama via Ollama",
             "accuracy": 91.6, "precision": 89.8, "recall": 92.4, "f1": 91.1},
        ],
        "threat": {
            "threatId": "THR-2026-0917",
            "timestamp": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S") + " IST",
            "caller": "Unknown Caller (+91 ••• ••• 4413)",
            "voiceAuthenticity": 94.2, "speakerSimilarity": 91.8,
            "contextRisk": 88, "behavioralAnomaly": 82,
            "finalRisk": 92, "decision": "BLOCKED",
            "reasons": [
                "Synthetic speech characteristics (vocoder artefacts, flat prosody)",
                "High speaker similarity — likely targeted voice clone",
                "Sensitive financial request with urgency pressure",
                "Unusual interaction pattern vs. caller history",
            ],
        },
        "speakers": {
            "SPK-001": {"id": "SPK-001", "name": "Rahul Sharma", "threshold": 75,
                        "enrolledOn": "2026-08-12", "samples": 3,
                        "embedding": None},  # 192 floats once ECAPA enrols
        },
        "challenge_phrases": ["Blue river seven nine", "Seven three nine one",
                              "Crimson falcon forty two"],
        "counters": {"evt": 9842, "inc": 414},
    }
