"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/", label: "Home" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/war-info", label: "War Info" },
    { href: "/contributions", label: "Contributions" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur"
      style={{
        background: "rgba(0,0,0,0.4)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">

        {/* Logo */}
        <Link
          href="/"
          className="font-bold tracking-widest transition"
          style={{ color: "var(--foreground)" }}
        >
          MCWV
        </Link>

        {/* Desktop */}
        <nav className="hidden gap-6 text-sm sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile button */}
        <button
          onClick={() => setOpen(!open)}
          className="text-xl sm:hidden"
          style={{ color: "var(--foreground)" }}
        >
          ☰
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div
          className="sm:hidden border-t px-4 py-3 text-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--card)",
          }}
        >
          <div className="flex flex-col gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="transition"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
