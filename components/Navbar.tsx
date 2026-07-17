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
  const [renderDrawer, setRenderDrawer] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    opacity: number;
  }>({ left: 0, width: 0, opacity: 0 });

  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const closeTimerRef = useRef<number | null>(null);

  const links: NavLink[] = useMemo(
    () => [
      { href: "/", label: "Home" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/war-info", label: "War Info" },
      { href: "/war-analyst", label: "Battle HQ" },
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
    const onScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    closeDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const openDrawer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setRenderDrawer(true);

    window.requestAnimationFrame(() => {
      setOpen(true);
    });
  };

  const closeDrawer = () => {
    setOpen(false);

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setRenderDrawer(false);
      closeTimerRef.current = null;
    }, 300);
  };

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur animate-fade-in"
      style={{
        background: isScrolled ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.4)",
        borderColor: "var(--border)",
        boxShadow: isScrolled ? "0 10px 30px rgba(0,0,0,0.18)" : "none",
        transition: "background 300ms ease, box-shadow 300ms ease, backdrop-filter 300ms ease",
        backdropFilter: isScrolled ? "blur(18px)" : "blur(12px)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="font-bold tracking-widest transition duration-300 ease-out hover:scale-[1.02]"
          style={{
            color: "var(--foreground)",
            textShadow: "0 0 0 transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textShadow = "0 0 18px var(--glow)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textShadow = "0 0 0 transparent";
          }}
        >
          MCWV
        </Link>

        <nav
          ref={navRef}
          className="relative hidden items-center gap-1 rounded-full border px-1 py-1 sm:flex"
          style={{
            borderColor: "var(--border)",
            background: "rgba(255,255,255,0.04)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
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
                className="relative z-10 rounded-full px-3 py-1 text-sm transition-all duration-200 ease-out hover:-translate-y-[1px] hover:opacity-100 active:scale-[0.98]"
                style={{
                  color: "var(--foreground)",
                  opacity: isActive ? 1 : 0.72,
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={openDrawer}
          className="inline-flex items-center justify-center rounded-md p-2 transition duration-200 ease-out active:scale-[0.96] sm:hidden"
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

      {renderDrawer && (
        <>
          <button
            className={`fixed inset-0 z-50 sm:hidden transition-opacity duration-300 ${
              open ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeDrawer}
            aria-label="Close navigation overlay"
            style={{ background: "rgba(0,0,0,0.6)" }}
          />
          <aside
            className={`fixed top-0 right-0 z-50 h-dvh w-[86vw] max-w-xs overflow-y-auto border-l sm:hidden transition-transform duration-300 ease-out will-change-transform ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
            style={{
              background:
                "linear-gradient(180deg, rgba(7,7,7,0.99) 0%, rgba(10,10,10,0.99) 100%)",
              borderColor: "var(--border)",
              boxShadow: "-18px 0 40px rgba(0,0,0,0.45)",
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
                onClick={closeDrawer}
                className="rounded-md px-2 py-1 text-lg transition duration-200 ease-out active:scale-[0.96]"
                style={{ color: "var(--foreground)" }}
                aria-label="Close navigation menu"
              >
                ×
              </button>
            </div>

            <nav className="flex flex-col gap-2 p-4">
              {links.map((link, index) => {
                const isActive =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeDrawer}
                    className="rounded-2xl px-4 py-3 text-sm transition-all duration-200 ease-out active:scale-[0.98]"
                    style={{
                      color: "var(--foreground)",
                      background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                      border: `1px solid ${isActive ? "var(--border)" : "transparent"}`,
                      opacity: isActive ? 1 : 0.78,
                      animationDelay: `${index * 30}ms`,
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
