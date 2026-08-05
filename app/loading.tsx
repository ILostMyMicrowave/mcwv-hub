// Root route-transition fallback — tiny and instant-feeling on purpose.
export default function Loading() {
  return (
    <main
      className="grid min-h-screen place-items-center"
      role="status"
      aria-label="Loading page"
    >
      <style>{`
        @keyframes mcwv-load-pulse {
          0%, 100% { opacity: 0.35; transform: scale(0.96); }
          50% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mcwv-load-pulse { animation: none !important; opacity: 0.9; }
        }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mcwv-logo.png"
        alt=""
        aria-hidden
        className="mcwv-load-pulse h-16 w-auto"
        style={{
          animation: "mcwv-load-pulse 1.1s ease-in-out infinite",
          filter: "drop-shadow(0 0 18px color-mix(in srgb, var(--accent) 40%, transparent))",
        }}
      />
      <span className="sr-only">Loading…</span>
    </main>
  );
}
