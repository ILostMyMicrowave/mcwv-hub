"use client";

import { useMemo } from "react";
import { buildInboxPreview } from "@/lib/discordFormat";

// Renders the small clamped inbox-row preview: markdown markers stripped,
// placeholders resolved, and custom emojis shown as inline images so the list
// matches what you'd see once the alert is opened. When a `query` is given,
// plain-text matches are highlighted (emoji tags are never highlighted).

const EMOJI_TAG_RE = /<(a)?:([A-Za-z0-9_]{1,32}):(\d{15,})>/g;

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const pieces = useMemo(() => {
    const out: React.ReactNode[] = [];
    const lower = text.toLowerCase();
    let last = 0;
    let idx = lower.indexOf(q, 0);
    let key = 0;
    while (idx !== -1) {
      if (idx > last) out.push(text.slice(last, idx));
      out.push(
        <mark key={key++} className="rounded bg-violet-500/30 px-0.5 text-inherit">
          {text.slice(idx, idx + q.length)}
        </mark>
      );
      last = idx + q.length;
      idx = lower.indexOf(q, last);
    }
    if (last < text.length) out.push(text.slice(last));
    return out.length ? out : text;
  }, [text, q]);
  return <>{pieces}</>;
}

function PreviewNodes({ text, query }: { text: string; query: string }) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    EMOJI_TAG_RE.lastIndex = 0;
    while ((m = EMOJI_TAG_RE.exec(text))) {
      if (m.index > last)
        out.push(<Highlight key={key++} text={text.slice(last, m.index)} query={query} />);
      const [, anim, name, id] = m;
      const ext = anim ? "gif" : "png";
      out.push(
        <img
          key={key++}
          src={`https://cdn.discordapp.com/emojis/${id}.${ext}?size=24`}
          alt={`:${name}:`}
          title={`:${name}:`}
          className="inline-block h-[1em] w-[1em] align-[-0.12em]"
          loading="lazy"
        />
      );
      last = m.index + m[0].length;
    }
    if (last < text.length)
      out.push(<Highlight key={key++} text={text.slice(last)} query={query} />);
    return out;
  }, [text, query]);
  return <>{nodes}</>;
}

export default function InboxPreview({
  text,
  className,
  query = "",
}: {
  text: string;
  className?: string;
  query?: string;
}) {
  const preview = useMemo(() => buildInboxPreview(text), [text]);
  if (!preview) return null;
  return (
    <span className={className}>
      <PreviewNodes text={preview} query={query} />
    </span>
  );
}
