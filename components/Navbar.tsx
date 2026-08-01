"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  description?: string;
  officerOnly?: boolean;
};

type NavGroup =
  | {
      type: "link";
      id: string;
      href: string;
      label: string;
      icon?: string;
      officerOnly?: boolean;
    }
  | {
      type: "group";
      id: string;
      label: string;
      icon?: string;
      officerOnly?: boolean;
      links: NavLink[];
    };

type NavbarUser = {
  role?: string | null;
} | null;

const SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<NavbarUser>(null);
  const [activeAdminSection, setActiveAdminSection] = useState<string | null>(null);
  const [renderDrawer, setRenderDrawer] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const [collapseNav, setCollapseNav] = useState(false);
  const [pillGlow, setPillGlow] = useState<{ x: number; opacity: number }>({ x: 0, opacity: 0 });
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    opacity: number;
  }>({ left: 0, width: 0, opacity: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLAnchorElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const closeTimerRef = useRef<number | null>(null);
  const groupCloseTimerRef = useRef<number | null>(null);
  const measuredNavWidthRef = useRef(0);

  const isOfficer = user?.role === "officer" || user?.role === "owner";

  const navGroups: NavGroup[] = useMemo(
    () => ([
      { type: "link", id: "home", href: "/", label: "Home", icon: "⌂" },
      {
        type: "group",
        id: "war",
        label: "War",
        icon: "⚔",
        links: [
          { href: "/war-info", label: "War Info", description: "Simple live war overview" },
          { href: "/leaderboard", label: "Leaderboard", description: "Member contribution rankings" },
          { href: "/war-analyst", label: "Battle HQ", description: "Race analytics and projections" },
          { href: "/contributions", label: "Contributions", description: "Charts and clan activity" },
        ],
      },
      {
        type: "group",
        id: "reports",
        label: "Reports",
        icon: "📊",
        links: [
          { href: "/war-reports", label: "War Reports", description: "Grades, MVPs, and war history" },
          { href: "/achievements", label: "Achievements", description: "Clan placements and milestones" },
          { href: "/hall-of-fame", label: "Hall of Fame", description: "Top members and legends" },
        ],
      },
      {
        type: "group",
        id: "staff",
        label: "Staff",
        icon: "🛠",
        officerOnly: true,
        links: [
          { href: "/admin?section=activity", label: "Activity Monitor", description: "Low PPH, zeros, disconnects" },
          { href: "/admin?section=tickets", label: "Tickets", description: "Application tickets" },
          { href: "/admin?section=bot", label: "Bot Controls", description: "Automation and bot health" },
          { href: "/admin?section=broadcast", label: "Broadcast", description: "Send staff announcements" },
          { href: "/admin?section=players", label: "Players", description: "Tracked members and presence" },
          { href: "/admin?section=events", label: "Events", description: "Giveaways and invite events" },
          { href: "/admin?section=logs", label: "Logs", description: "Audit and bot logs" },
          { href: "/admin", label: "Admin Overview", description: "Control panel overview" },
        ],
      },
      { type: "link", id: "settings", href: "/settings", label: "Settings", icon: "⚙" },
    ] as NavGroup[]).filter((item) => !item.officerOnly || isOfficer),
    [isOfficer]
  );

  const isActiveHref = useMemo(() => {
    return (href: string) => {
      const [baseHref, query = ""] = href.split("?");
      const querySection = new URLSearchParams(query).get("section");

      if (href === "/") return pathname === "/";
      if (baseHref === "/admin" && querySection) {
        return pathname === "/admin" && activeAdminSection === querySection;
      }
      if (href === "/admin") return pathname === "/admin" && !activeAdminSection;
      return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
    };
  }, [pathname, activeAdminSection]);

  const activeTopId = useMemo(() => {
    const active = navGroups.find((item) => {
      if (item.type === "link") return isActiveHref(item.href);
      return item.links.some((link) => isActiveHref(link.href));
    });

    return active?.id ?? null;
  }, [navGroups, isActiveHref]);

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
    measuredNavWidthRef.current = 0;

    const updateResponsiveNav = () => {
      const containerEl = containerRef.current;
      const brandEl = brandRef.current;
      const navEl = navRef.current;

      if (!containerEl || !brandEl) return;

      if (window.innerWidth < 1024) {
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
      if (!navWidth) {
        setCollapseNav(false);
        return;
      }

      setCollapseNav(brandWidth + navWidth + 96 > containerWidth);
    };

    updateResponsiveNav();

    const observer = new ResizeObserver(updateResponsiveNav);
    if (containerRef.current) observer.observe(containerRef.current);

    window.addEventListener("resize", updateResponsiveNav, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateResponsiveNav);
    };
  }, [navGroups]);

  useEffect(() => {
    const updateIndicator = () => {
      const navEl = navRef.current;
      const activeEl = activeTopId ? itemRefs.current[activeTopId] : null;

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
  }, [activeTopId, pathname, collapseNav]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock page scroll while the mobile drawer is open.
  useEffect(() => {
    if (!renderDrawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [renderDrawer]);

  // Escape closes the drawer and any open desktop dropdown.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openGroup) setOpenGroup(null);
      if (open) closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openGroup]);

  function openDrawer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    // Open the section containing the current page first.
    setMobileGroup((current) => current ?? activeTopId);
    setRenderDrawer(true);
    window.requestAnimationFrame(() => setOpen(true));
  }

  function openDesktopGroup(id: string) {
    if (groupCloseTimerRef.current !== null) {
      window.clearTimeout(groupCloseTimerRef.current);
      groupCloseTimerRef.current = null;
    }
    setOpenGroup(id);
  }

  function closeDesktopGroupSoon(id: string) {
    if (groupCloseTimerRef.current !== null) {
      window.clearTimeout(groupCloseTimerRef.current);
    }

    groupCloseTimerRef.current = window.setTimeout(() => {
      setOpenGroup((current) => (current === id ? null : current));
      groupCloseTimerRef.current = null;
    }, 120);
  }

  function closeDrawer() {
    setOpen(false);

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setRenderDrawer(false);
      closeTimerRef.current = null;
    }, 320);
  }

  useEffect(() => {
    if (collapseNav) return;
    if (typeof window !== "undefined" && window.innerWidth >= 1024 && open) {
      closeDrawer();
    }
  }, [collapseNav, open]);

  useEffect(() => {
    const timer = window.setTimeout(closeDrawer, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      if (groupCloseTimerRef.current !== null) window.clearTimeout(groupCloseTimerRef.current);
    };
  }, []);

  function onNavPointerMove(event: React.PointerEvent<HTMLElement>) {
    const navEl = navRef.current;
    if (!navEl) return;
    const rect = navEl.getBoundingClientRect();
    setPillGlow({ x: event.clientX - rect.left, opacity: 1 });
  }

  function DesktopMenuItem({ item }: { item: NavGroup }) {
    const active = activeTopId === item.id;
    const itemStyle: React.CSSProperties = {
      color: active ? "var(--accent)" : "var(--foreground)",
      opacity: active ? 1 : 0.78,
      textShadow: active ? "0 0 16px var(--glow)" : "none",
    };

    if (item.type === "link") {
      return (
        <Link
          href={item.href}
          ref={(el) => {
            itemRefs.current[item.id] = el;
          }}
          className="relative z-10 rounded-full px-3 py-1 text-sm transition-all duration-200 ease-out hover:-translate-y-[1px] hover:opacity-100 active:scale-[0.97]"
          style={itemStyle}
        >
          {item.label}
        </Link>
      );
    }

    const isOpen = openGroup === item.id;

    return (
      <div
        className="relative z-20"
        onMouseEnter={() => openDesktopGroup(item.id)}
        onMouseLeave={() => closeDesktopGroupSoon(item.id)}
        onFocus={() => openDesktopGroup(item.id)}
      >
        <button
          type="button"
          ref={(el) => {
            itemRefs.current[item.id] = el;
          }}
          onClick={() => setOpenGroup((current) => (current === item.id ? null : item.id))}
          className="relative z-10 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-all duration-200 ease-out hover:-translate-y-[1px] hover:opacity-100 active:scale-[0.97]"
          style={itemStyle}
          aria-expanded={isOpen}
        >
          <span>{item.label}</span>
          <span
            className="text-[10px]"
            style={{
              display: "inline-block",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: `transform 240ms ${SPRING}`,
            }}
          >
            ⌄
          </span>
        </button>

        <div
          className="absolute left-1/2 top-full mt-3 w-72 -translate-x-1/2 overflow-hidden rounded-3xl border p-2 shadow-2xl backdrop-blur-xl"
          style={{
            background: "rgba(6,6,8,0.94)",
            borderColor: "var(--border)",
            boxShadow: "0 22px 70px rgba(0,0,0,0.5), 0 0 28px rgba(255,255,255,0.04)",
            pointerEvents: isOpen ? "auto" : "none",
            opacity: isOpen ? 1 : 0,
            transform: isOpen
              ? "translate(-50%, 0) scale(1)"
              : "translate(-50%, 6px) scale(0.97)",
            transformOrigin: "top center",
            transition: `opacity 180ms ease-out, transform 280ms ${SPRING}`,
          }}
        >
          <div className="absolute -top-3 left-0 h-3 w-full" />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 70%, transparent), transparent)",
            }}
          />
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            {item.icon} {item.label}
          </div>
          <div className="grid gap-1">
            {item.links.map((link, index) => {
              const activeLink = isActiveHref(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpenGroup(null)}
                  className="group rounded-2xl border px-3 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:bg-white/10"
                  style={{
                    borderColor: activeLink ? "var(--border)" : "transparent",
                    background: activeLink ? "rgba(255,255,255,0.08)" : "transparent",
                    animation: isOpen
                      ? `nav-drop-item-in 280ms ${SPRING} ${50 + index * 35}ms backwards`
                      : "none",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="text-sm font-semibold text-white"
                      style={activeLink ? { color: "var(--accent)", textShadow: "0 0 14px var(--glow)" } : undefined}
                    >
                      {link.label}
                    </span>
                    <span className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300">→</span>
                  </div>
                  {link.description && <p className="mt-1 text-xs leading-5 text-zinc-500">{link.description}</p>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur animate-fade-in"
      style={{
        background: isScrolled ? "rgba(0,0,0,0.62)" : "rgba(0,0,0,0.42)",
        borderColor: "var(--border)",
        boxShadow: isScrolled ? "0 12px 34px rgba(0,0,0,0.24)" : "none",
        transition: "background 220ms ease, box-shadow 220ms ease, backdrop-filter 220ms ease",
        backdropFilter: isScrolled ? "blur(20px)" : "blur(12px)",
      }}
    >
      {/* Thin gradient accent line along the very top of the navbar */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px nav-accent-line"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--accent) 60%, transparent) 50%, transparent 100%)",
          opacity: isScrolled ? 1 : 0.55,
          transition: "opacity 300ms ease",
        }}
      />

      <div
        ref={containerRef}
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 transition-[padding] duration-300"
        style={{ paddingTop: isScrolled ? 8 : 12, paddingBottom: isScrolled ? 8 : 12 }}
      >
        <Link
          ref={brandRef}
          href="/"
          className="group flex shrink-0 items-center gap-2.5 transition duration-200 ease-out hover:scale-[1.03] active:scale-[0.98]"
          aria-label="MCWV home"
        >
          <span
            className="grid h-8 w-8 place-items-center rounded-xl border text-sm"
            style={{
              borderColor: "var(--border)",
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.04)), rgba(255,255,255,0.02))",
              boxShadow: "0 0 18px var(--glow), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            ⚔️
          </span>
          <span className="nav-brand-text text-lg font-black tracking-[0.22em]">
            MCWV
          </span>
        </Link>

        <nav
          ref={navRef}
          onPointerMove={onNavPointerMove}
          onPointerLeave={() => setPillGlow((prev) => ({ ...prev, opacity: 0 }))}
          className={`relative min-w-0 items-center gap-1 rounded-full border px-1 py-1 ${collapseNav ? "hidden" : "hidden lg:flex"}`}
          style={{
            borderColor: "var(--border)",
            background: "rgba(255,255,255,0.045)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* Spotlight glow that follows the pointer across the pill */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(150px circle at ${pillGlow.x}px 50%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)`,
              opacity: pillGlow.opacity,
              transition: "opacity 240ms ease",
            }}
          />
          {/* Sliding active pill with spring physics */}
          <div
            className="absolute inset-y-1 left-0 rounded-full"
            style={{
              left: indicator.left,
              width: indicator.width,
              opacity: indicator.opacity,
              background: "rgba(255,255,255,0.09)",
              boxShadow: "0 0 20px var(--glow), inset 0 1px 0 rgba(255,255,255,0.06)",
              transition: `left 340ms ${SPRING}, width 340ms ${SPRING}, opacity 200ms ease, box-shadow 340ms ease`,
            }}
          />
          {navGroups.map((item) => <DesktopMenuItem key={item.id} item={item} />)}
        </nav>

        <button
          onClick={open ? closeDrawer : openDrawer}
          className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition duration-200 ease-out hover:bg-white/5 active:scale-[0.94] ${collapseNav ? "" : "lg:hidden"}`}
          style={{ color: "var(--foreground)", borderColor: "var(--border)" }}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
        >
          <span className="relative block h-5 w-5">
            <span
              className="absolute left-0 top-0 h-0.5 w-full rounded-full bg-current"
              style={{
                transform: open ? "translateY(8px) rotate(45deg)" : "translateY(0) rotate(0deg)",
                transition: `transform 300ms ${SPRING}`,
              }}
            />
            <span
              className="absolute left-0 top-2 h-0.5 w-full rounded-full bg-current"
              style={{
                opacity: open ? 0 : 1,
                transform: open ? "scaleX(0.4)" : "scaleX(1)",
                transition: `opacity 180ms ease, transform 300ms ${SPRING}`,
              }}
            />
            <span
              className="absolute left-0 top-4 h-0.5 w-full rounded-full bg-current"
              style={{
                transform: open ? "translateY(-8px) rotate(-45deg)" : "translateY(0) rotate(0deg)",
                transition: `transform 300ms ${SPRING}`,
              }}
            />
          </span>
        </button>
      </div>

      {renderDrawer && (
        <>
          <button
            className={`fixed inset-0 z-50 ${collapseNav ? "" : "lg:hidden"}`}
            onClick={closeDrawer}
            aria-label="Close navigation overlay"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: open ? "blur(6px)" : "blur(0px)",
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition: "opacity 240ms ease, backdrop-filter 240ms ease",
            }}
          />
          <aside
            className={`fixed right-0 top-0 z-50 flex h-screen w-[min(23rem,90vw)] flex-col overflow-hidden border-l ${collapseNav ? "" : "lg:hidden"}`}
            style={{
              background: "linear-gradient(180deg, rgba(7,7,9,0.99) 0%, rgba(9,10,14,0.99) 100%)",
              borderColor: "var(--border)",
              boxShadow: "-22px 0 48px rgba(0,0,0,0.5)",
              transform: open ? "translateX(0)" : "translateX(104%)",
              transition: `transform 340ms ${SPRING}`,
              willChange: "transform",
            }}
          >
            {/* Gradient strip at the top edge of the drawer */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px] nav-accent-line"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--accent) 75%, transparent) 50%, transparent 100%)",
              }}
            />

            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <span className="nav-brand-text text-base font-black tracking-[0.22em]">MCWV</span>
              <button
                onClick={closeDrawer}
                className="grid h-9 w-9 place-items-center rounded-xl border text-lg transition duration-200 ease-out hover:bg-white/5 active:scale-[0.94]"
                style={{ color: "var(--foreground)", borderColor: "var(--border)" }}
                aria-label="Close navigation menu"
              >
                ×
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <div className="flex flex-col gap-3">
                {navGroups.map((item, groupIndex) => {
                  const cascadeStyle: React.CSSProperties = {
                    opacity: open ? 1 : 0,
                    transform: open ? "translateX(0)" : "translateX(20px)",
                    transition: `opacity 280ms ease, transform 420ms ${SPRING}`,
                    transitionDelay: open ? `${60 + groupIndex * 40}ms` : "0ms",
                  };

                  if (item.type === "link") {
                    const active = isActiveHref(item.href);
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={closeDrawer}
                        className="relative flex min-h-[52px] items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all duration-200 ease-out active:scale-[0.98]"
                        style={{
                          ...cascadeStyle,
                          color: active ? "var(--accent)" : "var(--foreground)",
                          background: active ? "rgba(255,255,255,0.07)" : "transparent",
                          border: `1px solid ${active ? "var(--border)" : "transparent"}`,
                        }}
                      >
                        {active && (
                          <span
                            className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                            style={{ background: "var(--accent)", boxShadow: "0 0 12px var(--glow)" }}
                          />
                        )}
                        <span className="text-base">{item.icon}</span>
                        <span className="font-semibold">{item.label}</span>
                      </Link>
                    );
                  }

                  const groupOpen = mobileGroup === item.id;
                  return (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
                      style={cascadeStyle}
                    >
                      <button
                        type="button"
                        onClick={() => setMobileGroup((current) => (current === item.id ? null : item.id))}
                        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition duration-200 hover:bg-white/[0.04] active:scale-[0.99]"
                        aria-expanded={groupOpen}
                      >
                        <span className="flex items-center gap-3">
                          <span className="text-base">{item.icon}</span>
                          <span className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--foreground)" }}>
                            {item.label}
                          </span>
                        </span>
                        <span
                          className="grid h-6 w-6 place-items-center rounded-full border text-[10px] text-zinc-400"
                          style={{
                            borderColor: "var(--border)",
                            transform: groupOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: `transform 260ms ${SPRING}`,
                          }}
                        >
                          ⌄
                        </span>
                      </button>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateRows: groupOpen ? "1fr" : "0fr",
                          transition: `grid-template-rows 300ms ${SPRING}`,
                        }}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="grid gap-1 px-2 pb-2">
                            {item.links.map((link, linkIndex) => {
                              const active = isActiveHref(link.href);
                              return (
                                <Link
                                  key={link.href}
                                  href={link.href}
                                  onClick={closeDrawer}
                                  className="relative flex min-h-[48px] flex-col justify-center rounded-2xl px-4 py-2.5 text-sm transition-all duration-200 ease-out active:scale-[0.98]"
                                  style={{
                                    color: active ? "var(--accent)" : "var(--foreground)",
                                    background: active ? "rgba(255,255,255,0.07)" : "transparent",
                                    border: `1px solid ${active ? "var(--border)" : "transparent"}`,
                                    opacity: groupOpen ? 1 : 0,
                                    transform: groupOpen ? "translateY(0)" : "translateY(-4px)",
                                    transition: `opacity 220ms ease, transform 300ms ${SPRING}, background 200ms ease`,
                                    transitionDelay: groupOpen ? `${80 + linkIndex * 30}ms` : "0ms",
                                  }}
                                >
                                  {active && (
                                    <span
                                      className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                                      style={{ background: "var(--accent)", boxShadow: "0 0 12px var(--glow)" }}
                                    />
                                  )}
                                  <span className="font-semibold">{link.label}</span>
                                  {link.description && (
                                    <span className="mt-0.5 text-xs leading-5 text-zinc-500">{link.description}</span>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </nav>

            <div
              className="border-t px-5 py-4"
              style={{
                borderColor: "var(--border)",
                opacity: open ? 1 : 0,
                transform: open ? "translateY(0)" : "translateY(8px)",
                transition: `opacity 260ms ease 260ms, transform 380ms ${SPRING} 260ms`,
              }}
            >
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="font-semibold uppercase tracking-[0.2em]">MCWV Hub</span>
                {isOfficer && (
                  <span
                    className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                    style={{
                      borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
                      color: "var(--accent)",
                      background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                    }}
                  >
                    {user?.role === "owner" ? "Owner" : "Officer"}
                  </span>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </header>
  );
}
