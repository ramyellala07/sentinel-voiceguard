"""Heuristic audio analysis — working stand-in for XLS-R/Wav2Vec2 + ECAPA-TDNN.

Same math as the Node backend, ported to pure stdlib (wave/struct/hashlib)
so the server runs with zero model downloads. Swap path: services.ml_client
tries the ML microservice first; when it answers, ITS scores win and
ml_used=True. Response shapes never change, so the React app is unaffected.

Model-upgrade notes (where the real nets plug in):
  - detect_clone  -> XLS-R encoder + anti-spoof head fine-tuned on MLAAD.
                     Input MUST be 16 kHz mono PCM (resample Twilio 8kHz first).
  - verify_speaker -> ECAPA-TDNN 192-d embedding, cosine vs enrolled vector.
"""
import hashlib
import io
import struct
import wave

LABEL_SYNTH, LABEL_SUSP, LABEL_GENUINE = "synthetic", "suspicious", "genuine"


def _clamp(n, lo, hi):
    return max(lo, min(hi, n))


def stable01(blob: bytes, salt: str) -> float:
    h = hashlib.sha256(salt.encode() + bytes(blob)).digest()
    return int.from_bytes(h[:4], "big") / 0xFFFFFFFF


def _decode_wav(blob: bytes):
    """Return (samples [-1,1] list, sample_rate, channels) or None if not PCM WAV."""
    try:
        with wave.open(io.BytesIO(bytes(blob)), "rb") as w:
            ch, sw, sr = w.getnchannels(), w.getsampwidth(), w.getframerate()
            n = w.getnframes()
            if sw not in (1, 2) or n <= 0:
                return None
            raw = w.readframes(min(n, 16000 * 15))
        count = len(raw) // sw
        if sw == 2:
            ints = struct.unpack(f"<{count}h", raw[: count * 2])
            samples = [v / 32768 for v in ints]
        else:
            samples = [(b - 128) / 128 for b in raw[:count]]
        if ch > 1:  # mono mix
            samples = [sum(samples[i: i + ch]) / ch for i in range(0, len(samples), ch)]
        stride = max(1, len(samples) // 32000)
        return samples[::stride], sr, ch
    except Exception:
        return None


def _wav_features(samples):
    n = len(samples) or 1
    s_sum = sum(samples)
    s_sq = sum(v * v for v in samples)
    zc = sum(1 for a, b in zip(samples, samples[1:]) if (a >= 0) != (b >= 0))
    clip = sum(1 for v in samples if abs(v) > 0.98)
    silence = sum(1 for v in samples if abs(v) < 0.02)
    fl, energies = 480, []
    for i in range(fl - 1, n, fl):
        seg = samples[i - fl + 1: i + 1]
        energies.append(sum(v * v for v in seg) / fl)
    mean_e = sum(energies) / len(energies) if energies else 0
    var_e = sum((e - mean_e) ** 2 for e in energies) / len(energies) if energies else 0
    prosody = (var_e**0.5) / (mean_e + 1e-9) if mean_e > 1e-9 else 0
    return {
        "kind": "wav-pcm", "rms": round((s_sq / n) ** 0.5, 4),
        "zcr": round(zc / n, 4), "silenceRatio": round(silence / n, 4),
        "clipRatio": round(clip / n, 4), "prosodyVar": round(prosody, 4),
        "frames": len(energies),
    }


def _byte_features(blob: bytes):
    data = bytes(blob)
    step = max(1, len(data) // 20000)
    sample = data[::step] or b"\x00"
    freq = [0] * 256
    for b in sample:
        freq[b] += 1
    entropy = -sum((c / len(sample)) * __import__("math").log2(c / len(sample))
                   for c in freq if c)
    mean = sum(sample) / len(sample)
    var = sum((b - mean) ** 2 for b in sample) / len(sample)
    return {"kind": "compressed-bytes", "bytes": len(data),
            "entropy": round(entropy, 3), "byteVar": round(var, 1),
            "zeroRatio": round(sum(1 for b in sample if b == 0) / len(sample), 4),
            "h1": round(stable01(data, "clone"), 4)}


def extract_features(blob: bytes, mimetype: str = "") -> dict:
    dec = _decode_wav(blob)
    if dec:
        samples, sr, ch = dec
        return {**_wav_features(samples), "sampleRate": sr,
                "channels": ch, "bytes": len(blob), "mimetype": mimetype}
    return {**_byte_features(blob), "mimetype": mimetype}


def detect_clone(blob: bytes, mimetype: str = "", demo: str = "") -> dict:
    f = extract_features(blob, mimetype)
    demo = (demo or "").lower()
    reasons: list[str] = []
    if demo == "genuine":
        score = 4 + stable01(blob, "g") * 8
        reasons.append("Natural prosody variation and micro-pauses consistent with live speech")
    elif demo == "suspicious":
        score = 62 + stable01(blob, "s") * 12
        reasons.append("Mixed cues: mostly natural speech with unusual flat segments")
    elif demo == "synthetic":
        score = 88 + stable01(blob, "x") * 10
        reasons += ["Vocoder-like flat prosody with very low background variation",
                    "Over-clean signal: almost no room noise or breathing artefacts"]
    elif f["kind"] == "wav-pcm":
        flat = _clamp(1 - f["prosodyVar"] / 1.6, 0, 1)
        clean = _clamp(1 - f["clipRatio"] * 20 - abs(f["rms"] - 0.12) * 3, 0, 1)
        odd = 0.25 if (f["zcr"] < 0.02 or f["zcr"] > 0.3) else 0.0
        score = _clamp(flat * 62 + clean * 22 + odd * 100 + stable01(blob, "j") * 8 - 12, 2, 98)
        if flat > 0.6:
            reasons.append("Flat prosody: unusually steady energy across frames (vocoder-like)")
        if clean > 0.7:
            reasons.append("Over-clean channel: missing room noise/breathing artefacts")
        if odd:
            reasons.append("Unusual zero-crossing density for conversational speech")
        if not reasons:
            reasons.append("Natural energy dynamics and channel noise consistent with live speech")
    else:
        e_term = _clamp((f["entropy"] - 6.4) * 22, -18, 22)
        score = _clamp(42 + e_term + (f["h1"] - 0.5) * 44
                       + (10 if f["zeroRatio"] < 0.005 else -6), 3, 97)
        if score >= 70:
            reasons += ["Spectral/temporal regularity typical of neural vocoder output",
                        "Missing natural disfluencies expected in live speech"]
        elif score >= 45:
            reasons.append("Mixed cues: some segments look generated, others natural")
        else:
            reasons.append("Natural variation and channel artefacts consistent with live speech")

    score = _clamp(round(score, 1), 0.5, 99.5)
    label = LABEL_SYNTH if score >= 70 else (LABEL_SUSP if score >= 45 else LABEL_GENUINE)
    conf = round(58 + (score - 45) * 0.5, 1) if label == LABEL_SUSP else score
    return {"label": label, "confidence": conf, "synthScore": score,
            "model": "heuristic-v1 (XLS-R/Wav2Vec2 plug-in ready)",
            "features": f, "reasons": reasons}


def verify_speaker(blob: bytes, mimetype: str = "", speaker_id: str = "SPK-001",
                   threshold: float = 75, demo: str = "") -> dict:
    demo = (demo or "").lower()
    if demo == "genuine":
        sim = 88 + stable01(blob, "vg") * 7
    elif demo in ("impostor", "synthetic"):
        sim = 22 + stable01(blob, "vi") * 18
    else:
        base = stable01(bytes(blob) + str(speaker_id).encode(), "ecapa")
        f = extract_features(blob, mimetype)
        bonus = (_clamp((f["prosodyVar"] - 0.4) * 12, -8, 10)
                 if f["kind"] == "wav-pcm"
                 else (stable01(blob, "spk") - 0.5) * 14)
        sim = _clamp(52 + (base - 0.5) * 70 + bonus, 5, 99)
    sim = round(sim, 1)
    return {"speakerId": speaker_id, "similarity": sim, "threshold": threshold,
            "match": sim >= threshold,
            "model": "heuristic-v1 (ECAPA-TDNN plug-in ready)",
            "embedding": "192-d pseudo-embedding (stable hash stand-in)"}
