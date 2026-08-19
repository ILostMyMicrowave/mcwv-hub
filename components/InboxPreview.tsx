"use client";

import { useMemo } from "react";
import { buildInboxPreview } from "@/lib/discordFormat";

// Renders the small clamped inbox-row preview: markdown markers stripped,
// placeholders resolved, and custom emojis shown as inline images so the list
// matches what you'd see once the alert is opened.

const EMOJI_TAG_RE = /<(a)?:([A-Za-z0-9_]{1,32}):(\d{15,})>/g;

function PreviewNodes({ text }: { text: string }) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    EMOJI_TAG_RE.lastIndex = 0;
    while ((m = EMOJI_TAG_RE.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
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
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text]);
  return <>{nodes}</>;
}

export default function InboxPreview({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const preview = useMemo(() => buildInboxPreview(text), [text]);
  if (!preview) return null;
  return (
    <span className={className}>
      <PreviewNodes text={preview} />
    </span>
  );
}
