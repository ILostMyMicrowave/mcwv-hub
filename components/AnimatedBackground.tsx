"use client";

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base dark gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-black" />

      {/* Glow blobs */}
      <div className="absolute -top-40 left-1/4 h-96 w-96 animate-blob rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="absolute top-1/3 right-1/4 h-[32rem] w-[32rem] animate-blob animation-delay-2000 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="absolute bottom-0 left-1/3 h-[30rem] w-[30rem] animate-blob animation-delay-4000 rounded-full bg-purple-500/20 blur-3xl" />

      {/* Extra subtle motion layer */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute h-full w-full bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.05),transparent_60%)]" />
      </div>
    </div>
  );
}
