import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listEntries, type JournalEntry, formatDuration } from "@/lib/journal-db";
import { EntryList } from "@/components/EntryList";
import { BottomTabs } from "@/components/BottomTabs";
import { PWASettingsModal } from "@/components/PWASettings";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — DearMe" },
      { name: "description", content: "Browse and listen to your older voice journal entries." },
      { property: "og:title", content: "History — DearMe" },
      { property: "og:description", content: "Browse and listen to your older voice journal entries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function refresh() {
    setEntries(await listEntries());
  }
  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.title.toLowerCase().includes(q) || (e.transcript ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  const totalDuration = useMemo(
    () => entries.reduce((s, e) => s + e.durationMs, 0),
    [entries],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-4 pt-6 sm:pt-10">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-medium tracking-tight">History</h1>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} · {formatDuration(totalDuration)}
            </p>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-border bg-card/70 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back
          </Link>
        </header>

        <div className="relative mb-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles and transcripts…"
            className="w-full rounded-xl border border-border/70 bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>

        <EntryList
          entries={filtered}
          onChange={refresh}
          query={query}
          emptyMessage={
            entries.length === 0
              ? "No recordings yet. Head to Record to start your first entry."
              : "No entries match your search."
          }
        />

        <div className="h-4" />
      </div>

      <BottomTabs onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <PWASettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
