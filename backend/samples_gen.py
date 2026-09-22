"""Generate 3 deterministic demo samples for Simulate-Live-Call.

  sample-genuine.wav    lively prosody + noise + pauses  -> LOW score
  sample-suspicious.wav mixed halves                    -> MEDIUM score
  sample-synthetic.wav  flat steady tone, ultra clean   -> HIGH score

Run once:  python samples_gen.py
"""
import math
import random
import struct
import wave

SR = 16000


def write_wav(path, samples):
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(struct.pack(f"<{len(samples)}h",
                                  *[max(-32768, min(32767, int(v * 32767)))
                                    for v in samples]))


def tone(t, freq, amp=0.5):
    return amp * math.sin(2 * math.pi * freq * t)


def genuine(sec=4):
    rnd = random.Random(11)
    out, n = [], int(SR * sec)
    for i in range(n):
        t = i / SR
        syll = int(t * 3.5)                      # syllable-ish chunks
        f = 140 + 60 * math.sin(syll * 1.7) + 25 * math.sin(t * 9)
        v = 0.42 * math.sin(2 * math.pi * f * t) + 0.15 * tone(t, f * 2.02, 1)
        v += rnd.gauss(0, 0.05)                  # room noise
        if int(t * 2) % 5 == 4:                  # pauses/breaths
            v *= 0.12
        out.append(v * (0.55 + 0.45 * abs(math.sin(t * 2.2))))  # lively envelope
    return out


def synthetic(sec=4):
    n = int(SR * sec)
    return [0.5 * math.sin(2 * math.pi * 196 * i / SR)
            + 0.08 * math.sin(2 * math.pi * 392 * i / SR) for i in range(n)]


def suspicious(sec=4):
    g, s = genuine(sec // 2), synthetic(sec // 2 + 1)
    return (g + s)[: SR * sec]


if __name__ == "__main__":
    import os

    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")
    os.makedirs(d, exist_ok=True)
    write_wav(os.path.join(d, "sample-genuine.wav"), genuine())
    write_wav(os.path.join(d, "sample-suspicious.wav"), suspicious())
    write_wav(os.path.join(d, "sample-synthetic.wav"), synthetic())
    print("samples written:", sorted(os.listdir(d)))
