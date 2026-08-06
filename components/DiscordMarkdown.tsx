"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { parseDiscordMarkdown } from "@/lib/discordFormat";
import type { MdSegment } from "@/lib/discordFormat";

// Renders Discord-flavoured markdown the way Discord would — used by the
// alert inbox hero and the admin broadcast composer preview. Built from
// structured segments (never dangerouslySetInnerHTML), so it's XSS-free by
// construction: any plain text stays plain text.

function Spoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setRevealed((v) => !v);
      }}
      title={revealed ? "Hide spoiler" : "Tap to reveal spoiler"}
      className={`rounded px-1.5 transition ${
        revealed
          ? "bg-zinc-800/80 text-zinc-100"
          : "select-none bg-zinc-900 text-transparent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
      }`}
    >
      {text}
    </button>
  );
}

function Segments({ segments }: { segments: MdSegment[] }) {
  const nodes: ReactNode[] = segments.map((seg, i) => {
    switch (seg.kind) {
      case "bold":
        return (
          <strong key={i} className="font-bold text-white">
            {seg.text}
          </strong>
        );
      case "boldItalic":
        return (
          <strong key={i} className="font-bold text-white">
            <em>{seg.text}</em>
          </strong>
        );
      case "italic":
        return <em key={i}>{seg.text}</em>;
      case "underline":
        return (
          <span key={i} className="underline decoration-zinc-400/60 underline-offset-2">
            {seg.text}
          </span>
        );
      case "strike":
        return (
          <span key={i} className="line-through opacity-75">
            {seg.text}
          </span>
        );
      case "code":
        return (
          <code
            key={i}
            className="rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 font-mono text-[0.85em] text-emerald-200"
          >
            {seg.text}
          </code>
        );
      case "spoiler":
        return <Spoiler key={i} text={seg.text} />;
      case "link":
        return (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noreferrer"
            className="break-all text-violet-300 underline decoration-violet-400/50 underline-offset-2 transition hover:text-violet-200"
          >
            {seg.text}
          </a>
        );
      case "mention":
        return (
          <span
            key={i}
            className="rounded-md bg-violet-500/[0.22] px-1.5 py-0.5 text-[0.92em] font-semibold text-violet-200"
          >
            {seg.label}
          </span>
        );
      default:
        return <span key={i}>{seg.text}</span>;
    }
  });
  return <>{nodes}</>;
}

function Lines({ lines }: { lines: MdSegment[][] }) {
  return (
    <>
      {lines.map((segments, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          <Segments segments={segments} />
        </span>
      ))}
    </>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-xl font-black text-white",
  2: "text-lg font-extrabold text-white",
  3: "text-base font-bold text-zinc-100",
};

export default function DiscordMarkdown({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const blocks = useMemo(() => parseDiscordMarkdown(text), [text]);
  return (
    <div className={`space-y-1.5 ${className}`}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading":
            return (
              <p key={i} className={HEADING_CLASS[block.level] ?? HEADING_CLASS[3]}>
                <Segments segments={block.segments} />
              </p>
            );
          case "quote":
            return (
              <div key={i} className="border-l-2 border-zinc-600 pl-3 text-zinc-300/90">
                <Lines lines={block.lines} />
              </div>
            );
          case "list":
            return (
              <ul key={i} className="list-disc space-y-0.5 pl-5 marker:text-zinc-500">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Segments segments={item} />
                  </li>
                ))}
              </ul>
            );
          case "codeblock":
            return (
              <pre
                key={i}
                className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-xs leading-relaxed text-zinc-200"
              >
                {block.text}
              </pre>
            );
          default:
            return (
              <p key={i}>
                <Lines lines={block.lines} />
              </p>
            );
        }
      })}
    </div>
  );
}
