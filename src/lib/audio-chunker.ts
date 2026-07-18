// Decodes an audio blob and splits it into WAV chunks of a given max duration.
// This makes long recordings safe to send to the transcription API (which caps
// duration/size per request).

const TARGET_SR = 16000; // 16kHz mono — plenty for speech, keeps chunks small.

export interface AudioChunk {
  blob: Blob;
  mimeType: "audio/wav";
  index: number;
  total: number;
}

export async function chunkAudioToWav(
  input: Blob,
  maxChunkSeconds = 300, // 5 minutes per chunk
): Promise<AudioChunk[]> {
  const arrayBuffer = await input.arrayBuffer();
  // Some browsers reject `AudioContext` closed decodes; use a fresh one.
  const AC: typeof AudioContext =
    (window.AudioContext as typeof AudioContext) ||
    // @ts-expect-error webkit prefix
    (window.webkitAudioContext as typeof AudioContext);
  const ctx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close().catch(() => {});
  }

  // Downmix to mono and resample to 16kHz using an OfflineAudioContext.
  const durationSec = decoded.duration;
  const totalFrames = Math.ceil(durationSec * TARGET_SR);
  const offline = new OfflineAudioContext(1, totalFrames, TARGET_SR);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  const framesPerChunk = maxChunkSeconds * TARGET_SR;
  const chunks: AudioChunk[] = [];
  const total = Math.max(1, Math.ceil(samples.length / framesPerChunk));
  for (let i = 0; i < total; i++) {
    const start = i * framesPerChunk;
    const end = Math.min(samples.length, start + framesPerChunk);
    const view = samples.subarray(start, end);
    const wav = encodeWav16kMono(view);
    chunks.push({
      blob: new Blob([wav], { type: "audio/wav" }),
      mimeType: "audio/wav",
      index: i,
      total,
    });
  }
  return chunks;
}

function encodeWav16kMono(float32: Float32Array): ArrayBuffer {
  const numSamples = float32.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = TARGET_SR * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_SR, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function writeStr(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
