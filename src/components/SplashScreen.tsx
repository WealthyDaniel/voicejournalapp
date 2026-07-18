import { useEffect, useState } from "react";

/**
 * Animated splash shown on first paint. Hides itself after a short
 * initialization window so the main UI renders behind it.
 */
export function SplashScreen({ minDurationMs = 1200 }: { minDurationMs?: number }) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setFading(true), minDurationMs);
    const t2 = window.setTimeout(() => setVisible(false), minDurationMs + 450);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [minDurationMs]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, oklch(0.55 0.22 245 / 0.35), transparent 70%), radial-gradient(ellipse 70% 40% at 50% 90%, oklch(0.45 0.2 220 / 0.3), transparent 65%)",
        }}
      />
      <div className="relative flex flex-col items-center">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full bg-primary/20 blur-2xl"
            style={{ animation: "vj-splash-pulse 1.8s ease-in-out infinite" }}
          />
          <span
            className="absolute inset-2 rounded-full border border-primary/30"
            style={{ animation: "vj-splash-ring 2.2s ease-out infinite" }}
          />
          <img
            src="/icon-192.png"
            alt=""
            width={80}
            height={80}
            className="relative h-20 w-20 rounded-2xl shadow-2xl"
            style={{ animation: "vj-splash-float 2.4s ease-in-out infinite" }}
          />
        </div>
        <p className="mt-6 font-serif text-lg tracking-wide text-foreground/90">
          Voice Journal
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Private · On-device
        </p>
      </div>
      <style>{`
        @keyframes vj-splash-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.15); }
        }
        @keyframes vj-splash-ring {
          0% { transform: scale(0.9); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes vj-splash-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
