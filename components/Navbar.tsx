"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-10">
        {/* Logo */}
        <Link
          href="/"
          className="text-lg font-bold tracking-widest text-white hover:text-emerald-300 transition"
        >
          MCWV
        </Link>

        {/* Links */}
        <nav className="flex items-center gap-6 text-sm text-zinc-300">
          <Link href="/" className="hover:text-white transition">
            Home
          </Link>

          <Link href="/leaderboard" className="hover:text-white transition">
            Leaderboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
