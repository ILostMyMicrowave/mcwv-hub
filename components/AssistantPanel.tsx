"use client";

import { useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";

import AssistantCard from "@/components/AssistantCard";
import { answerWithEngine, fallbackAnswer } from "@/lib/assistantEngine";
import type { AssistantCardData } from "@/lib/assistantEngine";
import type { AskerContext, SharedWarContext } from "@/lib/warContext";

// ---------------------------------------------------------------------------
// The assistant engine runs ENTIRELY in this browser tab. Messages are never
// sent to a server, so every reply is computed in ~0ms and a slow, cold, or
// broken backend can never stall the chat again. The only network traffic is
// ONE context payload (live war state + this member's own stats), fetched on
// page load / focus / open and cached in memory; when a refresh fails we keep
// answering from the last known data.
// ---------------------------------------------------------------------------

export type AssistantContext = {
  shared: SharedWarContext;
  asker: AskerContext;
  officer: boolean;
};

type CtxState = {
  ctx: AssistantContext | null;
  loading: boolean;
  error: boolean;
  fetchedAt: number;
};

const CONTEXT_TTL_MS = 45_000;

let ctxState: CtxState = { ctx: null, loading: false, error: false, fetchedAt: 0 };
const listeners = new Set<() => void>();

function emitCtx() {
  for (const listener of listeners) listener();
}

/** Kick off (or refresh) the war-context fetch. Safe to call repeatedly. */
export function prefetchAssistantContext(force = false) {
  if (typeof document !== "undefined" && document.hidden && !force) return;
  if (ctxState.loading) return;
  if (!force && ctxState.ctx && Date.now() - ctxState.fetchedAt < CONTEXT_TTL_MS) return;
  ctxState = { ...ctxState, loading: true, error: false };
  // 15s: one flapped DB connection attempt burns up to 10s on its own (see
  // lib/db.ts), so 10s aborted syncs that the server later completed with a
  // 200. 15s rides out a single retry wave; worse than that and offline
  // best-effort + the Reconnect chip take over.
  fetch("/api/assistant/context", { cache: "no-store", signal: AbortSignal.timeout(15_000) })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AssistantContext;
      // Shape check: a 200 that isn't a real context payload (a wrong route
      // deployed, a proxy page, an HTML error body parsed as JSON) must
      // degrade to offline mode, never reach the render and crash it.
      if (!data || typeof data !== "object" || !data.shared || !data.asker) {
        throw new Error("unexpected payload");
      }
      ctxState = { ctx: data, loading: false, error: false, fetchedAt: Date.now() };
      emitCtx();
    })
    .catch(() => {
      // Keep the last known context; "error" only matters when we have none.
      ctxState = { ...ctxState, loading: false, error: ctxState.ctx === null };
      emitCtx();
    });
}

function useAssistantContext(): CtxState {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(forceUpdate);
    return () => {
      listeners.delete(forceUpdate);
    };
  }, [forceUpdate]);
  return ctxState;
}

// ---------------------------------------------------------------------------
// Chat UI
// ---------------------------------------------------------------------------

type ChatMessage = {
  from: "me" | "bot";
  text: string;
  source?: string | null;
  card?: AssistantCardData | null;
  offline?: boolean;
};

const STORAGE_KEY = "mcwv-assistant-v1";
const STARTER_CHIPS = ["How are we doing?", "What do we win?", "Who's carrying?", "My stats"];

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Feel layer: self-contained keyframes (injected with the panel so no other
// file has to change). Everything is disabled for reduced-motion users.
const PANEL_CSS = `
@keyframes aSpringIn { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes aSpringOut { to { opacity: 0; transform: translateY(10px) scale(0.97); } }
@keyframes aMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes aCardIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes aBarGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes aDotPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5); } 50% { box-shadow: 0 0 0 4px rgba(52, 211, 153, 0); } }
@keyframes aDotBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes aShimmerText { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
  .a-anim, .a-anim * { animation: none !important; transition: none !important; }
}
`;

const SHIMMER_TEXT: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, rgba(251,191,36,0.4) 0%, #fbbf24 50%, rgba(251,191,36,0.4) 100%)",
  backgroundSize: "200% 100%",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  animation: "aShimmerText 1.6s linear infinite",
};

const LOCAL_GREETING =
  "Yo! 💜 I'm the war assistant. Placements, gaps, rewards, who's carrying, your own stats.\n\nAnswers are instant: everything is computed right here in your browser, live from the war data.";

function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

function fmtTimeLeft(ms: number | null): string {
  if (ms === null || ms <= 0) return "?";
  const total = Math.floor(ms / 60000);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Used only when no live payload could be fetched. Engine answers stay
 * honest ("between wars / can't see it") instead of inventing numbers. */
function degradedContext(): AssistantContext {
  return {
    shared: {
      generatedAt: new Date().toISOString(),
      active: false,
      battleId: null,
      timeLeftMs: null,
      endsAt: null,
      clanRank: null,
      clanPoints: null,
      memberCount: null,
      sampleClans: 0,
      gainLastHour: null,
      gainLast24h: null,
      hourlyRate: null,
      projectedFinalPoints: null,
      projectedRankIfPaceHolds: null,
      standings: [],
      rewards: [],
      headlineReward: null,
      contributorRewards: [],
      topScorers: [],
      movers: [],
      members: [],
      zeroCount: 0,
      zeroNames: [],
      contributors: null,
      history: [],
    },
    asker: {
      username: "you",
      robloxId: null,
      points: null,
      rank: null,
      gapToNext: null,
      nextPlayer: null,
      gain24h: null,
      inRoster: false,
      wars: [],
    },
    officer: false,
  };
}

export default function AssistantPanel({
  exiting = false,
  onRequestClose,
}: {
  exiting?: boolean;
  onRequestClose?: () => void;
}) {
  const pathname = usePathname();
  const { ctx, loading, error } = useAssistantContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chips, setChips] = useState<string[]>(STARTER_CHIPS);
  const [input, setInput] = useState("");
  const [greeted, setGreeted] = useState(false);
  const [typingIdx, setTypingIdx] = useState<number | null>(null);
  const [reveal, setReveal] = useState(0);
  // Only ever true while the very first war-data sync is in flight (bounded
  // by a 15s timeout). Every other reply is instant.
  const [waiting, setWaiting] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topicRef = useRef<string | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<string | null>(null);

  // Chat history survives reloads (full text only; the typing effect is
  // purely cosmetic and never persisted mid-animation).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { messages?: ChatMessage[] };
        if (Array.isArray(parsed.messages) && parsed.messages.length) {
          setMessages(parsed.messages.slice(-40));
          setGreeted(true);
        }
      }
    } catch {
      // Fresh chats are fine too.
    }
  }, []);

  useEffect(() => {
    if (!greeted) {
      setGreeted(true);
      setMessages((current) => [...current, { from: "bot", text: LOCAL_GREETING }]);
    }
  }, [greeted]);

  useEffect(() => {
    messagesRef.current = messages;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-40) }));
    } catch {
      // Storage is a bonus, never a blocker.
    }
  }, [messages]);

  // Keep the transcript pinned to the newest line, including while a reply
  // types itself out.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, reveal, typingIdx, waiting]);

  // Opening the panel is user intent: refresh the war data now (still
  // non-blocking), and keep it warm on tab focus.
  useEffect(() => {
    prefetchAssistantContext(true);
    const onVisible = () => {
      if (!document.hidden) prefetchAssistantContext();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    };
  }, []);

  // ---- Typing effect: replies type out at reading speed ----
  function flushTyping() {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setTypingIdx(null);
  }

  function startTyping(index: number, text: string) {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (text.length < 24 || REDUCED_MOTION) {
      setTypingIdx(null);
      return;
    }
    setTypingIdx(index);
    setReveal(0);
    let shown = 0;
    const startedAt = Date.now();
    const step = () => {
      // 3-6 chars per tick keeps even long replies under ~2.5s; past that,
      // fast-forward so nobody waits on a slow reveal.
      const overtime = Date.now() - startedAt > 2400;
      shown = Math.min(text.length, shown + (overtime ? 14 : 3 + Math.floor(Math.random() * 4)));
      setReveal(shown);
      if (shown >= text.length) {
        revealTimerRef.current = null;
        setTypingIdx(null);
        return;
      }
      // Breathing: brief pauses at punctuation make the reveal read naturally.
      const ch = text[shown - 1];
      let delay = 16;
      if (/[.!?]/.test(ch)) delay = overtime ? 16 : 120;
      else if (/[,;:]/.test(ch)) delay = overtime ? 16 : 50;
      else if (ch === "\n") delay = overtime ? 16 : 70;
      revealTimerRef.current = window.setTimeout(step, delay);
    };
    revealTimerRef.current = window.setTimeout(step, 80);
  }

  // ---- The engine call: synchronous, local, instant ----
  function deliverAnswer(text: string) {
    const live = ctxState.ctx;
    const offline = live === null;
    const useCtx = live ?? degradedContext();

    const engine = answerWithEngine(
      text,
      useCtx.shared,
      useCtx.asker,
      useCtx.officer,
      topicRef.current ?? undefined,
      pathname
    );
    const result = engine.handled
      ? engine
      : fallbackAnswer(useCtx.shared, useCtx.asker, engine.suggestion ?? null, pathname);

    if (result.topic) topicRef.current = result.topic;

    const prefix = offline ? "⚠️ I can't reach the live war data right now, so this is offline best-effort:\n\n" : "";
    const botMessage: ChatMessage = {
      from: "bot",
      text: `${prefix}${result.text}`,
      source: engine.handled ? "instant" : "fallback",
      card: result.card ?? null,
      offline,
    };
    const nextMessages = [...messagesRef.current, botMessage];
    setMessages(nextMessages);
    startTyping(nextMessages.length - 1, botMessage.text);

    setChips(offline ? ["Reconnect", ...result.chips].slice(0, 4) : result.chips);
  }

  // A question asked before the first payload landed gets answered the
  // moment the payload arrives (or the fetch definitively fails).
  useEffect(() => {
    if (pendingRef.current !== null && (ctx !== null || error)) {
      setWaiting(false);
      const text = pendingRef.current;
      pendingRef.current = null;
      if (text !== null) deliverAnswer(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, error]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || waiting) return;
    flushTyping();
    setMessages((current) => [...current, { from: "me", text: trimmed }]);
    setInput("");

    if (trimmed === "Reconnect") {
      prefetchAssistantContext(true);
      setMessages((current) => [
        ...current,
        { from: "bot", text: "Reconnecting to the war data... one sec ⏳" },
      ]);
      return;
    }

    if (ctxState.ctx === null) {
      if (ctxState.loading) {
        // First sync still in flight: hold this question briefly (bounded by
        // the 15s fetch timeout) rather than answering blind.
        pendingRef.current = trimmed;
        setWaiting(true);
        prefetchAssistantContext(true);
        return;
      }
    }
    deliverAnswer(trimmed);
  }

  const hoursLeft =
    ctx && ctx.shared.active && ctx.shared.timeLeftMs !== null
      ? ctx.shared.timeLeftMs / 3_600_000
      : null;
  const pill = ctx
    ? ctx.shared.active
      ? hoursLeft !== null && hoursLeft <= 6
        ? `LIVE #${ctx.shared.clanRank ?? "?"} · FINAL ${fmtTimeLeft(ctx.shared.timeLeftMs)}`
        : hoursLeft !== null && hoursLeft <= 24
          ? `LIVE #${ctx.shared.clanRank ?? "?"} · FINAL DAY · ${fmtTimeLeft(ctx.shared.timeLeftMs)}`
          : `LIVE #${ctx.shared.clanRank ?? "?"} · ${fmtTimeLeft(ctx.shared.timeLeftMs)} left`
      : "Between wars"
    : loading
      ? "syncing…"
      : "offline";
  const pillColor = ctx ? "#34d399" : loading ? "#fbbf24" : "#f87171";
  const dotAnimation = ctx
    ? "aDotPulse 2.4s ease-in-out infinite"
    : loading
      ? "aDotBlink 1.1s ease-in-out infinite"
      : "aDotBlink 2.6s ease-in-out infinite";

  return (
    <div
      className="a-anim fixed right-5 z-[60] flex h-[min(64dvh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-3xl border backdrop-blur-xl"
      style={{
        bottom: "calc(max(1.25rem, env(safe-area-inset-bottom)) + 4.5rem)",
        background: "color-mix(in srgb, #09090b 82%, var(--primary))",
        borderColor: "color-mix(in srgb, var(--primary) 35%, var(--border, rgba(255,255,255,0.12)))",
        boxShadow: "0 20px 60px rgba(0,0,0,0.55), 0 0 24px var(--glow)",
        animation: exiting
          ? "aSpringOut 0.16s ease-in both"
          : "aSpringIn 0.34s cubic-bezier(0.2, 0.9, 0.3, 1.12) both",
        pointerEvents: exiting ? "none" : undefined,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: PANEL_CSS }} />
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div
          className="grid h-9 w-9 place-items-center rounded-2xl text-lg"
          style={{ background: "color-mix(in srgb, var(--primary) 30%, transparent)" }}
        >
          💜
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">MCWV Assistant</div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: pillColor, animation: dotAnimation }}
            />
            <span className="truncate" style={loading ? SHIMMER_TEXT : undefined}>{pill}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close assistant"
          onClick={onRequestClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 text-sm text-zinc-400 transition hover:border-white/25 hover:text-white active:scale-90"
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.from === "me" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                message.from === "me"
                  ? "rounded-br-md text-white"
                  : "rounded-bl-md border border-white/10 bg-white/5 text-zinc-200"
              }`}
              style={
                message.from === "me"
                  ? { background: "color-mix(in srgb, var(--primary) 45%, transparent)" }
                  : undefined
              }
            >
              {index === typingIdx && message.from === "bot" ? (
                <>
                  {renderRichText(message.text.slice(0, reveal))}
                  <span className="assistant-cursor" aria-hidden="true">▍</span>
                </>
              ) : (
                renderRichText(message.text)
              )}
              {message.card ? <AssistantCard card={message.card} /> : null}
            </div>
          </div>
        ))}
        {waiting && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-300">
              <span className="assistant-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-zinc-300" />
              <span className="assistant-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-zinc-300" style={{ animationDelay: "0.18s" }} />
              <span className="assistant-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-zinc-300" style={{ animationDelay: "0.36s" }} />
              syncing war data...
            </div>
          </div>
        )}
      </div>

      {chips.length > 0 && typingIdx === null && !waiting && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => send(chip)}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-white/25 hover:text-white"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-white/10 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about the war..."
          maxLength={500}
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/30"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white transition hover:brightness-110 disabled:opacity-40"
          style={{ background: "var(--primary)" }}
          aria-label="Send"
        >
          ➤
        </button>
      </form>
    </div>
  );
}
