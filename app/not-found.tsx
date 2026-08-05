import Link from "next/link";

// MCWV-styled 404 — also the stealth face of private areas like /afk,
// so it must never hint at what might live there.
export default function NotFound() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(640px circle at 50% 34%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)",
        }}
      />
      <div className="relative flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mcwv-logo.png"
          alt=""
          aria-hidden
          className="h-24 w-auto opacity-80"
          style={{ filter: "drop-shadow(0 0 26px color-mix(in srgb, var(--accent) 45%, transparent))" }}
        />
        <p
          aria-hidden
          className="mt-8 text-[11px] font-bold uppercase tracking-[0.42em] text-zinc-500"
        >
          Signal lost
        </p>
        <h1 className="mt-3 text-5xl font-black tracking-[0.18em]">
          4<span style={{ color: "var(--accent)" }}>0</span>4
        </h1>
        <p className="mt-4 max-w-xs text-sm leading-6 text-zinc-400">
          This page drifted off the grid — or never existed at all.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/"
            className="rounded-full border px-5 py-2.5 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 hover:bg-white/10 active:scale-[0.97]"
            style={{ borderColor: "var(--border)" }}
          >
            ← Back to HQ
          </Link>
        </div>
        <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-700">
          MCWV · transmission ends
        </p>
      </div>
    </main>
  );
}
