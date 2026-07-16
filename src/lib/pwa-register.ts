// Guarded service worker registration. Only registers in production on the
// real published origin — never in Lovable preview, iframes, or dev.

type UpdateHandler = (reload: () => Promise<void> | void) => void;

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true; // iframe (Lovable preview)
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).has("sw")) {
    if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  }
  return false;
}

async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) {
    const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
    if (url.endsWith("/sw.js")) await r.unregister();
  }
}

export async function registerPwa(onUpdate: UpdateHandler): Promise<void> {
  if (isRefusedContext()) {
    await unregisterAppSw().catch(() => {});
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox("/sw.js", { scope: "/" });

    wb.addEventListener("waiting", () => {
      onUpdate(async () => {
        wb.addEventListener("controlling", () => window.location.reload());
        await wb.messageSkipWaiting();
      });
    });

    await wb.register();
  } catch (err) {
    console.warn("PWA registration failed", err);
  }
}
