import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteEntry,
  formatDate,
  formatDuration,
  updateEntry,
  type JournalEntry,
} from "@/lib/journal-db";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { AudioPlayer } from "./AudioPlayer";
import { getSettings } from "@/lib/pwa-settings";
import { chunkAudioToWav, blobToBase64 } from "@/lib/audio-chunker";

interface Props {
  entries: JournalEntry[];
  onChange: () => void | Promise<void>;
  query?: string;
  compact?: boolean;
  emptyMessage?: string;
}

export function EntryList({ entries, onChange, query = "", compact, emptyMessage }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const transcribeFn = useServerFn(transcribeAudio);

  async function onDelete(id: string) {
    if (!confirm("Delete this recording? This cannot be undone.")) return;
    if (openId === id) setOpenId(null);
    await deleteEntry(id);
    await onChange();
  }

  async function onRename(entry: JournalEntry) {
    const name = prompt("Rename recording", entry.title);
    if (!name || name.trim() === "" || name === entry.title) return;
    await updateEntry(entry.id, { title: name.trim() });
    await onChange();
  }

  async function transcribe(entry: JournalEntry) {
    setTranscribingId(entry.id);
    setError(null);
    try {
      await updateEntry(entry.id, { transcriptStatus: "pending", transcriptError: undefined });
      await onChange();
      const language = getSettings().transcriptionLanguage || undefined;

      // Try to split into WAV chunks for reliable long-form transcription.
      // On some mobile browsers (iOS Safari) decoding webm/opus fails; fall
      // back to sending the original blob directly when that happens.
      let parts: string[] = [];
      try {
        const chunks = await chunkAudioToWav(entry.blob, 240);
        for (const c of chunks) {
          const base64 = await blobToBase64(c.blob);
          const { text } = await transcribeFn({
            data: { audioBase64: base64, mimeType: "audio/wav", language },
          });
          parts.push(text);
          await updateEntry(entry.id, {
            transcript: parts.join(" ").trim(),
            transcriptStatus: "pending",
          });
          await onChange();
        }
      } catch (chunkErr) {
        console.warn("Chunker failed, falling back to raw blob:", chunkErr);
        const base64 = await blobToBase64(entry.blob);
        const { text } = await transcribeFn({
          data: { audioBase64: base64, mimeType: entry.mimeType || "audio/webm", language },
        });
        parts = [text];
      }

      await updateEntry(entry.id, {
        transcript: parts.join(" ").trim(),
        transcriptStatus: "done",
        transcriptError: undefined,
      });
      setExpanded((s) => new Set(s).add(entry.id));
      await onChange();
    } catch (e) {
      const msg = (e as Error).message || "Transcription failed.";
      await updateEntry(entry.id, { transcriptStatus: "error", transcriptError: msg });
      await onChange();
      setError(msg);
    } finally {
      setTranscribingId(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? "No recordings yet. Tap the mic to start your first entry."}
        </p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="space-y-2.5">
        {entries.map((entry) => {
          const isOpen = openId === entry.id;
          const isTx = transcribingId === entry.id;
          const showT = expanded.has(entry.id);
          return (
            <li
              key={entry.id}
              className="group rounded-2xl border border-border/60 bg-card/70 p-3 transition-colors hover:bg-card"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOpenId(isOpen ? null : entry.id)}
                  aria-label={isOpen ? "Close player" : "Play"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/70 text-foreground/90 hover:bg-background"
                >
                  {isOpen ? <PauseIcon /> : <PlayIcon />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium leading-tight">{entry.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatDate(entry.createdAt)}</span>
                    <span className="mx-1.5 opacity-60">•</span>
                    <span className="tabular-nums">{formatDuration(entry.durationMs)}</span>
                    {entry.transcript && (
                      <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        Text
                      </span>
                    )}
                  </p>
                </div>
                {!compact && (
                  <div className="flex shrink-0 items-center">
                    <IconButton onClick={() => void transcribe(entry)} label="Transcribe" disabled={isTx}>
                      {isTx ? <Spinner /> : <TextIcon />}
                    </IconButton>
                    <IconButton onClick={() => void onRename(entry)} label="Rename">
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => void onDelete(entry.id)} label="Delete" destructive>
                      <TrashIcon />
                    </IconButton>
                  </div>
                )}
              </div>

              {isOpen && <AudioPlayer blob={entry.blob} onClose={() => setOpenId(null)} />}

              {compact && isOpen && (
                <div className="mt-2 flex justify-end gap-1">
                  <IconButton onClick={() => void transcribe(entry)} label="Transcribe" disabled={isTx}>
                    {isTx ? <Spinner /> : <TextIcon />}
                  </IconButton>
                  <IconButton onClick={() => void onRename(entry)} label="Rename">
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => void onDelete(entry.id)} label="Delete" destructive>
                    <TrashIcon />
                  </IconButton>
                </div>
              )}

              {entry.transcriptStatus === "pending" && (
                <p className="mt-3 text-xs text-muted-foreground">Transcribing…</p>
              )}
              {entry.transcriptError && entry.transcriptStatus === "error" && (
                <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {entry.transcriptError}
                </p>
              )}
              {entry.transcript && (
                <div className="mt-3 rounded-xl bg-background/50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Transcript
                    </span>
                    <div className="flex items-center gap-3">
                      {editingId !== entry.id && (
                        <button
                          onClick={() => {
                            setEditingId(entry.id);
                            setDraft(entry.transcript ?? "");
                            setExpanded((s) => new Set(s).add(entry.id));
                          }}
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          Edit
                        </button>
                      )}
                      {editingId !== entry.id && (
                        <button
                          onClick={() => {
                            setExpanded((s) => {
                              const n = new Set(s);
                              if (n.has(entry.id)) n.delete(entry.id);
                              else n.add(entry.id);
                              return n;
                            });
                          }}
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          {showT ? "Collapse" : "Expand"}
                        </button>
                      )}
                    </div>
                  </div>
                  {editingId === entry.id ? (
                    <div>
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={Math.min(20, Math.max(6, draft.split("\n").length + 2))}
                        className="w-full resize-y rounded-md border border-border bg-background p-2 font-serif text-sm leading-relaxed outline-none focus:border-ring"
                        placeholder="Edit your transcript…"
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setDraft("");
                          }}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            const text = draft.trim();
                            await updateEntry(entry.id, {
                              transcript: text,
                              transcriptStatus: text ? "done" : "none",
                              transcriptError: undefined,
                            });
                            setEditingId(null);
                            setDraft("");
                            await onChange();
                          }}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className={`whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-foreground/90 ${
                        showT ? "" : "line-clamp-3"
                      }`}
                    >
                      {highlight(entry.transcript ?? "", query)}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts: ReactNode[] = [];
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark key={i++} className="rounded bg-primary/25 px-0.5 text-foreground">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function IconButton({
  children,
  onClick,
  label,
  destructive,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40 ${
        destructive ? "hover:text-destructive" : ""
      }`}
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeLinecap="round" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinejoin="round" />
    </svg>
  );
}
function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M4 6h16M4 12h10M4 18h16" strokeLinecap="round" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 animate-spin">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}
