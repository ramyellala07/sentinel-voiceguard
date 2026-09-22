"""One-time seed: upload local samples/*.wav to the audio-samples bucket.

Run once (and any time you add new local samples):
    python seed_storage.py
Re-running is safe (upsert overwrites same filenames).
"""
import os

import storage

SAMPLE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")


def main():
    files = sorted(f for f in os.listdir(SAMPLE_DIR) if f.lower().endswith(".wav"))
    if not files:
        print("no local .wav samples found")
        return
    for f in files:
        with open(os.path.join(SAMPLE_DIR, f), "rb") as fh:
            storage._bucket(storage.SAMPLES_BUCKET).upload(
                f, fh.read(), {"content-type": "audio/wav", "upsert": "true"})
        print(f"uploaded {f}")
    print(f"done: {len(files)} file(s) in '{storage.SAMPLES_BUCKET}'")


if __name__ == "__main__":
    main()
