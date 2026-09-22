"""Prosodic authenticity analysis — pitch, breathing, pauses, speech rate.

Pure numpy, no new dependencies. These are the cues human analysts (and good
anti-spoofing systems) use: neural vocoders flatten pitch, skip breathing,
and place pauses too regularly; live speech is messy in measurable ways.

Entry point: analyze_prosody(samples_16k) -> {features..., cues..., prosody_risk}
prosody_risk is 0-100 (higher = more synthetic-like). Reported as its own
signal + reasons; the fused risk formula is intentionally untouched.
"""
import math


def _frames(samples, sr=16000, frame_ms=30, hop_ms=10):
    fl, hop = int(sr * frame_ms / 1000), int(sr * hop_ms / 1000)
    return [samples[i: i + fl] for i in range(0, max(1, len(samples) - fl + 1), hop)], hop / sr


def pitch_track(samples, sr=16000):
    """F0 per 10 ms hop via autocorrelation. 0.0 = unvoiced/silent."""
    import numpy as np

    wav = np.asarray(samples, dtype=np.float64)
    fl = int(sr * 0.03)
    fmin, fmax = 50, 400
    min_lag, max_lag = int(sr / fmax), int(sr / fmin)
    out = []
    for i in range(0, max(1, len(wav) - fl + 1), int(sr * 0.01)):
        fr = wav[i: i + fl]
        e = float((fr ** 2).mean())
        if e < 1e-6:
            out.append(0.0)
            continue
        fr = fr - fr.mean()
        ac = np.correlate(fr, fr, mode="full")[len(fr) - 1:]
        if ac[0] <= 0:
            out.append(0.0)
            continue
        ac = ac / ac[0]
        seg = ac[min_lag: max_lag + 1]
        k = int(np.argmax(seg)) + min_lag
        # peak strength + local-maximum check = voicing decision
        if ac[k] < 0.45 or not (ac[k] >= ac[k - 1] and ac[k] >= ac[k + 1]):
            out.append(0.0)
            continue
        out.append(round(sr / k, 1))
    return out


def pause_segmentation(samples, sr=16000):
    """Energy-VAD pause segments: [(start_s, dur_s)]. Adaptive threshold."""
    import numpy as np

    wav = np.asarray(samples, dtype=np.float64)
    fl = int(sr * 0.03)
    energies, hop = [], int(sr * 0.01)
    for i in range(0, max(1, len(wav) - fl + 1), hop):
        energies.append(float((wav[i: i + fl] ** 2).mean()))
    if not energies:
        return [], 0.0, 0.0
    nurse = sorted(energies)[max(1, len(energies) // 10)]
    thr = max(nurse * 6.0, 1e-5)
    noise_floor = float(nurse)
    pauses, cur = [], None
    for i, e in enumerate(energies):
        t = i * hop / sr
        if e < thr:
            if cur is None:
                cur = [t, t]
            else:
                cur[1] = t
        elif cur is not None:
            if cur[1] - cur[0] >= 0.12:
                pauses.append((round(cur[0], 2), round(cur[1] - cur[0], 2)))
            cur = None
    if cur is not None and cur[1] - cur[0] >= 0.12:
        pauses.append((round(cur[0], 2), round(cur[1] - cur[0], 2)))
    return pauses, noise_floor, thr


def count_breaths(samples, sr=16000, pauses=None, noise_floor=0.0, vad_thr=0.0):
    """Inhalation proxies: mid-energy bursts (0.15-0.6 s) inside pauses."""
    import numpy as np

    if pauses is None:
        pauses, noise_floor, vad_thr = pause_segmentation(samples, sr)
    wav = np.asarray(samples, dtype=np.float64)
    hop = int(sr * 0.01)
    n = 0
    for start, dur in pauses:
        if not 0.15 <= dur <= 1.2:
            continue
        seg = wav[int(start * sr): int((start + dur) * sr)]
        if len(seg) < 3:
            continue
        peak = float(np.abs(seg).max())
        # breath: clearly above room tone, clearly below speech
        if noise_floor * 4 < peak < vad_thr * 0.9 + noise_floor * 10 and peak > 0.015:
            n += 1
    return n


def analyze_prosody(samples, sr=16000, transcript=""):
    """Full prosodic workup. samples = 16 kHz mono list."""
    import numpy as np

    wav = np.asarray(samples, dtype=np.float64)
    dur = len(wav) / sr if sr else 0
    f0 = pitch_track(wav.tolist(), sr)
    voiced = [v for v in f0 if v > 0]
    pauses, noise_floor, vad_thr = pause_segmentation(wav.tolist(), sr)
    breaths = count_breaths(wav.tolist(), sr, pauses, noise_floor, vad_thr)
    words = len((transcript or "").split())
    speech_s = dur - sum(d for _, d in pauses)

    feats = {
        "pitch_mean": round(float(np.mean(voiced)), 1) if voiced else 0.0,
        "pitch_std": round(float(np.std(voiced)), 1) if len(voiced) > 1 else 0.0,
        "pitch_range": round(float(max(voiced) - min(voiced)), 1) if voiced else 0.0,
        "voiced_ratio": round(len(voiced) / max(1, len(f0)), 3),
        "pause_count": len(pauses),
        "pause_rate_per_min": round(len(pauses) / max(dur / 60, 1e-6), 1),
        "mean_pause_s": round(float(np.mean([d for _, d in pauses])), 2) if pauses else 0.0,
        "pause_ratio": round(sum(d for _, d in pauses) / max(dur, 1e-6), 3),
        "breath_count": breaths,
        "breaths_per_min": round(breaths / max(dur / 60, 1e-6), 1),
        "noise_floor": round(noise_floor, 5),
        "speech_rate_wpm": round(words / max(speech_s / 60, 1e-6)) if words else 0,
        "duration_s": round(dur, 1),
    }

    cues, risk = [], 8.0
    if voiced and feats["pitch_std"] < 15:
        cues.append(f"Flat pitch (std {feats['pitch_std']} Hz) — vocoder-like monotone")
        risk += 30
    if dur >= 8 and breaths == 0 and feats["voiced_ratio"] > 0.4:
        cues.append("No breathing detected in sustained speech — synthetic trait")
        risk += 22
    if pauses:
        cv = (float(np.std([d for _, d in pauses])) / (feats["mean_pause_s"] + 1e-9))
        if cv < 0.35 and len(pauses) >= 3:
            cues.append("Over-regular pause rhythm — machine-placed pauses")
            risk += 14
    if feats["voiced_ratio"] < 0.15 and dur >= 3:
        cues.append("Mostly unvoiced/silent — insufficient live-speech content")
        risk += 12
    if feats["speech_rate_wpm"] and feats["speech_rate_wpm"] > 200:
        cues.append(f"Pressured speech rate ({feats['speech_rate_wpm']} wpm)")
        risk += 10
    if not cues:
        cues.append("Natural pitch movement, breathing and pause irregularity present")
    return {"features": feats, "cues": cues,
            "prosody_risk": int(max(2, min(99, round(risk))))}
