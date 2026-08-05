"use client";

import Link from "next/link";
import { useEffect } from "react";

// Root error boundary — keeps a crash on-theme and offers a retry.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[mcwv] route error:", error);
  }, [error]);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(640px circle at 50% 34%, rgba(248,113,113,0.10), transparent 70%)",
        }}
      />
      <div className="relative flex flex-col items-center text-center">
        <span
          aria-hidden
          className="grid h-16 w-16 place-items-center rounded-2xl border text-2xl"
          style={{
            borderColor: "var(--border)",
            boxShadow: "0 0 24px rgba(248,113,113,0.25)",
          }}
        >
          ⚠️
        </span>
        <p
          aria-hidden
          className="mt-8 text-[11px] font-bold uppercase tracking-[0.42em] text-zinc-500"
        >
          Static on the line
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-[0.12em]">
          Something blew a fuse
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-6 text-zinc-400">
          The hub hiccuped while loading this page. It&apos;s usually brief —
          give it another shot.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full border px-5 py-2.5 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 hover:bg-white/10 active:scale-[0.97]"
            style={{
              borderColor: "color-mix(in srgb, var(--accent) 50%, var(--border))",
              color: "var(--accent)",
            }}
          >
            ↻ Try again
          </button>
          <Link
            href="/"
            className="rounded-full border px-5 py-2.5 text-sm font-semibold text-zinc-300 transition duration-200 hover:-translate-y-0.5 hover:bg-white/5 active:scale-[0.97]"
            style={{ borderColor: "var(--border)" }}
          >
            Back to HQ
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-700">
            ref {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
