import { useMemo, useState } from "react";
import type { EID, EventMeta } from "./types";

export default function EventManager({
  events,
  onNew,
  onOpen,
  onDelete,
  onCopyLink,
  theme,
  setTheme,
}: {
  events: EventMeta[];
  onNew: (title?: string) => void;
  onOpen: (eid: EID) => void;
  onDelete: (eid: EID) => void;
  onCopyLink: (eid: EID) => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...events]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((e) => (q ? e.title.toLowerCase().includes(q) : true));
  }, [events, query]);

  function formatAgo(ts: number) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  return (
    <div className="min-h-screen px-4 py-6 md:py-10 bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">Liftwin — Your events</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNew()}
              className="px-3 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accentHover)] text-white text-sm"
            >
              New event
            </button>
            <select
              className="px-2 py-2 rounded-lg bg-[var(--input)] border border-[var(--border)] text-sm"
              value={theme}
              onChange={(e) => setTheme(e.target.value as "light" | "dark")}
              title="Theme"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input
            className="flex-1 bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2"
            placeholder="Search events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* List */}
        <div className="grid gap-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
              <p>No events yet.</p>
              <button
                onClick={() => onNew()}
                className="mt-3 px-3 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accentHover)] text-white text-sm"
              >
                Create your first event
              </button>
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.eid}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div>
                  <div className="text-base md:text-lg font-semibold">{e.title}</div>
                  <div className="text-xs opacity-70">Updated {formatAgo(e.updatedAt)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onOpen(e.eid)}
                    className="px-3 py-2 rounded bg-[var(--ok)] hover:bg-[var(--okHover)] text-white text-sm"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => onCopyLink(e.eid)}
                    className="px-3 py-2 rounded bg-[var(--mutedBtn)] hover:bg-[var(--mutedBtnHover)] text-sm"
                    title="Copy share link"
                  >
                    Copy share link
                  </button>
                  <button
                    onClick={() => onDelete(e.eid)}
                    className="px-3 py-2 rounded bg-[var(--danger)] hover:bg-[var(--dangerHover)] text-white text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
