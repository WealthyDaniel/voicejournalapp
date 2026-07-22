import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function BottomTabs({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <div className="h-24" aria-hidden />
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
        aria-label="Primary"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around px-4 py-2">
          <Tab to="/" active={pathname === "/"} label="Journal" icon={<MicIcon />} />
          <Tab to="/history" active={pathname.startsWith("/history")} label="History" icon={<ClockIcon />} />
          <TabButton onClick={onOpenSettings} label="Settings" icon={<GearIcon />} />
        </ul>
      </nav>
    </>
  );
}

function Tab({ to, active, label, icon }: { to: string; active: boolean; label: string; icon: ReactNode }) {
  return (
    <li className="flex-1">
      <Link
        to={to}
        className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition-colors ${
          active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <span className="h-5 w-5">{icon}</span>
        <span>{label}</span>
      </Link>
    </li>
  );
}

function TabButton({ onClick, label, icon }: { onClick?: () => void; label: string; icon: ReactNode }) {
  return (
    <li className="flex-1">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="h-5 w-5">{icon}</span>
        <span>{label}</span>
      </button>
    </li>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3" strokeLinecap="round" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
