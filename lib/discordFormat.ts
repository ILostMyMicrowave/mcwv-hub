// Discord-flavoured markdown for the hub — pure parser + plain-text stripper.
//
//   parseDiscordMarkdown(text) → structured blocks for components/DiscordMarkdown.tsx
//   stripDiscordMarkdown(text) → clean plain text for push bodies & list previews
//
// Supported: ***bold-italic***, **bold**, *italic*, _italic_, __underline__,
//   ~~strike~~, ||spoiler||, `inline code`, ```fenced blocks```,
//   # / ## / ### headings, > and >>> quotes, - and * bullet lists,
//   [masked](links), raw URLs, and <@> <@!> <@&> <#> mentions (as labels —
//   we can't resolve real Discord names from the hub).
// Flat nesting only (***bold-italic*** is as deep as we go) — that matches
// how real broadcasts are written, and keeps this parser tiny and testable.
// Tests: scripts/test-discord-format.mjs.

export type MdSegment =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "boldItalic"; text: string }
  | { kind: "underline"; text: string }
  | { kind: "strike"; text: string }
  | { kind: "code"; text: string }
  | { kind: "spoiler"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "mention"; label: string }
  | { kind: "emoji"; name: string; id: string; animated: boolean };

export type MdBlock =
  | { kind: "heading"; level: number; segments: MdSegment[] }
  | { kind: "quote"; lines: MdSegment[][] }
  | { kind: "list"; items: MdSegment[][] }
  | { kind: "codeblock"; text: string }
  | { kind: "paragraph"; lines: MdSegment[][] };

// Order matters: longer markers first (*** before ** before *), __ before _,
// <@& before <@! before <@>, masked links before raw URLs. Every emphasis
// pattern requires non-space content touching BOTH markers (\S(?:…\S)?) —
// exactly like Discord, so "100 * 5 * 3" never becomes italic.
const INLINE_RE = new RegExp(
  [
    String.raw`\*\*\*(\S(?:[^*\n]*\S)?)\*\*\*`, // 1 bold-italic
    String.raw`\*\*(\S(?:[^*\n]*\S)?)\*\*`, // 2 bold
    String.raw`__(\S(?:[^_\n]*\S)?)__`, // 3 underline
    String.raw`~~(\S(?:[^~\n]*\S)?)~~`, // 4 strike
    String.raw`\|\|(\S(?:[^|\n]*\S)?)\|\|`, // 5 spoiler
    '`([^`\\n]+)`', // 6 inline code (quoted string — backticks can't live in String.raw``)
    String.raw`\*(\S(?:[^*\n]*\S)?)\*`, // 7 italic (star)
    String.raw`_(\S(?:[^_\n]*\S)?)_`, // 8 italic (underscore)
    String.raw`\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)`, // 9 label + 10 href
    String.raw`(https?:\/\/[^\s<]+)`, // 11 raw url
    String.raw`<@&(\d+)>`, // 12 role
    String.raw`<@!(\d+)>`, // 13 user (bang form)
    String.raw`<@(\d+)>`, // 14 user
    String.raw`<#(\d+)>`, // 15 channel
    String.raw`<(a)?:([A-Za-z0-9_]{1,32}):(\d{15,})>`, // 16 custom emoji (animated?, name, id)
  ].join("|"),
  "g"
);

export function parseInline(line: string): MdSegment[] {
  const out: MdSegment[] = [];
  INLINE_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (text) out.push({ kind: "text", text });
  };

  while ((m = INLINE_RE.exec(line))) {
    pushText(line.slice(last, m.index));
    const [full, bi, b, u, s, sp, code, itStar, itUnder, label, href, url, role, bangUser, user, channel, anim, eName, eId] = m;
    if (bi !== undefined) out.push({ kind: "boldItalic", text: bi });
    else if (b !== undefined) out.push({ kind: "bold", text: b });
    else if (u !== undefined) out.push({ kind: "underline", text: u });
    else if (s !== undefined) out.push({ kind: "strike", text: s });
    else if (sp !== undefined) out.push({ kind: "spoiler", text: sp });
    else if (code !== undefined) out.push({ kind: "code", text: code });
    else if (itStar !== undefined) out.push({ kind: "italic", text: itStar });
    else if (itUnder !== undefined) out.push({ kind: "italic", text: itUnder });
    else if (label !== undefined && href !== undefined) out.push({ kind: "link", text: label, href });
    else if (url !== undefined) out.push({ kind: "link", text: url, href: url });
    else if (role !== undefined) out.push({ kind: "mention", label: "@role" });
    else if (bangUser !== undefined || user !== undefined) out.push({ kind: "mention", label: "@member" });
    else if (channel !== undefined) out.push({ kind: "mention", label: "#channel" });
    else if (eName !== undefined && eId !== undefined)
      out.push({ kind: "emoji", name: eName, id: eId, animated: anim === "a" });
    else pushText(full);
    last = m.index + full.length;
  }
  pushText(line.slice(last));
  return out;
}

const FENCE_START = /^\s*```/;
const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const QUOTE_LINE = /^>\s?/;
const BIG_QUOTE = /^>>>\s?/;
const BULLET_RE = /^[-*]\s+(.*)$/;

export function parseDiscordMarkdown(input: string): MdBlock[] {
  const text = String(input ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const blocks: MdBlock[] = [];
  let para: MdSegment[][] | null = null;
  let i = 0;

  const flushPara = () => {
    if (para && para.length > 0) blocks.push({ kind: "paragraph", lines: para });
    para = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    // ``` fenced code block (```code``` one-liners and lang tags handled)
    if (FENCE_START.test(line)) {
      flushPara();
      const afterOpen = line.slice(line.indexOf("```") + 3);
      if (afterOpen.includes("```")) {
        blocks.push({ kind: "codeblock", text: afterOpen.slice(0, afterOpen.indexOf("```")) });
        i += 1;
        continue;
      }
      const buf: string[] = [];
      // Real language tags have no spaces/punctuation; anything else is content.
      if (afterOpen.trim() && /[ ;.,!?]/.test(afterOpen)) buf.push(afterOpen);
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (lines[j].includes("```")) {
          closed = true;
          break;
        }
        buf.push(lines[j]);
        j += 1;
      }
      blocks.push({ kind: "codeblock", text: buf.join("\n") });
      i = closed ? j + 1 : lines.length;
      continue;
    }

    // # / ## / ### headings
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ kind: "heading", level: heading[1].length, segments: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    // >>> quotes the REST of the message
    if (BIG_QUOTE.test(line)) {
      flushPara();
      const quoteLines: MdSegment[][] = [parseInline(line.replace(BIG_QUOTE, ""))];
      i += 1;
      while (i < lines.length) {
        quoteLines.push(parseInline(lines[i]));
        i += 1;
      }
      blocks.push({ kind: "quote", lines: quoteLines });
      continue;
    }

    // > consecutive single-line quotes merge into one block
    if (QUOTE_LINE.test(line)) {
      flushPara();
      const quoteLines: MdSegment[][] = [];
      while (i < lines.length && QUOTE_LINE.test(lines[i])) {
        quoteLines.push(parseInline(lines[i].replace(QUOTE_LINE, "")));
        i += 1;
      }
      blocks.push({ kind: "quote", lines: quoteLines });
      continue;
    }

    // - / * bullet lists, consecutive lines merge
    if (BULLET_RE.test(line)) {
      flushPara();
      const items: MdSegment[][] = [];
      while (i < lines.length) {
        const bullet = BULLET_RE.exec(lines[i]);
        if (!bullet) break;
        items.push(parseInline(bullet[1]));
        i += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }

    // blank line = paragraph separator
    if (line.trim() === "") {
      flushPara();
      i += 1;
      continue;
    }

    (para ??= []).push(parseInline(line));
    i += 1;
  }
  flushPara();
  return blocks;
}

// Clean plain-text version for contexts that can't render (push bodies, list
// previews). Markers disappear, CONTENT stays; masked links keep their label;
// mentions are removed entirely (a nameless <@id> reads as noise on a lock
// screen). Newlines preserved — callers collapse whitespace if they need to.
export function stripDiscordMarkdown(input: string): string {
  let text = String(input ?? "");

  // fenced blocks → keep inner code text (trim the fence-padding newlines;
  // lang group needs a trailing \n so one-liners like ```solo``` survive)
  text = text.replace(/```(?:[A-Za-z0-9_+-]*\n)?([\s\S]*?)```/g, (_match, inner: string) =>
    inner.replace(/^\n+|\n+$/g, "")
  );
  text = text.replace(/`([^`\n]+)`/g, "$1");

  // mentions out entirely
  text = text.replace(/<@[!&]?\d+>/g, "").replace(/<#\d+>/g, "");

  // custom emoji <:name:id> / <a:name:id> → its name (can't show an image in
  // plain text; the name still conveys meaning on a lock screen)
  text = text.replace(/<(a)?:([A-Za-z0-9_]{1,32}):(\d{15,})>/g, (_m, _anim: string, name: string) => name);

  // [masked](link) → label
  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1");

  // emphasis markers (longest first, Discord's non-space boundary rule)
  text = text
    .replace(/\*\*\*(\S(?:[^*\n]*\S)?)\*\*\*/g, "$1")
    .replace(/\*\*(\S(?:[^*\n]*\S)?)\*\*/g, "$1")
    .replace(/~~(\S(?:[^~\n]*\S)?)~~/g, "$1")
    .replace(/__(\S(?:[^_\n]*\S)?)__/g, "$1")
    .replace(/\|\|(\S(?:[^|\n]*\S)?)\|\|/g, "$1")
    .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, "$1")
    .replace(/_(\S(?:[^_\n]*\S)?)_/g, "$1");

  // block markers at line starts
  text = text
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>{1,3}\s?/gm, "")
    .replace(/^[-*]\s+(?=\S)/gm, "");

  return text;
}
