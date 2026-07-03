"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
};

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    opacity: number;
  }>({ left: 0, width: 0, opacity: 0 });

  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const links: NavLink[] = useMemo(
    () => [
      { href: "/", label: "Home" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/war-info", label: "War Info" },
      { href: "/contributions", label: "Contributions" },
      { href: "/settings", label: "Settings" },
    ],
    []
  );

  const activeLink = useMemo(() => {
    const sorted = [...links].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((link) =>
      link.href === "/"
        ? pathname === "/"
        : pathname === link.href || pathname.startsWith(`${link.href}/`)
    );
  }, [links, pathname]);

  useEffect(() => {
    const updateIndicator = () => {
      const navEl = navRef.current;
      const activeEl = activeLink ? itemRefs.current[activeLink.href] : null;

      if (!navEl || !activeEl) {
        setIndicator((prev) => ({ ...prev, opacity: 0 }));
        return;
      }

      const navRect = navEl.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();

      setIndicator({
        left: activeRect.left - navRect.left,
        width: activeRect.width,
        opacity: 1,
      });
    };

    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeLink, pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }

    if (!mounted) return;

    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur"
      style={{
        background: "rgba(0,0,0,0.4)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="font-bold tracking-widest transition"
          style={{ color: "var(--foreground)" }}
        >
          MCWV
        </Link>

        <nav
          ref={navRef}
          className="relative hidden items-center gap-1 rounded-full border px-1 py-1 sm:flex"
          style={{
            borderColor: "var(--border)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <div
            className="absolute inset-y-1 left-0 rounded-full transition-all duration-300 ease-out"
            style={{
              left: indicator.left,
              width: indicator.width,
              opacity: indicator.opacity,
              background: "rgba(255,255,255,0.08)",
              boxShadow: "0 0 18px rgba(255,255,255,0.08)",
            }}
          />
          {links.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href}
                ref={(el) => {
                  itemRefs.current[link.href] = el;
                }}
                className="relative z-10 rounded-full px-3 py-1 text-sm transition-colors duration-200"
                style={{
                  color: "var(--foreground)",
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-md p-2 sm:hidden"
          style={{ color: "var(--foreground)" }}
          aria-label="Open navigation menu"
          aria-expanded={open}
        >
          <span className="flex h-5 w-5 flex-col justify-between">
            <span className="h-0.5 w-full rounded-full bg-current" />
            <span className="h-0.5 w-full rounded-full bg-current" />
            <span className="h-0.5 w-full rounded-full bg-current" />
          </span>
        </button>
      </div>

      {mounted && (
        <>
          <button
            className={`fixed inset-0 z-50 sm:hidden transition-opacity duration-200 ${
              open ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setOpen(false)}
            aria-label="Close navigation overlay"
            style={{ background: "rgba(0,0,0,0.55)" }}
          />
          <aside
            className={`fixed top-0 right-0 z-50 h-full w-[82vw] max-w-xs border-l backdrop-blur-sm sm:hidden transition-transform duration-200 ease-out will-change-transform ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
            style={{
              background: "rgba(7,7,7,0.96)",
              borderColor: "var(--border)",
              boxShadow: "-18px 0 40px rgba(0,0,0,0.4)",
            }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="font-bold tracking-widest"
                style={{ color: "var(--foreground)" }}
              >
                MCWV
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-lg"
                style={{ color: "var(--foreground)" }}
                aria-label="Close navigation menu"
              >
                ×
              </button>
            </div>

            <nav className="flex flex-col gap-2 p-4">
              {links.map((link) => {
                const isActive =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-2xl px-4 py-3 text-sm transition"
                    style={{
                      color: "var(--foreground)",
                      background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                      border: `1px solid ${isActive ? "var(--border)" : "transparent"}`,
                      opacity: isActive ? 1 : 0.75,
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </>
      )}
    </header>
  );
}
