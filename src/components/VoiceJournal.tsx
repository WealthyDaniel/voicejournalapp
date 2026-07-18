import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  addEntry,
  deleteEntry,
  formatDate,
  formatDuration,
  listEntries,
  updateEntry,
  type JournalEntry,
} from "@/lib/journal-db";
import { hasPasscode } from "@/lib/lock";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { AudioPlayer } from "./AudioPlayer";
import { LockScreen, LockSettingsButton } from "./LockScreen";
import { InstallPrompt } from "./InstallPrompt";
import { PWAUpdatePrompt } from "./PWAUpdatePrompt";
import { PWASettingsButton } from "./PWASettings";
import { SplashScreen } from "./SplashScreen";
import { getSettings } from "@/lib/pwa-settings";


type RecState = "idle" | "recording" | "paused";

export function VoiceJournal() {
  const [checkingLock, setCheckingLock] = useState(true);
  const [locked, setLocked] = useState(false);
  const [lockConfigured, setLockConfigured] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setShowSplash(false), 1650);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    (async () => {
      const has = await hasPasscode();
      setLockConfigured(has);
      setLocked(has);
      setCheckingLock(false);
    })();
  }, []);

  if (checkingLock) {
    return (
      <>
        {showSplash && <SplashScreen />}
        <div className="min-h-screen bg-background" />
      </>
    );
  }
  if (locked || !lockConfigured) {
    return (
      <>
        {showSplash && <SplashScreen />}
        <LockScreen
          onUnlocked={async () => {
            setLocked(false);
            setLockConfigured(await hasPasscode());
          }}
        />
      </>
    );
  }
  return (
    <>
      {showSplash && <SplashScreen />}
      <JournalApp
        onLock={() => {
          setLocked(true);
        }}
      />
      <InstallPrompt />
      <PWAUpdatePrompt />
    </>
  );
}

function JournalApp({ onLock }: { onLock: () => void }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [recState, setRecState] = useState<RecState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [expandedTranscript, setExpandedTranscript] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTranscript, setDraftTranscript] = useState("");
  const [query, setQuery] = useState("");
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

  const transcribeFn = useServerFn(transcribeAudio);

  useEffect(() => {
    void refresh();
    return () => stopStream();
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
    if (mediaRecorderRef.current?.state === "recording") {
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
        if (blob.size > 0) await saveBlob(blob, durationMs, type);
      };
      mediaRecorderRef.current = rec;
      accumMsRef.current = 0;
      startTimeRef.current = performance.now();
      rec.start(250);
      setRecState("recording");
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError((e as Error).message || "Could not access your microphone.");
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

  async function onDelete(id: string) {
    if (!confirm("Delete this recording? This cannot be undone.")) return;
    if (openId === id) setOpenId(null);
    await deleteEntry(id);
    await refresh();
  }

  async function onRename(entry: JournalEntry) {
    const name = prompt("Rename recording", entry.title);
    if (!name || name.trim() === "" || name === entry.title) return;
    await updateEntry(entry.id, { title: name.trim() });
    await refresh();
  }

  async function blobToBase64(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  async function transcribe(entry: JournalEntry) {
    setTranscribingId(entry.id);
    setError(null);
    try {
      await updateEntry(entry.id, { transcriptStatus: "pending", transcriptError: undefined });
      await refresh();
      const base64 = await blobToBase64(entry.blob);
      const language = getSettings().transcriptionLanguage || undefined;
      const { text } = await transcribeFn({
        data: {
          audioBase64: base64,
          mimeType: entry.mimeType || entry.blob.type || "audio/webm",
          language,
        },
      });
      await updateEntry(entry.id, {
        transcript: text,
        transcriptStatus: "done",
        transcriptError: undefined,
      });
      setExpandedTranscript((s) => new Set(s).add(entry.id));
      await refresh();
    } catch (e) {
      const msg = (e as Error).message || "Transcription failed.";
      await updateEntry(entry.id, {
        transcriptStatus: "error",
        transcriptError: msg,
      });
      await refresh();
      setError(msg);
    } finally {
      setTranscribingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      return (
        e.title.toLowerCase().includes(q) ||
        (e.transcript ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, query]);

  const totalDuration = useMemo(
    () => entries.reduce((sum, e) => sum + e.durationMs, 0),
    [entries],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">
              Voice Journal
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Private, on-device. Optional AI transcription.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <PWASettingsButton />
            <LockSettingsButton onLock={onLock} />
          </div>

        </header>

        {/* Recorder */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur-md">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% 20%, oklch(0.55 0.22 245 / 0.35), transparent 70%), radial-gradient(ellipse 90% 40% at 50% 100%, oklch(0.45 0.2 220 / 0.35), transparent 65%)",
            }}
          />
          <div className="relative flex flex-col items-center">
            <div className="relative flex h-44 w-44 items-center justify-center">
              <div
                className="absolute inset-0 rounded-full bg-primary/10 transition-transform duration-150"
                style={{ transform: `scale(${1 + (recState === "recording" ? level * 0.7 : 0)})` }}
              />
              <div
                className="absolute inset-6 rounded-full bg-primary/20 transition-transform duration-150"
                style={{ transform: `scale(${1 + (recState === "recording" ? level * 0.45 : 0)})` }}
              />
              <button
                onClick={() => (recState === "idle" ? void startRecording() : stopRecording())}
                className="glow-ring relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-primary to-primary/70 text-primary-foreground transition-transform hover:scale-105 active:scale-95"
                style={recState === "recording" ? { animation: "neon-pulse 1.6s ease-in-out infinite" } : undefined}
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
                  <button onClick={pauseRecording} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
                    Pause
                  </button>
                ) : (
                  <button onClick={resumeRecording} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
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
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Your recordings</h2>
            <p className="text-xs text-muted-foreground">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
              {formatDuration(totalDuration)}
            </p>
          </div>

          <div className="relative mb-3">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles and transcripts…"
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-ring"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {entries.length === 0
                  ? "No recordings yet. Tap the mic to start your first entry."
                  : "No entries match your search."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((entry) => {
                const isOpen = openId === entry.id;
                const isTx = transcribingId === entry.id;
                const showT = expandedTranscript.has(entry.id);
                return (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-border bg-card p-4 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{entry.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(entry.createdAt)} · {formatDuration(entry.durationMs)}
                          {entry.transcript && (
                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                              Transcribed
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton
                          onClick={() => setOpenId(isOpen ? null : entry.id)}
                          label={isOpen ? "Close player" : "Play"}
                        >
                          {isOpen ? <ChevronUpIcon /> : <PlayIcon />}
                        </IconButton>
                        <IconButton
                          onClick={() => void transcribe(entry)}
                          label="Transcribe"
                          disabled={isTx}
                        >
                          {isTx ? <Spinner /> : <TextIcon />}
                        </IconButton>
                        <IconButton onClick={() => void onRename(entry)} label="Rename">
                          <EditIcon />
                        </IconButton>
                        <IconButton onClick={() => void onDelete(entry.id)} label="Delete" destructive>
                          <TrashIcon />
                        </IconButton>
                      </div>
                    </div>

                    {isOpen && <AudioPlayer blob={entry.blob} onClose={() => setOpenId(null)} />}

                    {entry.transcriptStatus === "pending" && (
                      <p className="mt-3 text-xs text-muted-foreground">Transcribing…</p>
                    )}
                    {entry.transcriptError && entry.transcriptStatus === "error" && (
                      <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        {entry.transcriptError}
                      </p>
                    )}
                    {entry.transcript && (
                      <div className="mt-3 rounded-lg bg-muted/40 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Transcript
                          </span>
                          <div className="flex items-center gap-3">
                            {editingId !== entry.id && (
                              <button
                                onClick={() => {
                                  setEditingId(entry.id);
                                  setDraftTranscript(entry.transcript ?? "");
                                  setExpandedTranscript((s) => new Set(s).add(entry.id));
                                }}
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                Edit
                              </button>
                            )}
                            {editingId !== entry.id && (
                              <button
                                onClick={() => {
                                  setExpandedTranscript((s) => {
                                    const next = new Set(s);
                                    if (next.has(entry.id)) next.delete(entry.id);
                                    else next.add(entry.id);
                                    return next;
                                  });
                                }}
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                {showT ? "Collapse" : "Expand"}
                              </button>
                            )}
                          </div>
                        </div>
                        {editingId === entry.id ? (
                          <div>
                            <textarea
                              value={draftTranscript}
                              onChange={(e) => setDraftTranscript(e.target.value)}
                              rows={Math.min(20, Math.max(6, draftTranscript.split("\n").length + 2))}
                              className="w-full resize-y rounded-md border border-border bg-background p-2 font-serif text-sm leading-relaxed outline-none focus:border-ring"
                              placeholder="Edit your transcript…"
                            />
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setDraftTranscript("");
                                }}
                                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={async () => {
                                  const text = draftTranscript.trim();
                                  await updateEntry(entry.id, {
                                    transcript: text,
                                    transcriptStatus: text ? "done" : "none",
                                    transcriptError: undefined,
                                  });
                                  setEditingId(null);
                                  setDraftTranscript("");
                                  await refresh();
                                }}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p
                            className={`whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-foreground/90 ${
                              showT ? "" : "line-clamp-3"
                            }`}
                          >
                            {highlight(entry.transcript ?? "", query)}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Privacy policy */}
        <section
          aria-labelledby="privacy-heading"
          className="mt-10 rounded-2xl border border-border bg-card/60 p-5 backdrop-blur"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" strokeLinejoin="round" />
              </svg>
            </span>
            <h2 id="privacy-heading" className="font-serif text-lg font-medium">
              Your privacy
            </h2>
          </div>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              Your recordings are safe. Every voice note you make is saved{" "}
              <span className="text-foreground">only on this device</span> — just like the
              built-in recorder on your phone.
            </p>
            <p>
              There is <span className="text-foreground">no account, no cloud, and no database</span>.
              We don't upload, back up, or read your journals. They live with you, and only you.
            </p>
            <p>
              The one exception: if you tap the transcribe button, that single recording is
              sent to Lovable AI to be turned into text, then the text is stored back on your
              device. You choose when — nothing leaves your phone unless you ask for it.
            </p>
            <p className="text-xs">
              Clearing your browser data or uninstalling the app will erase your recordings,
              because they live nowhere else.
            </p>
          </div>
        </section>

        <footer className="mt-6 text-center text-xs text-muted-foreground">
          Voice Journal · Private, on-device
        </footer>
      </div>
    </div>
  );
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const parts: ReactNode[] = [];
  const re = new RegExp(`(${escapeRegExp(q)})`, "ig");
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark key={i++} className="rounded bg-primary/25 px-0.5 text-foreground">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function IconButton({
  children,
  onClick,
  label,
  destructive,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-colors hover:bg-background disabled:opacity-40 ${
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
function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
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
function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M4 6h16M4 12h10M4 18h16" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 animate-spin">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}
