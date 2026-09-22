import { useEffect, useRef, useState } from "react";
import { sendAudioChunk } from "../services/socket";

// Recording timer + input-level meter + REAL mic capture.
//
// - The timer/level UI works exactly as before (demo-safe, no mic needed).
// - When the browser grants mic access, we ALSO record real audio via
//   MediaRecorder: `audioBlob` is set on stop, and (if `stream` is true and a
//   backend is connected) base64 chunks stream live over Socket.IO.
// - If mic permission is denied, the hook degrades gracefully to the old
//   fake-meter behaviour so the demo never breaks.
export function useRecording({ stream = false, timesliceMs = 2000 } = {}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [micError, setMicError] = useState(null);
  const timer = useRef(null);
  const meter = useRef(null);
  const mediaRecorder = useRef(null);
  const micStream = useRef(null);
  const audioCtx = useRef(null);
  const analyser = useRef(null);
  const chunks = useRef([]);

  const stopTracks = () => {
    try { micStream.current?.getTracks()?.forEach((t) => t.stop()); } catch { /* noop */ }
    micStream.current = null;
    try { audioCtx.current?.close(); } catch { /* noop */ }
    audioCtx.current = null;
  };

  const start = async () => {
    if (recording) return;
    setRecording(true);
    setAudioBlob(null);
    setMicError(null);
    chunks.current = [];
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);

    const fakeMeter = () => {
      meter.current = setInterval(() => {
        setLevel(25 + Math.round(Math.random() * 70));
      }, 180);
    };

    try {
      // Raw mic: disable browser voice processing so live audio matches
      // Audacity enrollment conditions (no suppression/gain shaping).
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      micStream.current = mic;
      // Real level meter from the mic.
      try {
        audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.current.createMediaStreamSource(mic);
        analyser.current = audioCtx.current.createAnalyser();
        analyser.current.fftSize = 256;
        src.connect(analyser.current);
        const data = new Uint8Array(analyser.current.frequencyBinCount);
        meter.current = setInterval(() => {
          analyser.current.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            const v = Math.abs(data[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          setLevel(Math.min(100, Math.round(peak * 140)));
        }, 150);
      } catch {
        fakeMeter();
      }
      // Record (and optionally live-stream) real audio.
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const rec = new MediaRecorder(mic, mime ? { mimeType: mime } : undefined);
      mediaRecorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.current.push(e.data);
          if (stream) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = String(reader.result || "").split(",")[1];
              if (base64) sendAudioChunk(base64, rec.mimeType || "audio/webm");
            };
            reader.readAsDataURL(e.data);
          }
        }
      };
      rec.onstop = () => {
        if (chunks.current.length) {
          setAudioBlob(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
        }
      };
      rec.start(timesliceMs);
    } catch (e) {
      // Mic denied / unavailable (e.g. insecure context) — demo continues with fake meter.
      setMicError(e?.message || "mic-unavailable");
      fakeMeter();
    }
  };

  const stop = () => {
    setRecording(false);
    clearInterval(timer.current);
    clearInterval(meter.current);
    setLevel(0);
    try {
      if (mediaRecorder.current?.state !== "inactive") mediaRecorder.current?.stop();
    } catch { /* noop */ }
    stopTracks();
  };

  const reset = () => {
    stop();
    setSeconds(0);
    setAudioBlob(null);
  };

  useEffect(() => () => {
    clearInterval(timer.current);
    clearInterval(meter.current);
    try { mediaRecorder.current?.stop(); } catch { /* noop */ }
    try { micStream.current?.getTracks()?.forEach((t) => t.stop()); } catch { /* noop */ }
    try { audioCtx.current?.close(); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return { recording, seconds, duration: `${mm}:${ss}`, level, start, stop, reset, audioBlob, micError };
}
