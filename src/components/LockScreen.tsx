import { useEffect, useState } from "react";
import {
  disableBiometric,
  enrollBiometric,
  hasPasscode,
  isBiometricEnrolled,
  isBiometricSupported,
  removeLock,
  setPasscode,
  unlockWithBiometric,
  verifyPasscode,
} from "@/lib/lock";

type Mode = "unlock" | "setup";

interface Props {
  onUnlocked: () => void;
}

export function LockScreen({ onUnlocked }: Props) {
  const [mode, setMode] = useState<Mode>("unlock");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [enableBio, setEnableBio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);

  useEffect(() => {
    (async () => {
      const has = await hasPasscode();
      setMode(has ? "unlock" : "setup");
      setBioSupported(isBiometricSupported());
      setBioEnrolled(await isBiometricEnrolled());
    })();
  }, []);

  async function tryBiometric() {
    setError(null);
    setBusy(true);
    try {
      const ok = await unlockWithBiometric();
      if (ok) onUnlocked();
      else setError("Biometric unlock failed. Use your passcode.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (mode === "unlock" && bioEnrolled) {
      // auto-prompt biometric on mount
      void tryBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, bioEnrolled]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "setup") {
        if (pass.length < 4) throw new Error("Passcode must be at least 4 characters.");
        if (pass !== confirm) throw new Error("Passcodes do not match.");
        await setPasscode(pass);
        if (enableBio && isBiometricSupported()) {
          try {
            await enrollBiometric();
          } catch (e) {
            // non-fatal
            setError(
              "Passcode saved, but biometric enrollment failed: " +
                (e as Error).message,
            );
          }
        }
        onUnlocked();
      } else {
        const ok = await verifyPasscode(pass);
        if (!ok) throw new Error("Incorrect passcode.");
        onUnlocked();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPass("");
      setConfirm("");
    }
  }

  async function resetLock() {
    if (
      !confirm ||
      !window.confirm(
        "Remove the lock? Your recordings stay, but the library becomes accessible without a passcode.",
      )
    ) {
      // note: this is only reachable in unlock mode with a hidden reset flow — kept off by default
    }
  }
  void resetLock;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <LockIcon />
          </div>
          <h1 className="mt-3 text-lg font-semibold tracking-tight">
            {mode === "setup" ? "Protect your journal" : "Voice Journal"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "setup"
              ? "Set a passcode to lock this library on this device."
              : "Enter your passcode to continue."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder={mode === "setup" ? "New passcode (min 4)" : "Passcode"}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
          />
          {mode === "setup" && (
            <input
              type="password"
              inputMode="numeric"
              placeholder="Confirm passcode"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
            />
          )}
          {mode === "setup" && bioSupported && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enableBio}
                onChange={(e) => setEnableBio(e.target.checked)}
              />
              <span>Also enable biometric unlock on this device</span>
            </label>
          )}
          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {mode === "setup" ? "Set passcode" : "Unlock"}
          </button>
          {mode === "unlock" && bioEnrolled && (
            <button
              type="button"
              onClick={tryBiometric}
              disabled={busy}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-accent"
            >
              Use biometrics
            </button>
          )}
        </form>

        {mode === "unlock" && (
          <button
            type="button"
            onClick={async () => {
              if (
                window.confirm(
                  "Forgot passcode? Remove the lock and keep all recordings? You'll set a new passcode next time.",
                )
              ) {
                await removeLock();
                setMode("setup");
                setBioEnrolled(false);
              }
            }}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:underline"
          >
            Forgot passcode?
          </button>
        )}
      </div>
    </div>
  );
}

export function LockSettingsButton({ onLock }: { onLock: () => void }) {
  const [open, setOpen] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);

  useEffect(() => {
    setBioSupported(isBiometricSupported());
    (async () => setBioEnrolled(await isBiometricEnrolled()))();
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent"
        aria-label="Lock settings"
        title="Lock settings"
      >
        <LockIcon className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">Lock settings</h2>
            <div className="mt-4 space-y-2 text-sm">
              <button
                onClick={() => {
                  setOpen(false);
                  onLock();
                }}
                className="w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-accent"
              >
                Lock now
              </button>
              {bioSupported && !bioEnrolled && (
                <button
                  onClick={async () => {
                    try {
                      await enrollBiometric();
                      setBioEnrolled(true);
                    } catch (e) {
                      alert((e as Error).message);
                    }
                  }}
                  className="w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-accent"
                >
                  Enable biometric unlock
                </button>
              )}
              {bioEnrolled && (
                <button
                  onClick={async () => {
                    await disableBiometric();
                    setBioEnrolled(false);
                  }}
                  className="w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-accent"
                >
                  Disable biometric unlock
                </button>
              )}
              <button
                onClick={async () => {
                  if (
                    window.confirm(
                      "Remove the lock entirely? The library will be accessible without a passcode.",
                    )
                  ) {
                    await removeLock();
                    setOpen(false);
                    onLock();
                  }
                }}
                className="w-full rounded-lg border border-destructive/40 px-3 py-2 text-left text-destructive hover:bg-destructive/10"
              >
                Remove lock
              </button>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="mt-4 w-full text-xs text-muted-foreground hover:underline"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function LockIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}
