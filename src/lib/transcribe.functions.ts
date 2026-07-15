import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

const MIME_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Transcription is not configured on this device.");

    const buffer = base64ToArrayBuffer(data.audioBase64);
    if (buffer.byteLength < 512) {
      throw new Error("Recording is too short to transcribe.");
    }
    if (buffer.byteLength > 24 * 1024 * 1024) {
      throw new Error("Recording is too large to transcribe (max ~24MB).");
    }

    const baseMime = data.mimeType.split(";")[0].trim();
    const ext = MIME_EXT[baseMime] ?? "webm";
    const blob = new Blob([buffer], { type: baseMime || "audio/webm" });

    const form = new FormData();
    form.append("model", "openai/gpt-4o-transcribe");
    form.append("file", blob, `recording.${ext}`);

    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 402) {
        throw new Error("AI credits exhausted. Please add credits to continue.");
      }
      if (res.status === 429) {
        throw new Error("Rate limited. Please try again shortly.");
      }
      throw new Error(
        `Transcription failed (${res.status}). ${text.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? "").trim() };
  });
