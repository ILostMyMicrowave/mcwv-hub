"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  officerOnly?: boolean;
};

type NavbarUser = {
  role?: string | null;
} | null;

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<NavbarUser>(null);
  const [activeAdminSection, setActiveAdminSection] = useState<string | null>(null);
  const [renderDrawer, setRenderDrawer] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    opacity: number;
  }>({ left: 0, width: 0, opacity: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLAnchorElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const closeTimerRef = useRef<number | null>(null);
  const measuredNavWidthRef = useRef(0);
  const [collapseNav, setCollapseNav] = useState(false);

  const isOfficer = user?.role === "officer" || user?.role === "owner";

  const links: NavLink[] = useMemo(
    () => [
      { href: "/", label: "Home" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/war-info", label: "War Info" },
      { href: "/war-analyst", label: "Battle HQ" },
      { href: "/war-reports", label: "War Reports" },
      { href: "/contributions", label: "Contributions" },
      { href: "/admin?section=tickets", label: "Tickets", officerOnly: true },
      { href: "/admin", label: "Admin", officerOnly: true },
      { href: "/settings", label: "Settings" },
    ].filter((link) => !link.officerOnly || isOfficer),
    [isOfficer]
  );

  const isActiveHref = useMemo(() => {
    return (href: string) => {
      if (href === "/") return pathname === "/";
      if (href === "/admin?section=tickets") return pathname === "/admin" && activeAdminSection === "tickets";
      if (href === "/admin") return pathname === "/admin" && activeAdminSection !== "tickets";
      const baseHref = href.split("?")[0];
      return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
    };
  }, [pathname, activeAdminSection]);

  const activeLink = useMemo(() => {
    const sorted = [...links].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((link) => isActiveHref(link.href));
  }, [links, isActiveHref]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setUser(data.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const updateSection = () => {
      if (typeof window === "undefined") return;
      setActiveAdminSection(new URLSearchParams(window.location.search).get("section"));
    };

    updateSection();
    window.addEventListener("popstate", updateSection);
    window.addEventListener("hashchange", updateSection);
    return () => {
      window.removeEventListener("popstate", updateSection);
      window.removeEventListener("hashchange", updateSection);
    };
  }, [pathname]);

  useEffect(() => {
    const updateResponsiveNav = () => {
      const containerEl = containerRef.current;
      const brandEl = brandRef.current;
      const navEl = navRef.current;

      if (!containerEl || !brandEl) return;

      // Always use the drawer on mobile/tablet. This avoids the browser toolbar /
      // visual viewport resize jank that was making the drawer feel like it
      // zoomed or glitched on some screens.
      if (window.innerWidth < 1280) {
        setCollapseNav(true);
        return;
      }

      const containerWidth = containerEl.clientWidth;
      const brandWidth = brandEl.getBoundingClientRect().width;

      if (navEl && navEl.scrollWidth > 0) {
        measuredNavWidthRef.current = Math.max(
          measuredNavWidthRef.current,
          navEl.scrollWidth
        );
      }

      const navWidth = measuredNavWidthRef.current;
      if (!navWidth) return;

      // Brand + nav + breathing room. If the full nav would squeeze/collide,
      // keep the hamburger drawer even on desktop-sized custom widths.
      const requiredWidth = brandWidth + navWidth + 96;
      setCollapseNav(requiredWidth > containerWidth);
    };

    updateResponsiveNav();

    const observer = new ResizeObserver(updateResponsiveNav);
    if (containerRef.current) observer.observe(containerRef.current);

    window.addEventListener("resize", updateResponsiveNav, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateResponsiveNav);
    };
  }, [links]);

  useEffect(() => {
    const updateIndicator = () => {
      const navEl = navRef.current;
      const activeEl = activeLink ? itemRefs.current[activeLink.href] : null;

      if (collapseNav || !navEl || !activeEl) {
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
  }, [activeLink, pathname, collapseNav]);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function openDrawer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setRenderDrawer(true);

    window.requestAnimationFrame(() => {
      setOpen(true);
    });
  }

  function closeDrawer() {
    setOpen(false);

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setRenderDrawer(false);
      closeTimerRef.current = null;
    }, 300);
  }

  useEffect(() => {
    if (collapseNav) return;
    if (typeof window !== "undefined" && window.innerWidth >= 1280 && open) {
      closeDrawer();
    }
  }, [collapseNav, open]);

  useEffect(() => {
    const timer = window.setTimeout(closeDrawer, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);


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
      <div ref={containerRef} className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          ref={brandRef}
          href="/"
          className="shrink-0 font-bold tracking-widest transition duration-300 ease-out hover:scale-[1.02]"
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
          className={`relative min-w-0 items-center gap-1 rounded-full border px-1 py-1 ${collapseNav ? "hidden" : "hidden xl:flex"}`}
          style={{
            borderColor: "var(--border)",
            background: "rgba(255,255,255,0.04)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div
            className="absolute inset-y-1 left-0 rounded-full transition-[left,width,opacity,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              left: indicator.left,
              width: indicator.width,
              opacity: indicator.opacity,
              background: "rgba(255,255,255,0.08)",
              boxShadow: "0 0 18px rgba(255,255,255,0.08)",
            }}
          />
          {links.map((link) => {
            const isActive = isActiveHref(link.href);

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
          onClick={open ? closeDrawer : openDrawer}
          className={`inline-flex shrink-0 items-center justify-center rounded-md p-2 transition duration-200 ease-out active:scale-[0.96] ${collapseNav ? "" : "xl:hidden"}`}
          style={{ color: "var(--foreground)" }}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
        >
          <span className="relative h-5 w-5">
            <span className={`absolute left-0 top-0 h-0.5 w-full rounded-full bg-current transition-transform duration-300 ease-out ${open ? "translate-y-2 rotate-45" : "translate-y-0 rotate-0"}`} />
            <span className={`absolute left-0 top-2 h-0.5 w-full rounded-full bg-current transition-opacity duration-200 ease-out ${open ? "opacity-0" : "opacity-100"}`} />
            <span className={`absolute left-0 top-4 h-0.5 w-full rounded-full bg-current transition-transform duration-300 ease-out ${open ? "-translate-y-2 -rotate-45" : "translate-y-0 rotate-0"}`} />
          </span>
        </button>
      </div>

      {renderDrawer && (
        <>
          <button
            className={`fixed inset-0 z-50 transition-opacity duration-200 ${collapseNav ? "" : "xl:hidden"} ${
              open ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={closeDrawer}
            aria-label="Close navigation overlay"
            style={{ background: "rgba(0,0,0,0.6)" }}
          />
          <aside
            className={`fixed right-0 top-0 z-50 h-screen w-[min(22rem,86vw)] overflow-y-auto overscroll-contain border-l transition-transform duration-300 ease-out will-change-transform ${collapseNav ? "" : "xl:hidden"} ${
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
                const isActive = isActiveHref(link.href);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeDrawer}
                    className="rounded-2xl px-4 py-3 text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]"
                    style={{
                      color: "var(--foreground)",
                      background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                      border: `1px solid ${isActive ? "var(--border)" : "transparent"}`,
                      opacity: open ? (isActive ? 1 : 0.78) : 0,
                      transform: open ? "translateX(0)" : "translateX(18px)",
                      transitionDelay: open ? `${90 + index * 35}ms` : "0ms",
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
