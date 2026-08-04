"use client";

import { useEffect, useRef, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chips, setChips] = useState<string[]>(STARTER_CHIPS);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [greeted, setGreeted] = useState(false);
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
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-40) }));
    } catch {
      // Storage is a bonus, never a blocker.
    }
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (open && !greeted) {
      setGreeted(true);
      void sendInternal("__hello__");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function sendInternal(text: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context: { topic: topicRef.current } }),
      });
      const data = (await res.json().catch(() => ({}))) as AssistantResponse;
      if (!res.ok || !data.reply) throw new Error(data.error ?? "Assistant request failed");
      setMessages((current) => [...current, { from: "bot", text: String(data.reply), source: data.source ?? null, card: data.card ?? null }]);
      if (Array.isArray(data.chips) && data.chips.length) setChips(data.chips);
      if (typeof data.topic === "string" && data.topic) topicRef.current = data.topic;
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          from: "bot",
          text: err instanceof Error ? `Wobble 😵 ${err.message} — try again?` : "Something wobbled — try again?",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMessages((current) => [...current, { from: "me", text: trimmed }]);
    setInput("");
    void sendInternal(trimmed);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open MCWV war assistant"
        onClick={() => setOpen((value) => !value)}
        className="fixed right-5 z-40 grid h-14 w-14 place-items-center rounded-full border text-2xl transition hover:scale-105 active:scale-95"
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
          className="assistant-pop-in fixed right-5 z-40 flex h-[min(64dvh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-3xl border backdrop-blur-xl"
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
                  {renderRichText(message.text)}
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

          {chips.length > 0 && (
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
