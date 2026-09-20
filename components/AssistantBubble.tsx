"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// The panel (and the assistant engine bundled with it) is a lazy chunk: it
// loads on first open, and is prefetched the moment the member shows intent
// (hover / tap) or shortly after page load, so opening feels instant without
// costing every page view a single byte.
const AssistantPanel = dynamic(() => import("./AssistantPanel"), {
  ssr: false,
});

export default function AssistantBubble() {
  const [open, setOpen] = useState(false);
  // While true, the panel plays its exit animation; it unmounts ~170ms later.
  const [closing, setClosing] = useState(false);
  const preloadedRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  const preload = useCallback(() => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    // Same specifier as the dynamic() import above: loads the panel chunk
    // AND kicks off the war-context fetch inside it.
    void import("./AssistantPanel").then((mod) => {
      mod.prefetchAssistantContext();
    });
  }, []);

  const close = useCallback(() => {
    if (closeTimerRef.current !== null || !open) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
      setClosing(false);
    }, 170);
  }, [open]);

  useEffect(() => {
    const idle = window.setTimeout(preload, 1500);
    return () => {
      window.clearTimeout(idle);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, [preload]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close MCWV war assistant" : "Open MCWV war assistant"}
        onPointerEnter={preload}
        onClick={() => {
          preload();
          if (closing) {
            // Rapid re-toggle: cancel the exit and keep the panel open.
            if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
            setClosing(false);
            return;
          }
          if (open) {
            close();
          } else {
            setOpen(true);
          }
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

      {open && <AssistantPanel exiting={closing} onRequestClose={close} />}
    </>
  );
}
