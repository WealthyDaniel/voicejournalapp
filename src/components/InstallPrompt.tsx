import { useEffect, useState } from "react";
import { getSettings } from "@/lib/pwa-settings";


type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "vj_install_dismissed_at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches;
  // @ts-expect-error iOS Safari
  const ios = window.navigator.standalone === true;
  return Boolean(mm || ios);
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (!getSettings().showInstallPrompt) return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS has no beforeinstallprompt — show instructions after a moment.
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isIOS()) {
      timer = setTimeout(() => {
        setIOS(true);
        setVisible(true);
      }, 1500);
    }

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setDeferred(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md"
        style={{ animation: "soothe-in 0.4s ease-out" }}
        role="dialog"
        aria-label="Install DearMe"
      >
        <div className="flex items-start gap-3">
          <img
            src="/icon-192.png"
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl object-contain shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-base font-medium leading-tight">
              Install DearMe
            </h3>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              {ios
                ? "Tap Share, then “Add to Home Screen” to keep DearMe one tap away."
                : "Add DearMe to your home screen for a calmer, full-screen journaling space."}
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={dismiss}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Not now
              </button>
              {!ios && (
                <button
                  onClick={() => void install()}
                  className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95"
                >
                  Install
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
