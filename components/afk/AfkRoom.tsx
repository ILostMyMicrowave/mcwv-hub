"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLEAR_WEATHER,
  DEFAULT_AVATAR,
  HAIR_PRESETS,
  HAIR_STYLES,
  HOODIE_PRESETS,
  SKIN_PRESETS,
  lightningAt,
  renderRoom,
  sceneStateAt,
  weatherAt,
  type AfkPrefs,
  type AvatarSpec,
  type HairStyle,
  type PixelTarget,
  type RGB,
  type RoomSize,
  type WeatherState,
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
// the room's own sky — random clockwork weather from the engine; the client
// just eases between skies so changes drift in gently. NO network, NO location.
// ---------------------------------------------------------------------------

const KIND_EMOJI: Record<WeatherState["kind"], string> = {
  clear: "☀️",
  cloud: "☁️",
  rain: "🌧️",
  snow: "🌨️",
  storm: "⛈️",
  fog: "🌫️",
};

// ---------------------------------------------------------------------------
// ambience — WebAudio-synthesized rain / wind / crickets / thunder (no files)
// ---------------------------------------------------------------------------

class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastChirp = 0;
  private lastThunder = 0;

  private ensure() {
    if (this.ctx) return;
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // shared 2s white-noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // rain: noise → lowpass
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = buf;
    rainSrc.loop = true;
    const rainLP = ctx.createBiquadFilter();
    rainLP.type = "lowpass";
    rainLP.frequency.value = 1400;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainSrc.connect(rainLP);
    rainLP.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();
    // wind: slowed noise → drifting bandpass
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windSrc.playbackRate.value = 0.5;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 380;
    bp.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(bp);
    bp.connect(windGain);
    windGain.connect(master);
    windSrc.start();
    this.ctx = ctx;
    this.master = master;
    this.rainGain = rainGain;
    this.windGain = windGain;
    this.windFilter = bp;
    this.noiseBuf = buf;
  }

  setEnabled(on: boolean) {
    try {
      this.ensure();
      if (!this.ctx || !this.master) return;
      const t = this.ctx.currentTime;
      if (on) {
        void this.ctx.resume();
        this.master.gain.setTargetAtTime(0.55, t, 0.8);
      } else {
        this.master.gain.setTargetAtTime(0, t, 0.25);
      }
    } catch {
      /* no audio device — fine */
    }
  }

  pause() {
    void this.ctx?.suspend().catch(() => {});
  }
  resumeIf(on: boolean) {
    if (on) void this.ctx?.resume().catch(() => {});
  }

  update(scene: { rain: number; wind: number; crickets: boolean }, nowMs: number, flash: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.rainGain || !this.windGain || !this.noiseBuf) return;
    const t = ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(Math.min(0.5, scene.rain), t, 1.4);
    this.windGain.gain.setTargetAtTime(Math.min(0.4, scene.wind), t, 1.6);
    this.windFilter?.frequency.setTargetAtTime(
      260 + scene.wind * 900 + Math.sin(nowMs * 0.0004) * 130,
      t,
      0.9
    );
    // crickets: little 3-pulse chirps through the night
    if (scene.crickets && t - this.lastChirp > 0.55 + Math.random() * 0.5) {
      this.lastChirp = t;
      for (let p = 0; p < 3; p++) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = 4050 + Math.random() * 380;
        const cg = ctx.createGain();
        cg.gain.value = 0;
        o.connect(cg);
        cg.connect(this.master);
        const t0 = t + p * 0.085;
        cg.gain.setValueAtTime(0, t0);
        cg.gain.linearRampToValueAtTime(0.024, t0 + 0.012);
        cg.gain.linearRampToValueAtTime(0, t0 + 0.05);
        o.start(t0);
        o.stop(t0 + 0.06);
      }
    }
    // thunder tail on lightning flashes
    if (flash > 0.5 && nowMs - this.lastThunder > 5000) {
      this.lastThunder = nowMs;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = 0.4;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(150, t);
      lp.frequency.exponentialRampToValueAtTime(50, t + 2.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6 * flash, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      src.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      src.start();
      src.stop(t + 2.3);
    }
  }
}

const SOUND_KEY = "mcwv-afk-sound";

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

  // alive: the room's random sky (displayed state eases toward the engine's pick) + ambience
  const skyRef = useRef<WeatherState>(CLEAR_WEATHER);
  const [skyKind, setSkyKind] = useState<WeatherState["kind"]>("clear");
  const [soundOn, setSoundOn] = useState(false);
  const ambRef = useRef<Ambience | null>(null);

  // ambience: restore saved choice, suspend when the tab hides
  useEffect(() => {
    ambRef.current = new Ambience();
    let saved = false;
    try {
      saved = window.localStorage.getItem(SOUND_KEY) === "1";
    } catch {
      /* fine */
    }
    setSoundOn(saved);
    if (saved) ambRef.current.setEnabled(true); // prepares; resumes on first tap below
    const onVis = () => {
      if (document.hidden) ambRef.current?.pause();
      else ambRef.current?.resumeIf(saved);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // browsers demand a fresh gesture per visit before audio may start —
  // arm a one-shot resume on the first interaction when sound is on
  useEffect(() => {
    if (!soundOn) return;
    const arm = () => ambRef.current?.setEnabled(true);
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, [soundOn]);

  const toggleSound = () => {
    setSoundOn((prev) => {
      const next = !prev;
      ambRef.current?.setEnabled(next);
      try {
        window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      } catch {
        /* fine */
      }
      return next;
    });
  };

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
      const now = new Date();
      // ease the displayed sky toward the engine's slot pick —
      // fading the old one out fully before the new kind drifts in
      const skyTarget = weatherAt(now);
      const cur = skyRef.current;
      if (cur.kind !== skyTarget.kind) {
        if (cur.intensity > 0.03) {
          skyRef.current = { ...cur, intensity: Math.max(0, cur.intensity - 0.02) };
        } else {
          skyRef.current = { kind: skyTarget.kind, intensity: 0, wind: cur.wind };
          setSkyKind(skyTarget.kind);
        }
      } else {
        skyRef.current = {
          kind: cur.kind,
          intensity: cur.intensity + (skyTarget.intensity - cur.intensity) * 0.05,
          wind: cur.wind + (skyTarget.wind - cur.wind) * 0.05,
        };
      }
      const weather = skyRef.current;
      renderRoom(target, now, avatar, enginePrefs, tMs, sizeRef.current, weather);
      // keep the ambience breathing with the scene
      const scene = sceneStateAt(now, enginePrefs);
      ambRef.current?.update(
        {
          rain:
            weather.kind === "rain"
              ? 0.12 + weather.intensity * 0.4
              : weather.kind === "storm"
                ? 0.16 + weather.intensity * 0.45
                : 0,
          wind: weather.wind * (weather.kind === "storm" ? 0.5 : 0.28),
          crickets:
            scene.mood.ambient > 0.28 &&
            (weather.kind === "clear" || (weather.kind === "cloud" && weather.intensity < 0.5)),
        },
        tMs,
        lightningAt(tMs, weather)
      );
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

      {/* ambience toggle */}
      <button
        type="button"
        onClick={toggleSound}
        aria-label={soundOn ? "Mute ambience" : "Play ambience"}
        aria-pressed={soundOn}
        className="absolute rounded-full border border-violet-800/70 bg-[#17142a]/85 px-2 py-1 text-xs text-violet-200 opacity-60 transition hover:opacity-100"
        style={{
          bottom: "max(0.75rem, env(safe-area-inset-bottom))",
          left: "max(0.75rem, env(safe-area-inset-left))",
        }}
      >
        {soundOn ? "🔊" : "🔇"}
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
          <p className="mt-1 text-[9px] leading-relaxed text-violet-500/80">
            {KIND_EMOJI[skyKind]} sky drifts on its own · no location used
            {" · "}
            {soundOn ? "🔊 ambience on" : "🔇 ambience off"}
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
