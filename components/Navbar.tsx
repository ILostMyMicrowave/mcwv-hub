"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  description?: string;
  /** Desktop dropdown glyph. The mobile drawer ignores this on purpose. */
  icon?: string;
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

// Grace before a hover-opened desktop menu closes. The menu wrapper also
// physically bridges the button→panel gap with padding, so the grace is a
// nicety, not a requirement.
const CLOSE_DELAY_MS = 140;

type FocusRequest = { group: string; where: "first" | "last" | "button" };

function desktopItemStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? "var(--accent)" : "var(--foreground)",
    opacity: active ? 1 : 0.78,
    textShadow: active ? "0 0 16px var(--glow)" : "none",
  };
}

const DESKTOP_ITEM_CLASS =
  "relative z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-all duration-200 ease-out hover:-translate-y-[1px] hover:opacity-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

// ---------------------------------------------------------------------------
// Desktop nav items live at MODULE level on purpose: defining them inside
// Navbar creates a brand-new component type on every render, which remounted
// the whole pill (nuking hover, focus and every DOM node) on any state change.
// ---------------------------------------------------------------------------

function DesktopLinkItem({
  item,
  isActiveTop,
  registerRef,
}: {
  item: Extract<NavGroup, { type: "link" }>;
  isActiveTop: boolean;
  registerRef: (id: string, el: HTMLElement | null) => void;
}) {
  return (
    <Link
      href={item.href}
      ref={(el) => registerRef(item.id, el)}
      aria-current={isActiveTop ? "page" : undefined}
      className={DESKTOP_ITEM_CLASS}
      style={desktopItemStyle(isActiveTop)}
    >
      {item.icon ? (
        <span aria-hidden className="text-[12px] leading-none opacity-70">
          {item.icon}
        </span>
      ) : null}
      <span>{item.label}</span>
    </Link>
  );
}

type DesktopGroupItemProps = {
  item: Extract<NavGroup, { type: "group" }>;
  isActiveTop: boolean;
  isActiveHref: (href: string) => boolean;
  isOpen: boolean;
  reduceMotion: boolean;
  registerButton: (id: string, el: HTMLElement | null) => void;
  registerPanel: (id: string, el: HTMLElement | null) => void;
  onHoverOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onCloseSoon: (id: string) => void;
  onCloseNow: (id: string, opts?: { focusButton?: boolean }) => void;
  onOpenWithFocus: (id: string, where: "first" | "last") => void;
  onMenuKeyDown: (event: React.KeyboardEvent<HTMLElement>, groupId: string) => void;
};

/**
 * Desktop dropdown group. Fixes vs the old inline component:
 * - The dead-space between button and panel is padding on the hover wrapper,
 *   not a margin — the mouse can't "fall through the gap" and kill the menu.
 *   (The old mt-3 + mid-gap bridge div was clipped by overflow-hidden and did
 *   nothing, which is why menus snapped shut mid-move.)
 * - Closed menus are visibility:hidden + inert, so Tab can no longer land on
 *   invisible links.
 * - Full keyboard support: ↓ opens (first item), ↑ opens (last item),
 *   arrows/Home/End rove, Esc closes and returns focus, Tab closes, and
 *   moving focus out of the group closes it.
 */
function DesktopGroupItem({
  item,
  isActiveTop,
  isActiveHref,
  isOpen,
  reduceMotion,
  registerButton,
  registerPanel,
  onHoverOpen,
  onToggle,
  onCloseSoon,
  onCloseNow,
  onOpenWithFocus,
  onMenuKeyDown,
}: DesktopGroupItemProps) {
  const menuId = `nav-desktop-menu-${item.id}`;

  return (
    <div
      className="relative z-20"
      onMouseEnter={() => onHoverOpen(item.id)}
      onMouseLeave={() => onCloseSoon(item.id)}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) onCloseSoon(item.id);
      }}
    >
      <button
        type="button"
        ref={(el) => registerButton(item.id, el)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => onToggle(item.id)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onOpenWithFocus(item.id, "first");
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            onOpenWithFocus(item.id, "last");
          }
        }}
        className={DESKTOP_ITEM_CLASS}
        style={desktopItemStyle(isActiveTop)}
      >
        {item.icon ? (
          <span aria-hidden className="text-[12px] leading-none opacity-70">
            {item.icon}
          </span>
        ) : null}
        <span>{item.label}</span>
        <span
          aria-hidden
          className="text-[10px]"
          style={{
            display: "inline-block",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: reduceMotion ? "none" : `transform 240ms ${SPRING}`,
          }}
        >
          ⌄
        </span>
      </button>

      {/* Hover bridge wrapper: occupies the 12px gutter under the button
          (padding, not margin), so button → panel is one continuous hover
          target. Centered with a constant transform; only the panel animates. */}
      <div
        className="absolute left-1/2 top-full w-72 -translate-x-1/2 pt-3"
        style={{
          visibility: isOpen ? "visible" : "hidden",
          pointerEvents: isOpen ? "auto" : "none",
          transition: isOpen || reduceMotion ? "none" : "visibility 0s linear 320ms",
        }}
      >
        <div
          id={menuId}
          role="menu"
          aria-label={`${item.label} submenu`}
          aria-hidden={!isOpen}
          inert={isOpen ? undefined : true}
          ref={(el) => registerPanel(item.id, el)}
          className="overflow-hidden rounded-3xl border p-2 shadow-2xl backdrop-blur-xl"
          style={{
            background: "rgba(6,6,8,0.94)",
            borderColor: "var(--border)",
            boxShadow: "0 22px 70px rgba(0,0,0,0.5), 0 0 28px rgba(255,255,255,0.04)",
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? "translateY(0) scale(1)" : "translateY(6px) scale(0.97)",
            transformOrigin: "top center",
            transition: reduceMotion
              ? "opacity 120ms ease"
              : `opacity 180ms ease-out, transform 280ms ${SPRING}`,
          }}
        >
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
                  role="menuitem"
                  aria-current={activeLink ? "page" : undefined}
                  onClick={() => onCloseNow(item.id)}
                  onKeyDown={(event) => onMenuKeyDown(event, item.id)}
                  className="group rounded-2xl border px-3 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60"
                  style={{
                    borderColor: activeLink ? "var(--border)" : "transparent",
                    background: activeLink ? "rgba(255,255,255,0.08)" : "transparent",
                    animation:
                      isOpen && !reduceMotion
                        ? `nav-drop-item-in 280ms ${SPRING} ${50 + index * 35}ms backwards`
                        : "none",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      {link.icon ? (
                        <span aria-hidden className="text-sm leading-none">
                          {link.icon}
                        </span>
                      ) : null}
                      <span
                        className="truncate text-sm font-semibold text-white"
                        style={
                          activeLink
                            ? { color: "var(--accent)", textShadow: "0 0 14px var(--glow)" }
                            : undefined
                        }
                      >
                        {link.label}
                      </span>
                    </span>
                    {activeLink ? (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--glow)" }}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300"
                      >
                        →
                      </span>
                    )}
                  </div>
                  {link.description && (
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{link.description}</p>
                  )}
                </Link>
              );
            })}
          </div>
          <div
            aria-hidden
            className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600"
          >
            ↑↓ move · esc close
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<NavbarUser>(null);
  const [activeAdminSection, setActiveAdminSection] = useState<string | null>(null);
  const [renderDrawer, setRenderDrawer] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const [collapseNav, setCollapseNav] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    opacity: number;
  }>({ left: 0, width: 0, opacity: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLAnchorElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const panelRefs = useRef<Record<string, HTMLElement | null>>({});
  const closeTimerRef = useRef<number | null>(null);
  const groupCloseTimerRef = useRef<number | null>(null);
  const measuredNavWidthRef = useRef(0);
  // Spotlight glow is written directly to the DOM (rAF-throttled) instead of
  // going through setState — pointermove used to re-render the whole navbar
  // on every single mouse event.
  const pillGlowRef = useRef<HTMLDivElement | null>(null);
  const pillGlowRafRef = useRef<number | null>(null);
  const pillGlowXRef = useRef(0);
  const pendingFocusRef = useRef<FocusRequest | null>(null);
  const openGroupRef = useRef<string | null>(null);
  openGroupRef.current = openGroup;

  const isOfficer = user?.role === "officer" || user?.role === "owner";

  // Needed so the drawer portal only renders on the client.
  useEffect(() => {
    setMounted(true);
  }, []);

  const navGroups: NavGroup[] = useMemo(
    () =>
      ([
        { type: "link", id: "home", href: "/", label: "Home", icon: "⌂" },
        {
          type: "group",
          id: "war",
          label: "War",
          icon: "⚔",
          links: [
            { href: "/war-info", label: "War Info", icon: "📡", description: "Simple live war overview" },
            { href: "/leaderboard", label: "Leaderboard", icon: "🏆", description: "Member contribution rankings" },
            { href: "/war-analyst", label: "Battle HQ", icon: "📈", description: "Race analytics and projections" },
            { href: "/contributions", label: "Contributions", icon: "🧮", description: "Charts and clan activity" },
          ],
        },
        {
          type: "group",
          id: "reports",
          label: "Reports",
          icon: "📊",
          links: [
            { href: "/war-reports", label: "War Reports", icon: "📝", description: "Grades, MVPs, and war history" },
            { href: "/achievements", label: "Achievements", icon: "🏅", description: "Clan placements and milestones" },
            { href: "/hall-of-fame", label: "Hall of Fame", icon: "👑", description: "Top members and legends" },
          ],
        },
        {
          type: "group",
          id: "staff",
          label: "Staff",
          icon: "🛠",
          officerOnly: true,
          links: [
            { href: "/admin?section=activity", label: "Activity Monitor", icon: "🩺", description: "Low PPH, zeros, disconnects" },
            { href: "/admin?section=tickets", label: "Tickets", icon: "🎫", description: "Application tickets" },
            { href: "/admin?section=bot", label: "Bot Controls", icon: "🤖", description: "Automation and bot health" },
            { href: "/admin?section=broadcast", label: "Broadcast", icon: "📣", description: "Send staff announcements" },
            { href: "/admin?section=players", label: "Players", icon: "👥", description: "Tracked members and presence" },
            { href: "/admin?section=events", label: "Events", icon: "🎁", description: "Giveaways and invite events" },
            { href: "/admin?section=logs", label: "Logs", icon: "📜", description: "Audit and bot logs" },
            { href: "/admin", label: "Admin Overview", icon: "🧭", description: "Control panel overview" },
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

  // --- Desktop group interactions -------------------------------------------

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    itemRefs.current[id] = el;
  }, []);

  const registerPanel = useCallback((id: string, el: HTMLElement | null) => {
    panelRefs.current[id] = el;
  }, []);

  const clearGroupCloseTimer = useCallback(() => {
    if (groupCloseTimerRef.current !== null) {
      window.clearTimeout(groupCloseTimerRef.current);
      groupCloseTimerRef.current = null;
    }
  }, []);

  const openDesktopGroup = useCallback(
    (id: string) => {
      clearGroupCloseTimer();
      setOpenGroup(id);
    },
    [clearGroupCloseTimer]
  );

  const toggleDesktopGroup = useCallback(
    (id: string) => {
      clearGroupCloseTimer();
      setOpenGroup((current) => (current === id ? null : id));
    },
    [clearGroupCloseTimer]
  );

  const closeDesktopGroupSoon = useCallback(
    (id: string) => {
      clearGroupCloseTimer();
      groupCloseTimerRef.current = window.setTimeout(() => {
        setOpenGroup((current) => (current === id ? null : current));
        groupCloseTimerRef.current = null;
      }, CLOSE_DELAY_MS);
    },
    [clearGroupCloseTimer]
  );

  const closeDesktopGroupNow = useCallback(
    (id: string, opts?: { focusButton?: boolean }) => {
      clearGroupCloseTimer();
      setOpenGroup((current) => (current === id ? null : current));
      if (opts?.focusButton) pendingFocusRef.current = { group: id, where: "button" };
    },
    [clearGroupCloseTimer]
  );

  const focusMenuItem = useCallback((groupId: string, where: "first" | "last") => {
    const panel = panelRefs.current[groupId];
    const links = panel?.querySelectorAll<HTMLElement>("a[href]");
    if (!links || links.length === 0) return;
    (where === "last" ? links[links.length - 1] : links[0]).focus();
  }, []);

  const openDesktopGroupWithFocus = useCallback(
    (id: string, where: "first" | "last") => {
      clearGroupCloseTimer();
      if (openGroupRef.current === id) {
        focusMenuItem(id, where);
        return;
      }
      pendingFocusRef.current = { group: id, where };
      setOpenGroup(id);
    },
    [clearGroupCloseTimer, focusMenuItem]
  );

  const onMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, groupId: string) => {
      const panel = panelRefs.current[groupId];
      const items = panel ? Array.from(panel.querySelectorAll<HTMLElement>("a[href]")) : [];
      if (!items.length) return;
      const index = items.indexOf(event.currentTarget as HTMLElement);

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          items[(index + 1) % items.length].focus();
          break;
        case "ArrowUp":
          event.preventDefault();
          items[(index - 1 + items.length) % items.length].focus();
          break;
        case "Home":
          event.preventDefault();
          items[0].focus();
          break;
        case "End":
          event.preventDefault();
          items[items.length - 1].focus();
          break;
        case "Escape":
          event.preventDefault();
          closeDesktopGroupNow(groupId, { focusButton: true });
          break;
        case "Tab":
          // Let focus move naturally — just close the menu.
          closeDesktopGroupNow(groupId);
          break;
      }
    },
    [closeDesktopGroupNow]
  );

  // Focus requests are fulfilled after the menu state flushes to the DOM.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;

    if (pending.where === "button") {
      pendingFocusRef.current = null;
      itemRefs.current[pending.group]?.focus();
      return;
    }

    if (openGroup !== pending.group) return;
    pendingFocusRef.current = null;
    focusMenuItem(pending.group, pending.where);
  }, [openGroup, focusMenuItem]);

  // Click/tap outside any open desktop menu closes it (touchscreens and
  // keyboard-opened menus don't reliably fire mouse-leave).
  useEffect(() => {
    if (!openGroup) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inside =
        Object.values(itemRefs.current).some((el) => el?.contains(target)) ||
        Object.values(panelRefs.current).some((el) => el?.contains(target));
      if (!inside) setOpenGroup(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openGroup]);

  // Menus never survive a route change or a collapse into the drawer.
  useEffect(() => {
    if (collapseNav && openGroup) setOpenGroup(null);
  }, [collapseNav, openGroup]);

  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  // Respect prefers-reduced-motion for the sliding pill / dropdown pops.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  // --- Data + tracking -------------------------------------------------------

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

    // Next.js soft-navigates with history.pushState, which NEVER fires
    // popstate — so hopping between /admin?section=… pages used to leave the
    // highlight stuck on the previous section until a reload. Patch the
    // history functions once to emit a signal we can listen to.
    const win = window as unknown as { __mcwvNavHistoryPatched?: boolean };
    if (!win.__mcwvNavHistoryPatched) {
      win.__mcwvNavHistoryPatched = true;
      const notify = () => window.dispatchEvent(new Event("mcwv:navigation"));
      const originalPush = history.pushState;
      const originalReplace = history.replaceState;
      history.pushState = function (...args) {
        const result = originalPush.apply(this, args);
        notify();
        return result;
      };
      history.replaceState = function (...args) {
        const result = originalReplace.apply(this, args);
        notify();
        return result;
      };
    }

    window.addEventListener("popstate", updateSection);
    window.addEventListener("hashchange", updateSection);
    window.addEventListener("mcwv:navigation", updateSection);
    return () => {
      window.removeEventListener("popstate", updateSection);
      window.removeEventListener("hashchange", updateSection);
      window.removeEventListener("mcwv:navigation", updateSection);
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
        // Fresh truth each pass (the old code kept a sticky max, so shrinking
        // content — e.g. losing the Staff group — could never un-collapse).
        measuredNavWidthRef.current = navEl.scrollWidth;
      }

      const navWidth = measuredNavWidthRef.current;
      if (!navWidth) {
        setCollapseNav(false);
        return;
      }

      setCollapseNav(brandWidth + navWidth + 96 > containerWidth);
    };

    updateResponsiveNav();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateResponsiveNav);
      if (containerRef.current) observer.observe(containerRef.current);
    }

    window.addEventListener("resize", updateResponsiveNav, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateResponsiveNav);
    };
  }, [navGroups]);

  const updateIndicator = useCallback(() => {
    const navEl = navRef.current;
    const activeEl = activeTopId ? itemRefs.current[activeTopId] : null;

    if (collapseNav || !navEl || !activeEl) {
      setIndicator((prev) => (prev.opacity === 0 ? prev : { ...prev, opacity: 0 }));
      return;
    }

    const navRect = navEl.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    setIndicator({
      // clientLeft accounts for the pill's 1px border (old code drifted 1px left).
      left: activeRect.left - navRect.left - navEl.clientLeft,
      width: activeRect.width,
      opacity: 1,
    });
  }, [activeTopId, collapseNav]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateIndicator);
      if (navRef.current) observer.observe(navRef.current);
      const activeEl = activeTopId ? itemRefs.current[activeTopId] : null;
      if (activeEl) observer.observe(activeEl);
    }

    // Webfont swaps widen labels after first paint — re-measure once they're in.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => updateIndicator()).catch(() => undefined);
    }

    return () => {
      window.removeEventListener("resize", updateIndicator);
      observer?.disconnect();
    };
  }, [updateIndicator, activeTopId]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock page scroll while the mobile drawer is open.
  useEffect(() => {
    if (!renderDrawer) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [renderDrawer]);

  // Escape closes any open desktop dropdown (returning focus to its button),
  // otherwise it closes the mobile drawer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openGroup) {
        closeDesktopGroupNow(openGroup, { focusButton: true });
        return;
      }
      if (open) closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openGroup, closeDesktopGroupNow]);

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
      if (pillGlowRafRef.current !== null) window.cancelAnimationFrame(pillGlowRafRef.current);
    };
  }, []);

  function onNavPointerMove(event: React.PointerEvent<HTMLElement>) {
    const navEl = navRef.current;
    if (!navEl) return;
    pillGlowXRef.current = event.clientX - navEl.getBoundingClientRect().left;
    if (pillGlowRafRef.current !== null) return;
    pillGlowRafRef.current = window.requestAnimationFrame(() => {
      pillGlowRafRef.current = null;
      const glow = pillGlowRef.current;
      if (!glow) return;
      glow.style.background = `radial-gradient(150px circle at ${pillGlowXRef.current}px 50%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)`;
      glow.style.opacity = "1";
    });
  }

  function onNavPointerLeave() {
    if (pillGlowRef.current) pillGlowRef.current.style.opacity = "0";
  }

  return (
    <>
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
          onPointerLeave={onNavPointerLeave}
          aria-label="Primary"
          className={`relative min-w-0 items-center gap-1 rounded-full border px-1 py-1 ${collapseNav ? "hidden" : "hidden lg:flex"}`}
          style={{
            borderColor: "var(--border)",
            background: "rgba(255,255,255,0.045)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* Spotlight glow that follows the pointer across the pill
              (updated via ref + rAF, zero React re-renders) */}
          <div
            ref={pillGlowRef}
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ opacity: 0, transition: "opacity 240ms ease" }}
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
              transition: reduceMotion
                ? "opacity 200ms ease"
                : `left 340ms ${SPRING}, width 340ms ${SPRING}, opacity 200ms ease, box-shadow 340ms ease`,
            }}
          />
          {navGroups.map((item) =>
            item.type === "link" ? (
              <DesktopLinkItem
                key={item.id}
                item={item}
                isActiveTop={activeTopId === item.id}
                registerRef={registerRef}
              />
            ) : (
              <DesktopGroupItem
                key={item.id}
                item={item}
                isActiveTop={activeTopId === item.id}
                isActiveHref={isActiveHref}
                isOpen={openGroup === item.id}
                reduceMotion={reduceMotion}
                registerButton={registerRef}
                registerPanel={registerPanel}
                onHoverOpen={openDesktopGroup}
                onToggle={toggleDesktopGroup}
                onCloseSoon={closeDesktopGroupSoon}
                onCloseNow={closeDesktopGroupNow}
                onOpenWithFocus={openDesktopGroupWithFocus}
                onMenuKeyDown={onMenuKeyDown}
              />
            )
          )}
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
      </header>

      {/* The drawer is portalled to <body> on purpose: the header uses
          backdrop-blur + mount animations, and any ancestor with
          backdrop-filter/transform becomes the containing block for
          position:fixed children — that trapped the backdrop inside the
          ~64px header bar so page content bled through next to the drawer
          on pages like Admin. Portalling removes the trap entirely, and the
          higher z-index keeps the drawer above page modals/toasts. */}
      {mounted &&
        renderDrawer &&
        createPortal(
          <>
            <button
              className={`fixed inset-0 ${collapseNav ? "" : "lg:hidden"}`}
              onClick={closeDrawer}
              aria-label="Close navigation overlay"
              style={{
                zIndex: 120,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: open ? "blur(6px)" : "blur(0px)",
                WebkitBackdropFilter: open ? "blur(6px)" : "blur(0px)",
                opacity: open ? 1 : 0,
                pointerEvents: open ? "auto" : "none",
                transition: "opacity 240ms ease, backdrop-filter 240ms ease",
              }}
            />
            <aside
              className={`fixed inset-y-0 right-0 flex w-[min(23rem,90vw)] flex-col overflow-hidden border-l ${collapseNav ? "" : "lg:hidden"}`}
              style={{
                zIndex: 130,
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
          </>,
          document.body
        )}
    </>
  );
}
