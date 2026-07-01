"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-bold tracking-widest">
          MCWV
        </Link>

        {/* Desktop */}
        <nav className="hidden gap-6 text-sm text-zinc-300 sm:flex">
          <Link href="/">Home</Link>
          <Link href="/leaderboard">Leaderboard</Link>
        </nav>

        {/* Mobile button */}
        <button
          onClick={() => setOpen(!open)}
          className="sm:hidden text-zinc-300"
        >
          ☰
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t border-white/10 px-4 py-3 text-sm">
          <div className="flex flex-col gap-3 text-zinc-300">
            <Link href="/" onClick={() => setOpen(false)}>
              Home
            </Link>
            <Link href="/leaderboard" onClick={() => setOpen(false)}>
              Leaderboard
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
