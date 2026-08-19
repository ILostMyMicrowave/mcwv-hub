"use client";

import { useState } from "react";
import { EMOJI_GROUPS, emojiImageUrl } from "@/lib/emojis";

// A collapsible emoji banner for message composers. Scrolls through every
// registered MCWV emoji; clicking one calls onPick(key) so the caller can
// insert the `{emoji:key}` token at the cursor.

export default function EmojiPicker({ onPick }: { onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
      >
        <span aria-hidden>😀</span>
        {open ? "Close emoji picker" : "Insert emoji"}
        <span aria-hidden className="text-zinc-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Tap an emoji to insert its {`{emoji:key}`} token
            </span>
            <span className="text-[10px] text-zinc-500">Renders in preview, DMs & inbox</span>
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 mb-1 bg-black/60 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.keys.map((key) => {
                    const src = emojiImageUrl(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        title={`{emoji:${key}}`}
                        onClick={() => onPick(key)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-1 transition hover:scale-110 hover:border-white/30 hover:bg-white/15"
                      >
                        {src ? (
                          <img src={src} alt={`:${key}:`} className="h-6 w-6 object-contain" loading="lazy" />
                        ) : (
                          <span className="text-sm">⚪</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
