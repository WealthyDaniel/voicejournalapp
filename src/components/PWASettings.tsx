import { useEffect, useState } from "react";
import {
  LANGUAGES,
  getSettings,
  setSettings,
  type PWASettings,
} from "@/lib/pwa-settings";

export function PWASettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="App settings"
        title="App settings"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground backdrop-blur hover:text-foreground"
      >
        <GearIcon />
      </button>
      {open && <PWASettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function PWASettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setLocal] = useState<PWASettings>(() => getSettings());
  const [installed, setInstalled] = useState<boolean>(false);
  const [swActive, setSwActive] = useState<boolean>(false);

  useEffect(() => {
    setInstalled(
      window.matchMedia?.("(display-mode: standalone)").matches ||
        // @ts-expect-error iOS Safari
        window.navigator.standalone === true,
    );
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((rs) => {
        setSwActive(rs.some((r) => (r.active?.scriptURL || "").endsWith("/sw.js")));
      });
    }
  }, []);

  function update(patch: Partial<PWASettings>) {
    setLocal(setSettings(patch));
  }

  async function clearCaches() {
    if (!confirm("Clear cached app files? Your recordings are safe.")) return;
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    location.reload();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="App settings"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-serif text-lg font-medium">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-5 py-5">
          {/* Language */}
          <section>
            <SectionTitle>Transcription language</SectionTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose the spoken language for better accuracy, or let it detect automatically.
            </p>
            <select
              value={settings.transcriptionLanguage}
              onChange={(e) => update({ transcriptionLanguage: e.target.value })}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code || "auto"} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </section>

          {/* Updates */}
          <section>
            <SectionTitle>App updates</SectionTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              How to handle new versions of the app.
            </p>
            <div className="mt-2 space-y-2">
              {(
                [
                  ["toast", "Show refresh toast", "Notify me when a new version is ready."],
                  ["auto", "Auto-refresh silently", "Reload as soon as an update is downloaded."],
                  ["off", "Don't notify me", "Never show update prompts."],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                    settings.updateMode === value
                      ? "border-primary/60 bg-primary/10"
                      : "border-border hover:bg-accent/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="updateMode"
                    value={value}
                    checked={settings.updateMode === value}
                    onChange={() => update({ updateMode: value })}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Install prompt */}
          <section>
            <SectionTitle>Install prompt</SectionTitle>
            <label className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <span>
                <span className="block font-medium">Show install banner</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Suggest adding Voice Journal to your home screen.
                </span>
              </span>
              <Switch
                checked={settings.showInstallPrompt}
                onChange={(v) => update({ showInstallPrompt: v })}
              />
            </label>
          </section>

          {/* Status */}
          <section>
            <SectionTitle>Status</SectionTitle>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>Installed as app: <b className="text-foreground">{installed ? "Yes" : "No"}</b></li>
              <li>Offline cache active: <b className="text-foreground">{swActive ? "Yes" : "No"}</b></li>
            </ul>
            <button
              onClick={() => void clearCaches()}
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
            >
              Clear offline cache & reload
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Your recordings and transcripts stay on this device — cache clearing only removes app files.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
