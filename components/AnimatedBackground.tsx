"use client";

export default function AnimatedBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-black">
      
      {/* MAIN GLOW ORB 1 */}
      <div
        className="absolute top-[-200px] left-[-200px] h-[500px] w-[500px] rounded-full blur-[120px] animate-blob"
        style={{ background: "var(--primary)" }}
      />

      {/* ORB 2 */}
      <div
        className="absolute bottom-[-200px] right-[-200px] h-[500px] w-[500px] rounded-full blur-[140px] animate-blob animation-delay-2000"
        style={{ background: "var(--accent)" }}
      />

      {/* ORB 3 */}
      <div
        className="absolute top-[40%] left-[50%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[160px] animate-blob animation-delay-4000"
        style={{ background: "var(--glow)" }}
      />

      {/* DARK OVERLAY */}
      <div className="absolute inset-0 bg-black/40" />

      {/* NOISE LAYER */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </div>
  );
}
