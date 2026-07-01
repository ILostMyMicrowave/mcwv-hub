"use client";

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-black">
      {/* Gradient base */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-900" />

      {/* Floating glow orb 1 */}
      <div className="animate-blob absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Floating glow orb 2 */}
      <div className="animate-blob animation-delay-2000 absolute top-1/3 right-1/4 h-[30rem] w-[30rem] rounded-full bg-blue-500/10 blur-3xl" />

      {/* Floating glow orb 3 */}
      <div className="animate-blob animation-delay-4000 absolute bottom-0 left-1/3 h-[28rem] w-[28rem] rounded-full bg-purple-500/10 blur-3xl" />

      {/* Noise overlay (gives premium feel) */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </div>
  );
}
