import { useEffect, useRef, useState } from "react";
import { registerPwa } from "@/lib/pwa-register";
import { getSettings, onSettingsChange } from "@/lib/pwa-settings";

export function PWAUpdatePrompt() {
  const [visible, setVisible] = useState(false);
  const [reload, setReload] = useState<null | (() => Promise<void> | void)>(null);
  const [applying, setApplying] = useState(false);
  const modeRef = useRef(getSettings().updateMode);

  useEffect(() => {
    const off = onSettingsChange((s) => {
      modeRef.current = s.updateMode;
    });
    void registerPwa((doReload) => {
      const mode = modeRef.current;
      if (mode === "off") return;
      if (mode === "auto") {
        void doReload();
        return;
      }
      setReload(() => doReload);
      setVisible(true);
    });
    return off;
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex justify-center p-3"
      style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-primary/40 bg-card/95 p-4 shadow-[0_0_40px_-8px_var(--primary)] backdrop-blur-md"
        role="dialog"
        aria-label="Update available"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-foreground">
              A new version is available
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Refresh to load the latest Voice Journal.
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setVisible(false)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Later
            </button>
            <button
              disabled={applying || !reload}
              onClick={async () => {
                if (!reload) return;
                setApplying(true);
                await reload();
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-60"
            >
              {applying ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
