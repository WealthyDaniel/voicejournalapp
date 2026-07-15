import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { formatDuration } from "@/lib/journal-db";

interface Props {
  blob: Blob;
  onClose: () => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function AudioPlayer({ blob, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const urlRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;
    const url = URL.createObjectURL(blob);
    urlRef.current = url;

    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue("--primary").trim() || "oklch(0.5 0.15 260)";
    const muted = style.getPropertyValue("--muted-foreground").trim() || "#888";

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      waveColor: muted,
      progressColor: primary,
      cursorColor: primary,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      height: 56,
      normalize: true,
    });
    wsRef.current = ws;

    ws.on("ready", () => {
      setReady(true);
      setDuration(ws.getDuration());
    });
    ws.on("timeupdate", (t) => setCurrent(t));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    return () => {
      ws.destroy();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      wsRef.current = null;
    };
  }, [blob]);

  function toggle() {
    wsRef.current?.playPause();
  }
  function skip(delta: number) {
    const ws = wsRef.current;
    if (!ws) return;
    const t = Math.max(0, Math.min(ws.getDuration(), ws.getCurrentTime() + delta));
    ws.setTime(t);
  }
  function changeSpeed(s: number) {
    setSpeed(s);
    wsRef.current?.setPlaybackRate(s, true);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3">
      <div ref={containerRef} className="w-full" />
      <div className="mt-2 flex items-center justify-between text-xs font-mono tabular-nums text-muted-foreground">
        <span>{formatDuration(current * 1000)}</span>
        <span>{formatDuration(duration * 1000)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => skip(-10)}
          disabled={!ready}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-40"
          aria-label="Back 10 seconds"
          title="Back 10s"
        >
          <Skip10 direction="back" />
        </button>
        <button
          onClick={toggle}
          disabled={!ready}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => skip(10)}
          disabled={!ready}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-40"
          aria-label="Forward 10 seconds"
          title="Forward 10s"
        >
          <Skip10 direction="fwd" />
        </button>
        <div className="mx-2 h-6 w-px bg-border" />
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                speed === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Skip10({ direction }: { direction: "back" | "fwd" }) {
  const flip = direction === "back" ? "scale-x-[-1]" : "";
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-5 w-5 ${flip}`}>
        <path d="M4 12a8 8 0 1 0 3-6.24" strokeLinecap="round" />
        <path d="M4 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="absolute text-[8px] font-bold">10</span>
    </div>
  );
}
