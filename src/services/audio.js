// Browser-side audio conversion: any recorded/uploaded blob -> 16kHz mono WAV.
// The ECAPA backend only accepts WAV (no ffmpeg server-side), so mic flows
// MUST pass through here before upload. Uses Web Audio API only.

export async function blobToWav16k(blob) {
  if (blob?.type?.includes("wav")) return blob; // already WAV (still 44.1/48k ok — backend resamples)
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("Web Audio not supported in this browser");
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const sr = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * sr)), sr);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return encodeWav(rendered.getChannelData(0), sr);
  } finally {
    try { ctx.close(); } catch { /* noop */ }
  }
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
