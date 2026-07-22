import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  addEntry,
  formatDuration,
  listEntries,
  type JournalEntry,
} from "@/lib/journal-db";
import { hasPasscode } from "@/lib/lock";
import { LockScreen, LockSettingsButton } from "./LockScreen";
import { InstallPrompt } from "./InstallPrompt";
import { PWAUpdatePrompt } from "./PWAUpdatePrompt";
import { PWASettingsModal } from "./PWASettings";
import { SplashScreen } from "./SplashScreen";
import { EntryList } from "./EntryList";
import { BottomTabs } from "./BottomTabs";

type RecState = "idle" | "recording" | "paused";

export function VoiceJournal() {
  const [checkingLock, setCheckingLock] = useState(true);
  const [locked, setLocked] = useState(false);
  const [lockConfigured, setLockConfigured] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setShowSplash(false), 750);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    (async () => {
      const has = await hasPasscode();
      setLockConfigured(has);
      const sessionUnlocked = sessionStorage.getItem("dearme:unlocked") === "1";
      setLocked(has && !sessionUnlocked);
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
            sessionStorage.setItem("dearme:unlocked", "1");
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
      <RecorderScreen
        onLock={() => {
          sessionStorage.removeItem("dearme:unlocked");
          setLocked(true);
        }}
      />
      <InstallPrompt />
      <PWAUpdatePrompt />
    </>
  );
}

function RecorderScreen({ onLock }: { onLock: () => void }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [recState, setRecState] = useState<RecState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(24).fill(0.05));
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumMsRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

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
      const l = Math.min(1, Math.sqrt(sum / arr.length) * 2.5);
      setLevel(l);
      setLevels((prev) => {
        const next = prev.slice(1);
        next.push(Math.max(0.05, l));
        return next;
      });
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
        setLevels(new Array(24).fill(0.05));
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

  const recent = useMemo(() => entries.slice(0, 3), [entries]);
  const isRecording = recState === "recording";

  return (
    <div className="min-h-screen bg-background text-foreground pb-4">
      <div className="mx-auto max-w-md px-4 pt-6 sm:pt-10">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-medium tracking-tight">DearMe</h1>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Your private voice journal
            </p>
          </div>
          <LockSettingsButton onLock={onLock} />
        </header>

        {/* Recorder card */}
        <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card p-6 shadow-2xl">
          <h2 className="text-center font-serif text-2xl text-card-foreground">
            {isRecording ? "Listening…" : "Speak your mind"}
          </h2>

          {/* Wave visualizer */}
          <div className="mt-4 flex h-10 items-center justify-center gap-[3px]">
            {levels.map((v, i) => {
              const h = Math.max(3, Math.round(v * 34));
              return (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-foreground/60"
                  style={{ height: `${h}px`, opacity: isRecording ? 0.85 : 0.4 }}
                />
              );
            })}
          </div>

          {/* Big mic button with concentric rings */}
          <div className="relative mx-auto mt-6 flex h-64 w-64 items-center justify-center">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                aria-hidden
                className="absolute rounded-full border border-foreground/10"
                style={{
                  inset: `${i * 14}px`,
                  transform: isRecording ? `scale(${1 + level * (0.08 + i * 0.02)})` : "scale(1)",
                  transition: "transform 120ms ease-out",
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => (recState === "idle" ? void startRecording() : stopRecording())}
              aria-label={recState === "idle" ? "Start recording" : "Stop recording"}
              className="relative flex h-36 w-36 items-center justify-center rounded-full bg-foreground text-background shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] ring-4 ring-card transition-transform active:scale-95"
              style={{
                boxShadow: isRecording
                  ? "0 20px 60px -10px rgba(0,0,0,0.6), 0 0 0 8px oklch(0.75 0.06 60 / 0.15)"
                  : undefined,
              }}
            >
              {recState === "idle" ? (
                <MicIcon className="h-14 w-14" />
              ) : (
                <span className="block h-8 w-8 rounded-md bg-background" />
              )}
            </button>
          </div>

          <p className="mt-6 text-center text-[15px] font-medium text-card-foreground">
            {recState === "idle" && "Tap to start recording"}
            {isRecording && (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
                <span className="tabular-nums">{formatDuration(elapsedMs)}</span>
              </span>
            )}
            {recState === "paused" && "Paused"}
          </p>

          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldIcon />
            Private &amp; Secure
          </p>

          <div className="mt-5 flex justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={recState !== "idle"}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <UploadIcon /> Import audio
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

        {/* Recent entries */}
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight">Recent Entries</h2>
            {entries.length > 3 && (
              <Link
                to="/history"
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                See all
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            )}
          </div>

          <EntryList
            entries={recent}
            onChange={refresh}
            compact
            emptyMessage="No recordings yet. Tap the mic above to start your first entry."
          />
        </section>

        <footer className="mt-8 flex flex-col items-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
          <span>DearMe · Private, on-device</span>
        </footer>
      </div>

      <BottomTabs onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <PWASettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function MicIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3" strokeLinecap="round" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-3.5 w-3.5">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" strokeLinejoin="round" />
    </svg>
  );
}
