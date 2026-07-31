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

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<NavbarUser>(null);
  const [activeAdminSection, setActiveAdminSection] = useState<string | null>(null);
  const [renderDrawer, setRenderDrawer] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [collapseNav, setCollapseNav] = useState(false);
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

  const flatLinks = useMemo(() => {
    return navGroups.flatMap((item) =>
      item.type === "link"
        ? [{ href: item.href, label: item.label, officerOnly: item.officerOnly }]
        : item.links.filter((link) => !link.officerOnly || isOfficer)
    );
  }, [navGroups, isOfficer]);

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

  function openDrawer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

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
    }, 200);
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

  function DesktopMenuItem({ item }: { item: NavGroup }) {
    const active = activeTopId === item.id;

    if (item.type === "link") {
      return (
        <Link
          href={item.href}
          ref={(el) => {
            itemRefs.current[item.id] = el;
          }}
          className="relative z-10 rounded-full px-3 py-1 text-sm transition-all duration-200 ease-out hover:-translate-y-[1px] hover:opacity-100 active:scale-[0.98]"
          style={{ color: "var(--foreground)", opacity: active ? 1 : 0.72 }}
        >
          {item.label}
        </Link>
      );
    }

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
          className="relative z-10 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-all duration-200 ease-out hover:-translate-y-[1px] hover:opacity-100 active:scale-[0.98]"
          style={{ color: "var(--foreground)", opacity: active ? 1 : 0.72 }}
          aria-expanded={openGroup === item.id}
        >
          <span>{item.label}</span>
          <span className={`text-[10px] transition-transform duration-200 ${openGroup === item.id ? "rotate-180" : "rotate-0"}`}>⌄</span>
        </button>

        <div
          className={`absolute left-1/2 top-full mt-3 w-72 -translate-x-1/2 rounded-3xl border p-2 shadow-2xl backdrop-blur-xl transition-[opacity,transform] duration-200 ease-out ${
            openGroup === item.id
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-1 scale-[0.98] opacity-0"
          }`}
          style={{
            background: "rgba(5,5,5,0.94)",
            borderColor: "var(--border)",
            boxShadow: "0 22px 70px rgba(0,0,0,0.45), 0 0 28px rgba(255,255,255,0.04)",
          }}
        >
          <div className="absolute -top-3 left-0 h-3 w-full" />
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            {item.icon} {item.label}
          </div>
          <div className="grid gap-1">
            {item.links.map((link) => {
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
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{link.label}</span>
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
        background: isScrolled ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.4)",
        borderColor: "var(--border)",
        boxShadow: isScrolled ? "0 10px 30px rgba(0,0,0,0.18)" : "none",
        transition: "background 200ms ease, box-shadow 200ms ease, backdrop-filter 200ms ease",
        backdropFilter: isScrolled ? "blur(18px)" : "blur(12px)",
      }}
    >
      <div ref={containerRef} className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          ref={brandRef}
          href="/"
          className="shrink-0 font-bold tracking-widest transition duration-200 ease-out hover:scale-[1.02]"
          style={{ color: "var(--foreground)", textShadow: "0 0 0 transparent" }}
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
          className={`relative min-w-0 items-center gap-1 rounded-full border px-1 py-1 ${collapseNav ? "hidden" : "hidden lg:flex"}`}
          style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
        >
          <div
            className="absolute inset-y-1 left-0 rounded-full transition-[left,width,opacity,box-shadow] duration-200 ease-out"
            style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity, background: "rgba(255,255,255,0.08)", boxShadow: "0 0 18px rgba(255,255,255,0.08)" }}
          />
          {navGroups.map((item) => <DesktopMenuItem key={item.id} item={item} />)}
        </nav>

        <button
          onClick={open ? closeDrawer : openDrawer}
          className={`inline-flex shrink-0 items-center justify-center rounded-md p-2 transition duration-200 ease-out active:scale-[0.96] ${collapseNav ? "" : "lg:hidden"}`}
          style={{ color: "var(--foreground)" }}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
        >
          <span className="relative h-5 w-5">
            <span className={`absolute left-0 top-0 h-0.5 w-full rounded-full bg-current transition-transform duration-200 ease-out ${open ? "translate-y-2 rotate-45" : "translate-y-0 rotate-0"}`} />
            <span className={`absolute left-0 top-2 h-0.5 w-full rounded-full bg-current transition-opacity duration-200 ease-out ${open ? "opacity-0" : "opacity-100"}`} />
            <span className={`absolute left-0 top-4 h-0.5 w-full rounded-full bg-current transition-transform duration-200 ease-out ${open ? "-translate-y-2 -rotate-45" : "translate-y-0 rotate-0"}`} />
          </span>
        </button>
      </div>

      {renderDrawer && (
        <>
          <button
            className={`fixed inset-0 z-50 transition-opacity duration-200 ${collapseNav ? "" : "lg:hidden"} ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
            onClick={closeDrawer}
            aria-label="Close navigation overlay"
            style={{ background: "rgba(0,0,0,0.6)" }}
          />
          <aside
            className={`fixed right-0 top-0 z-50 h-screen w-[min(23rem,88vw)] overflow-y-auto overscroll-contain border-l transition-transform duration-200 ease-out will-change-transform ${collapseNav ? "" : "lg:hidden"} ${open ? "translate-x-0" : "translate-x-full"}`}
            style={{ background: "linear-gradient(180deg, rgba(7,7,7,0.99) 0%, rgba(10,10,10,0.99) 100%)", borderColor: "var(--border)", boxShadow: "-18px 0 40px rgba(0,0,0,0.45)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
              <div className="font-bold tracking-widest" style={{ color: "var(--foreground)" }}>MCWV</div>
              <button onClick={closeDrawer} className="rounded-md px-2 py-1 text-lg transition duration-200 ease-out active:scale-[0.96]" style={{ color: "var(--foreground)" }} aria-label="Close navigation menu">×</button>
            </div>

            <nav className="flex flex-col gap-4 p-4">
              {navGroups.map((item, groupIndex) => {
                if (item.type === "link") {
                  const active = isActiveHref(item.href);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={closeDrawer}
                      className="rounded-2xl px-4 py-3 text-sm transition-all duration-200 ease-out active:scale-[0.98]"
                      style={{
                        color: "var(--foreground)",
                        background: active ? "rgba(255,255,255,0.08)" : "transparent",
                        border: `1px solid ${active ? "var(--border)" : "transparent"}`,
                        opacity: open ? 1 : 0,
                        transform: open ? "translateX(0)" : "translateX(14px)",
                        transitionDelay: open ? `${50 + groupIndex * 25}ms` : "0ms",
                      }}
                    >
                      {item.icon ? `${item.icon} ` : ""}{item.label}
                    </Link>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-2 transition-all duration-200 ease-out"
                    style={{
                      opacity: open ? 1 : 0,
                      transform: open ? "translateX(0)" : "translateX(14px)",
                      transitionDelay: open ? `${50 + groupIndex * 25}ms` : "0ms",
                    }}
                  >
                    <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">{item.icon} {item.label}</div>
                    <div className="grid gap-1">
                      {item.links.map((link) => {
                        const active = isActiveHref(link.href);
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={closeDrawer}
                            className="rounded-2xl px-3 py-3 text-sm transition-all duration-200 ease-out active:scale-[0.98]"
                            style={{ color: "var(--foreground)", background: active ? "rgba(255,255,255,0.08)" : "transparent", border: `1px solid ${active ? "var(--border)" : "transparent"}` }}
                          >
                            <div className="font-semibold">{link.label}</div>
                            {link.description && <div className="mt-1 text-xs leading-5 text-zinc-500">{link.description}</div>}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>
        </>
      )}
    </header>
  );
}
