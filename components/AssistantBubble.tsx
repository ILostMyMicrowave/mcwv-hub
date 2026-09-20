"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import AssistantCard from "@/components/AssistantCard";
import type { AssistantCardData } from "@/lib/assistantEngine";

type ChatMessage = {
  from: "me" | "bot";
  text: string;
  source?: string | null;
  card?: AssistantCardData | null;
};

type AssistantResponse = {
  reply?: string;
  chips?: string[];
  source?: string;
  topic?: string | null;
  card?: AssistantCardData | null;
  error?: string;
};

const STORAGE_KEY = "mcwv-assistant-v1";
const STARTER_CHIPS = ["How are we doing?", "What do we win?", "Who's carrying?", "My stats"];

// Rendered instantly on first open so the panel never sits silent while a
// cold server warms up; the live version (rank + time left) swaps in when
// the background hello lands.
const LOCAL_GREETING =
  "Yo! 💜 I'm the war assistant. Ask me anything: how we're doing, gaps, rewards, who's carrying, your own stats.\n\nI answer instantly from live war data.";

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

export default function AssistantBubble() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chips, setChips] = useState<string[]>(STARTER_CHIPS);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const [typingIdx, setTypingIdx] = useState<number | null>(null);
  const [reveal, setReveal] = useState(0);
  const revealTimerRef = useRef<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const lastWarmRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topicRef = useRef<string | null>(null);

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
  }, [messages, reveal, typingIdx]);

  useEffect(() => {
    if (open && !greeted) {
      setGreeted(true);
      // Instant local greeting, then a SILENT background refresh with the
      // live war state. No dots, no waiting: the panel is usable immediately.
      setMessages((current) => [...current, { from: "bot", text: LOCAL_GREETING }]);
      setChips(STARTER_CHIPS);
      const replaceIndex = messagesRef.current.length;
      void sendInternal("__hello__", { silent: true, replaceIndex });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- Latency: warm the server before the member types ----
  // The assistant's serverless isolate is almost always cold when a member
  // opens the bubble. This GET builds the shared war context and this
  // member's cached history, so the first real message lands fast. Fired on
  // page load (delayed), bubble hover, open, and tab focus; deduped.
  const warm = useCallback(() => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - lastWarmRef.current < 45_000) return;
    lastWarmRef.current = now;
    void fetch("/api/assistant", {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const idle = window.setTimeout(() => warm(), 1200);
    const onVisible = () => {
      if (!document.hidden) warm();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(idle);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [warm]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) window.clearInterval(revealTimerRef.current);
    };
  }, []);

  // ---- Typing effect: replies type out at reading speed ----
  function flushTyping() {
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setTypingIdx(null);
  }

  function startTyping(index: number, text: string) {
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    // Very short replies (and error wobbles) appear instantly.
    if (text.length < 24) {
      setTypingIdx(null);
      return;
    }
    const totalMs = Math.min(1100, 200 + text.length * 3);
    const startedAt = Date.now();
    setTypingIdx(index);
    setReveal(0);
    revealTimerRef.current = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / totalMs);
      const eased = 1 - Math.pow(1 - ratio, 2.2);
      setReveal(Math.floor(eased * text.length));
      if (ratio >= 1) {
        if (revealTimerRef.current !== null) window.clearInterval(revealTimerRef.current);
        revealTimerRef.current = null;
        setTypingIdx(null);
      }
    }, 40);
  }

  async function askOnce(text: string, timeoutMs: number): Promise<AssistantResponse> {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, context: { topic: topicRef.current, page: pathname } }),
      // Hard client timeout: a request can never hang the dots forever. A
      // cold isolate can legitimately need ~20s for its first war-context
      // build, so a timeout is not a failure - attempt one has WARMED the
      // isolate, and the retry usually lands in well under a second.
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json().catch(() => ({}))) as AssistantResponse;
    if (!res.ok || !data.reply) throw new Error(data.error ?? "Assistant request failed");
    return data;
  }

  async function sendInternal(text: string, opts?: { silent?: boolean; replaceIndex?: number }) {
    const silent = opts?.silent === true;
    if (!silent) {
      if (busy) return;
      setBusy(true);
    }
    try {
      let data: AssistantResponse;
      if (silent) {
        // Background greeting refresh: one attempt, best-effort.
        data = await askOnce(text, 15_000);
      } else {
        try {
          data = await askOnce(text, 12_000);
        } catch {
          // One automatic retry with a bigger budget (isolate now warm).
          data = await askOnce(text, 25_000);
        }
      }
      const replyText = String(data.reply);
      const botMessage = {
        from: "bot" as const,
        text: replyText,
        source: data.source ?? null,
        card: data.card ?? null,
      };

      if (opts && typeof opts.replaceIndex === "number") {
        // Greeting refresh: only swap the placeholder if nothing newer has
        // happened meanwhile; otherwise drop it so the transcript stays clean.
        const current = messagesRef.current;
        const inPlace =
          current.length === opts.replaceIndex + 1 && current[opts.replaceIndex]?.from === "bot";
        if (!inPlace) return;
        const nextMessages = [...current];
        nextMessages[opts.replaceIndex] = botMessage;
        setMessages(nextMessages);
        startTyping(opts.replaceIndex, replyText);
      } else {
        const nextMessages = [...messagesRef.current, botMessage];
        setMessages(nextMessages);
        startTyping(nextMessages.length - 1, replyText);
      }
      if (Array.isArray(data.chips) && data.chips.length) setChips(data.chips);
      if (typeof data.topic === "string" && data.topic) topicRef.current = data.topic;
    } catch (err) {
      if (silent) return;
      const timedOut =
        (err instanceof DOMException && /timeout/i.test(err.name)) ||
        (err instanceof Error && /abort|timeout/i.test(`${err.name} ${err.message}`));
      setMessages((current) => [
        ...current,
        {
          from: "bot",
          text: timedOut
            ? "Took too long there - the server was stone cold. Try again, I'm warm now 🔥"
            : err instanceof Error
              ? `Wobble 😵 ${err.message} — try again?`
              : "Something wobbled — try again?",
        },
      ]);
    } finally {
      if (!silent) setBusy(false);
    }
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    flushTyping();
    setMessages((current) => [...current, { from: "me", text: trimmed }]);
    setInput("");
    void sendInternal(trimmed);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open MCWV war assistant"
        onPointerEnter={() => warm()}
        onClick={() => {
          warm();
          setOpen((value) => !value);
        }}
        className="fixed right-5 z-[60] grid h-14 w-14 place-items-center rounded-full border text-2xl transition hover:scale-105 active:scale-95"
        style={{
          bottom: "max(1.25rem, env(safe-area-inset-bottom))",
          background: "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 55%, #7c3aed))",
          borderColor: "color-mix(in srgb, var(--primary) 60%, white)",
          boxShadow: "0 8px 30px var(--glow), 0 2px 8px rgba(0,0,0,0.45)",
        }}
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div
          className="assistant-pop-in fixed right-5 z-[60] flex h-[min(64dvh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-3xl border backdrop-blur-xl"
          style={{
            bottom: "calc(max(1.25rem, env(safe-area-inset-bottom)) + 4.5rem)",
            background: "color-mix(in srgb, #09090b 82%, var(--primary))",
            borderColor: "color-mix(in srgb, var(--primary) 35%, var(--border, rgba(255,255,255,0.12)))",
            boxShadow: "0 20px 60px rgba(0,0,0,0.55), 0 0 24px var(--glow)",
          }}
        >
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
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                War HQ · always on
              </div>
          </div>
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
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="assistant-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-zinc-300"
                      style={{ animationDelay: `${dot * 0.18}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {chips.length > 0 && typingIdx === null && (
            <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={busy}
                  onClick={() => send(chip)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-white/25 hover:text-white disabled:opacity-50"
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
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/30"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white transition hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--primary)" }}
              aria-label="Send"
            >
              ➤
            </button>
          </form>
        </div>
      )}

      <style jsx>{`
        @keyframes assistant-pop {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .assistant-pop-in {
          animation: assistant-pop 0.18s ease-out;
        }
        @keyframes assistant-typing {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
        .assistant-typing-dot {
          animation: assistant-typing 1s infinite ease-in-out;
        }
      `}</style>
    </>
  );
}
