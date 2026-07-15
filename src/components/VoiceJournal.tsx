import { useEffect, useMemo, useRef, useState } from "react";
import {
  addEntry,
  deleteEntry,
  formatDate,
  formatDuration,
  listEntries,
  renameEntry,
  type JournalEntry,
} from "@/lib/journal-db";

type RecState = "idle" | "recording" | "paused";

export function VoiceJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [recState, setRecState] = useState<RecState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumMsRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    void refresh();
    return () => {
      stopStream();
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    };
  }, []);

  async function refresh() {
    try {
      setEntries(await listEntries());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function stopStream() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function tick() {
    if (recState === "recording" || mediaRecorderRef.current?.state === "recording") {
      const now = performance.now();
      setElapsedMs(accumMsRef.current + (now - startTimeRef.current));
    }
    if (analyserRef.current) {
      const arr = new Uint8Array(analyserRef.current.fftSize);
      analyserRef.current.getByteTimeDomainData(arr);
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = (arr[i] - 128) / 128;
        sum += v * v;
      }
      setLevel(Math.min(1, Math.sqrt(sum / arr.length) * 2.5));
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function pickMime(): string {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const durationMs = accumMsRef.current;
        stopStream();
        setRecState("idle");
        setElapsedMs(0);
        accumMsRef.current = 0;
        setLevel(0);
        if (blob.size > 0) {
          await saveBlob(blob, durationMs, type);
        }
      };
      mediaRecorderRef.current = rec;
      accumMsRef.current = 0;
      startTimeRef.current = performance.now();
      rec.start(250);
      setRecState("recording");
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(
        (e as Error).message ||
          "Could not access your microphone. Check browser permissions.",
      );
      stopStream();
    }
  }

  function pauseRecording() {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    accumMsRef.current += performance.now() - startTimeRef.current;
    setRecState("paused");
  }

  function resumeRecording() {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== "paused") return;
    startTimeRef.current = performance.now();
    rec.resume();
    setRecState("recording");
  }

  function stopRecording() {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      accumMsRef.current += performance.now() - startTimeRef.current;
    }
    if (rec.state !== "inactive") rec.stop();
  }

  async function saveBlob(blob: Blob, durationMs: number, mimeType: string) {
    const now = Date.now();
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      title: defaultTitle(now),
      createdAt: now,
      durationMs,
      mimeType,
      blob,
    };
    await addEntry(entry);
    await refresh();
  }

  function defaultTitle(ts: number): string {
    const d = new Date(ts);
    return `Entry — ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("audio/")) continue;
      const durationMs = await probeDuration(file).catch(() => 0);
      await saveBlob(file, durationMs, file.type);
    }
    await refresh();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function probeDuration(file: Blob): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const ms = isFinite(audio.duration) ? audio.duration * 1000 : 0;
        URL.revokeObjectURL(url);
        resolve(ms);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read audio"));
      };
      audio.src = url;
    });
  }

  function play(entry: JournalEntry) {
    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    const url = URL.createObjectURL(entry.blob);
    currentUrlRef.current = url;
    setPlayingId(entry.id);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
    }, 0);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this recording? This cannot be undone.")) return;
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
    await deleteEntry(id);
    await refresh();
  }

  async function onRename(entry: JournalEntry) {
    const name = prompt("Rename recording", entry.title);
    if (!name || name.trim() === "" || name === entry.title) return;
    await renameEntry(entry.id, name.trim());
    await refresh();
  }

  const totalDuration = useMemo(
    () => entries.reduce((sum, e) => sum + e.durationMs, 0),
    [entries],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MicIcon />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Voice Journal</h1>
              <p className="text-sm text-muted-foreground">
                Private recordings, saved on this device only.
              </p>
            </div>
          </div>
        </header>

        {/* Recorder card */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="relative flex h-40 w-40 items-center justify-center">
              <div
                className="absolute inset-0 rounded-full bg-primary/10 transition-transform"
                style={{
                  transform: `scale(${1 + (recState === "recording" ? level * 0.6 : 0)})`,
                }}
              />
              <div
                className="absolute inset-4 rounded-full bg-primary/15 transition-transform"
                style={{
                  transform: `scale(${1 + (recState === "recording" ? level * 0.35 : 0)})`,
                }}
              />
              <button
                onClick={() => {
                  if (recState === "idle") void startRecording();
                  else stopRecording();
                }}
                className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
                aria-label={recState === "idle" ? "Start recording" : "Stop recording"}
              >
                {recState === "idle" ? (
                  <MicIcon className="h-9 w-9" />
                ) : (
                  <span className="block h-6 w-6 rounded-sm bg-primary-foreground" />
                )}
              </button>
            </div>

            <div className="mt-4 font-mono text-3xl tabular-nums">
              {formatDuration(elapsedMs)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              {recState === "idle" && "Tap to record"}
              {recState === "recording" && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
                  Recording
                </span>
              )}
              {recState === "paused" && "Paused"}
            </div>

            {recState !== "idle" && (
              <div className="mt-4 flex gap-2">
                {recState === "recording" ? (
                  <button
                    onClick={pauseRecording}
                    className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={resumeRecording}
                    className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                  >
                    Resume
                  </button>
                )}
              </div>
            )}

            <div className="mt-6 flex w-full items-center gap-3 text-sm">
              <div className="h-px flex-1 bg-border" />
              <span className="text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={recState !== "idle"}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <UploadIcon />
              Import audio file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files)}
            />
          </div>

          {error && (
            <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </section>

        {/* Library */}
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Your recordings</h2>
            <p className="text-xs text-muted-foreground">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
              {formatDuration(totalDuration)}
            </p>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No recordings yet. Tap the mic to start your first entry.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{entry.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)} · {formatDuration(entry.durationMs)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton onClick={() => play(entry)} label="Play">
                        <PlayIcon />
                      </IconButton>
                      <IconButton onClick={() => void onRename(entry)} label="Rename">
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => void onDelete(entry.id)}
                        label="Delete"
                        destructive
                      >
                        <TrashIcon />
                      </IconButton>
                    </div>
                  </div>
                  {playingId === entry.id && (
                    <audio
                      ref={audioRef}
                      controls
                      className="mt-3 w-full"
                      onEnded={() => setPlayingId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          Everything stays on this device. Clearing your browser data will delete your recordings.
        </footer>
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-colors hover:bg-background ${
        destructive ? "text-destructive hover:border-destructive/30" : ""
      }`}
    >
      {children}
    </button>
  );
}

function MicIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3" strokeLinecap="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeLinecap="round" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinejoin="round" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
