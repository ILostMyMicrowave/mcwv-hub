"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_AVATAR,
  HAIR_PRESETS,
  HAIR_STYLES,
  HOODIE_PRESETS,
  SKIN_PRESETS,
  renderRoom,
  type AfkPrefs,
  type AvatarSpec,
  type HairStyle,
  type PixelTarget,
  type RGB,
  type RoomSize,
} from "@/components/afk/roomEngine";

// ---------------------------------------------------------------------------
// CanvasTarget — PixelTarget adapter over CanvasRenderingContext2D
// ---------------------------------------------------------------------------

const css = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

class CanvasTarget implements PixelTarget {
  constructor(private ctx: CanvasRenderingContext2D) {}
  fill(x: number, y: number, w: number, h: number, c: RGB) {
    this.ctx.fillStyle = css(c);
    this.ctx.fillRect(x, y, w, h);
  }
  blend(x: number, y: number, w: number, h: number, c: RGB, a: number) {
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = css(c);
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalAlpha = 1;
  }
  mul(x: number, y: number, w: number, h: number, c: RGB, a: number) {
    this.ctx.globalCompositeOperation = "multiply";
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = css(c);
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.globalAlpha = 1;
  }
  add(x: number, y: number, w: number, h: number, c: RGB, a: number) {
    this.ctx.globalCompositeOperation = "lighter";
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = css(c);
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.globalAlpha = 1;
  }
  clip(x: number, y: number, w: number, h: number) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
  }
  unclip() {
    this.ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// prefs (localStorage)
// ---------------------------------------------------------------------------

const PREFS_KEY = "mcwv-afk-room";

type StoredPrefs = {
  bedtime: number; // 21,22,23,0,1
  skin: number;
  hairColor: number;
  hairStyle: HairStyle;
  hoodie: number;
};

const DEFAULT_STORED: StoredPrefs = {
  bedtime: 23,
  skin: 1,
  hairColor: 0,
  hairStyle: "short",
  hoodie: 0,
};

function loadPrefs(): StoredPrefs {
  if (typeof window === "undefined") return DEFAULT_STORED;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_STORED;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      bedtime: typeof parsed.bedtime === "number" ? parsed.bedtime : DEFAULT_STORED.bedtime,
      skin: typeof parsed.skin === "number" ? parsed.skin : DEFAULT_STORED.skin,
      hairColor: typeof parsed.hairColor === "number" ? parsed.hairColor : DEFAULT_STORED.hairColor,
      hairStyle:
        parsed.hairStyle === "short" || parsed.hairStyle === "spiky" ||
        parsed.hairStyle === "beanie" || parsed.hairStyle === "long"
          ? parsed.hairStyle
          : DEFAULT_STORED.hairStyle,
      hoodie: typeof parsed.hoodie === "number" ? parsed.hoodie : DEFAULT_STORED.hoodie,
    };
  } catch {
    return DEFAULT_STORED;
  }
}

// ---------------------------------------------------------------------------
// HUD data
// ---------------------------------------------------------------------------

type AfkApiResponse = {
  ok?: boolean;
  clan?: { rank?: number | null } | null;
  me?: { points?: number | null; war?: string | null } | null;
  battle?: { active?: boolean } | null;
};

type HudState = {
  rank: number | null;
  points: number | null;
  war: "current" | "last" | null;
  battleActive: boolean;
  stale: boolean;
};

const INITIAL_HUD: HudState = { rank: null, points: null, war: null, battleActive: false, stale: false };

/** pick a logical-pixel size so the room stays chunky on every screen */
function computeSize(vw: number, vh: number): RoomSize {
  const ps = Math.max(2, Math.min(6, Math.round(Math.min(vw / 240, vh / 170)) || 3));
  return { w: Math.max(120, Math.round(vw / ps)), h: Math.max(140, Math.round(vh / ps)) };
}

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export default function AfkRoom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<RoomSize>({ w: 240, h: 160 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULT_STORED);
  const [loaded, setLoaded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);

  // load prefs once (localStorage)
  useEffect(() => {
    setPrefs(loadPrefs());
    setLoaded(true);
  }, []);

  // persist
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private mode — fine */
    }
  }, [prefs, loaded]);

  // track viewport → logical room size (debounced)
  useEffect(() => {
    let timer = 0;
    const apply = () => setSize(computeSize(window.innerWidth, window.innerHeight));
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 120);
    };
    apply();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const avatar: AvatarSpec = useMemo(
    () => ({
      skin: SKIN_PRESETS[prefs.skin % SKIN_PRESETS.length]?.value ?? DEFAULT_AVATAR.skin,
      hair: HAIR_PRESETS[prefs.hairColor % HAIR_PRESETS.length]?.value ?? DEFAULT_AVATAR.hair,
      hairStyle: prefs.hairStyle,
      hoodie: HOODIE_PRESETS[prefs.hoodie % HOODIE_PRESETS.length]?.value ?? DEFAULT_AVATAR.hoodie,
    }),
    [prefs]
  );

  const enginePrefs: AfkPrefs = useMemo(() => ({ bedtime: prefs.bedtime }), [prefs.bedtime]);

  // render loop — chill 12fps, pauses with the tab, gentle on battery
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const target = new CanvasTarget(ctx);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 12;

    const draw = (tMs: number) => {
      ctx.imageSmoothingEnabled = false;
      renderRoom(target, new Date(), avatar, enginePrefs, tMs, sizeRef.current);
    };

    if (reduced) {
      draw(0);
      const timer = window.setInterval(() => draw(0), 30_000);
      return () => window.clearInterval(timer);
    }

    const loop = (tMs: number) => {
      raf = window.requestAnimationFrame(loop);
      if (tMs - last < FRAME_MS) return;
      last = tMs;
      draw(tMs);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [avatar, enginePrefs, size]);

  // war HUD polling — every 60s, keeps last numbers on a hiccup
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/afk", { cache: "no-store" });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const data = (await res.json()) as AfkApiResponse;
        if (cancelled) return;
        const war = data.me?.war === "current" || data.me?.war === "last" ? data.me.war : null;
        setHud({
          rank: typeof data.clan?.rank === "number" ? data.clan.rank : null,
          points: typeof data.me?.points === "number" ? data.me.points : null,
          war,
          battleActive: Boolean(data.battle?.active),
          stale: false,
        });
      } catch {
        if (!cancelled) setHud((h) => ({ ...h, stale: true }));
      }
    };
    pull();
    const timer = window.setInterval(pull, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-GB"));

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#060512]">
      <style>{`
        @font-face {
          font-family: 'PS2P';
          src: url('/fonts/PressStart2P.woff2') format('woff2');
          font-display: swap;
        }
        .afk-pixel {
          font-family: 'PS2P', ui-monospace, 'Courier New', monospace;
          text-shadow: 0 0 6px rgba(180, 140, 255, 0.55), 0 2px 0 rgba(0,0,0,0.6);
          letter-spacing: 0.04em;
        }
      `}</style>

      {/* the room — full bleed */}
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        className="block h-full w-full"
        style={{ imageRendering: "pixelated" }}
        role="img"
        aria-label="A cozy pixel bedroom that follows your local time of day"
      />

      {/* war HUD */}
      <div
        className={`afk-pixel pointer-events-none absolute rounded-lg bg-black/25 px-3 py-2 text-right backdrop-blur-[2px] transition-opacity duration-700 ${
          hud.stale ? "opacity-50" : "opacity-100"
        }`}
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          right: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        <div className="text-[11px] leading-relaxed text-violet-100 sm:text-xs">
          MCWV {hud.rank !== null ? `#${hud.rank}` : "#—"}
        </div>
        <div className="mt-1 text-[11px] leading-relaxed text-violet-300 sm:text-xs">
          YOU {fmt(hud.points)}
        </div>
        {!hud.battleActive && hud.war === "last" && (
          <div className="mt-1 text-[7px] tracking-widest text-violet-400/80">LAST WAR</div>
        )}
        {hud.battleActive && (
          <div className="mt-1 text-[7px] tracking-widest text-emerald-300/90">LIVE ⚔</div>
        )}
      </div>

      {/* settings gear */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        aria-label="Room settings"
        className="absolute rounded-full border border-violet-800/70 bg-[#17142a]/85 px-2 py-1 text-xs text-violet-200 opacity-60 transition hover:opacity-100"
        style={{
          bottom: "max(0.75rem, env(safe-area-inset-bottom))",
          right: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        ⚙️
      </button>

      {panelOpen && (
        <div
          className="absolute w-56 rounded-xl border border-violet-800/70 bg-[#17142a]/95 p-3 text-xs text-violet-100 shadow-xl backdrop-blur"
          style={{
            bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 2.5rem)",
            right: "max(0.75rem, env(safe-area-inset-right))",
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Room settings</span>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="text-violet-400 hover:text-violet-200"
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-violet-400">
              Bedtime
            </span>
            <select
              value={prefs.bedtime}
              onChange={(e) => setPrefs((p) => ({ ...p, bedtime: Number(e.target.value) }))}
              className="w-full rounded-md border border-violet-800 bg-[#0f0d1e] px-2 py-1 text-violet-100"
            >
              <option value={21}>9:00 PM</option>
              <option value={22}>10:00 PM</option>
              <option value={23}>11:00 PM</option>
              <option value={0}>Midnight</option>
              <option value={1}>1:00 AM</option>
            </select>
          </label>

          <SwatchRow
            label="Skin"
            colors={SKIN_PRESETS.map((p) => p.value)}
            selected={prefs.skin}
            onSelect={(i) => setPrefs((p) => ({ ...p, skin: i }))}
          />
          <SwatchRow
            label="Hair"
            colors={HAIR_PRESETS.map((p) => p.value)}
            selected={prefs.hairColor}
            onSelect={(i) => setPrefs((p) => ({ ...p, hairColor: i }))}
          />
          <SwatchRow
            label="Hoodie"
            colors={HOODIE_PRESETS.map((p) => p.value)}
            selected={prefs.hoodie}
            onSelect={(i) => setPrefs((p) => ({ ...p, hoodie: i }))}
          />

          <div className="mt-1">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-violet-400">
              Hair style
            </span>
            <div className="flex flex-wrap gap-1">
              {HAIR_STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setPrefs((p) => ({ ...p, hairStyle: s.value }))}
                  className={`rounded-md border px-2 py-0.5 text-[10px] ${
                    prefs.hairStyle === s.value
                      ? "border-violet-400 bg-violet-500/20 text-violet-100"
                      : "border-violet-800/60 text-violet-300 hover:border-violet-600"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-3 text-[9px] leading-relaxed text-violet-500/80">
            follows your clock · war stats refresh every 60s
          </p>
        </div>
      )}
    </main>
  );
}

function SwatchRow({
  label,
  colors,
  selected,
  onSelect,
}: {
  label: string;
  colors: RGB[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mb-2">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-violet-400">{label}</span>
      <div className="flex gap-1.5">
        {colors.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`${label} option ${i + 1}`}
            className={`h-5 w-5 rounded-full border-2 transition ${
              selected === i
                ? "border-white scale-110"
                : "border-black/30 hover:border-violet-300/70"
            }`}
            style={{ backgroundColor: css(c) }}
          />
        ))}
      </div>
    </div>
  );
}
