"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLEAR_WEATHER,
  DEFAULT_AVATAR,
  HAIR_PRESETS,
  HAIR_STYLES,
  HOODIE_PRESETS,
  SKIN_PRESETS,
  focusXAt,
  layoutOf,
  lifeStateAt,
  lightningAt,
  nextEventAt,
  renderRoom,
  sceneStateAt,
  weatherAt,
  type AfkPrefs,
  type AvatarSpec,
  type HairStyle,
  type LifeState,
  type LiveOverrides,
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
  catName: string; // v7: empty = classic generic ticker lines
};

const DEFAULT_STORED: StoredPrefs = {
  bedtime: 23,
  skin: 1,
  hairColor: 0,
  hairStyle: "short",
  hoodie: 0,
  catName: "",
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
      catName: typeof parsed.catName === "string" ? parsed.catName.slice(0, 9) : DEFAULT_STORED.catName,
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

// ---------------------------------------------------------------------------
// viewport → room pipeline
// Wide screens: the room FITS the screen (classic behavior).
// Narrow/portrait: the room stays its chunky classic 240-wide self at tall
// pixels and overflows sideways — you drag across it (or let the camera
// softly follow the resident). Two very different but deliberate framings.
// ---------------------------------------------------------------------------

type ViewMode = "fit" | "pan";

type ViewState = {
  size: RoomSize; // logical room pixels drawn into the canvas
  mode: ViewMode;
  ps: number; // css px per logical px
  cssW: number;
  cssH: number;
  ty: number; // vertical letterbox centering
  vw: number;
  vh: number;
};

function computeView(vw: number, vh: number): ViewState {
  if (vw / vh >= 1.15) {
    // FIT: pick a chunky logical-pixel size so the room fills the screen
    const ps = Math.max(2, Math.min(6, Math.round(Math.min(vw / 240, vh / 170)) || 3));
    const size = { w: Math.max(120, Math.round(vw / ps)), h: Math.max(140, Math.round(vh / ps)) };
    return { size, mode: "fit", ps, cssW: vw, cssH: vh, ty: 0, vw, vh };
  }
  // PAN: classic 240-wide room, pixels sized by screen height, overflow x
  const size = { w: 240, h: 170 };
  const ps = Math.max(2, Math.min(5, Math.round(vh / 170)));
  const cssW = 240 * ps;
  const cssH = 170 * ps;
  const ty = Math.max(0, Math.round((vh - cssH) / 2));
  return { size, mode: "pan", ps, cssW, cssH, ty, vw, vh };
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

/** fallback ticker line when life has nothing scheduled within the horizon */
function weatherLine(w: WeatherState): string {
  switch (w.kind) {
    case "clear": return "CLEAR SKY"
    case "cloud": return w.intensity >= 0.6 ? "HEAVY CLOUD" : "DRIFTING CLOUDS"
    case "rain": return "RAIN ON THE GLASS"
    case "snow": return "SNOW FALLING"
    case "storm": return "STORM OVERHEAD"
    case "fog": return "FOG ROLLING IN"
  }
}

// --- mobile formatting -------------------------------------------------------
// Press Start 2P advances ~1em per glyph, so long ticker lines ("CAT FEEDING
// IN 70 MIN" ≈ 250px) collide with the top-right war HUD on phones. Below the
// sm breakpoint we swap in pocket-sized strings; a width cap + ellipsis backs
// it up. Full strings still power the aria/title text.

/** pocket-sized event labels for narrow screens */
const COMPACT_EVENT_LABEL: Record<string, string> = {
  "FEEDING THE CAT": "FEEDING CAT",
  "WATERING PLANTS": "WATERING",
  "CAT FEEDING": "CAT FEED",
  "PLANT WATERING": "PLANTS",
  "READING IN BED": "READING",
  "ONE MORE VIDEO": "DOOMSCROLL",
  "FULL MOON TONIGHT": "FULL MOON",
  "BREAKFAST IN BED": "BREAKFAST",
};

/** pocket-sized sky lines (only the ones too wide at 9px get shortened) */
function compactWeatherLine(w: WeatherState): string {
  switch (w.kind) {
    case "rain": return "RAIN ON GLASS"
    default: return weatherLine(w)
  }
}

// ---------------------------------------------------------------------------
// ambience — WebAudio-synthesized rain / wind / crickets / thunder + the
// room's little domestic one-shots: lamp click, CRT blip, alarm, key clacks,
// purring, kibble pour, water drips, microwave ding. No audio files at all.
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
  private lastClack = 0;

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

  /** tiny synth one-shot helper — silent until sound has ever been enabled */
  private shot(build: (ctx: AudioContext, out: GainNode, t0: number) => void) {
    if (!this.ctx || !this.master) return;
    try {
      build(this.ctx, this.master, this.ctx.currentTime);
    } catch {
      /* fine */
    }
  }

  /** lamp switch */
  click() {
    this.shot((ctx, out, t0) => {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(1500, t0);
      o.frequency.exponentialRampToValueAtTime(280, t0 + 0.03);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.07, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + 0.05);
    });
  }

  /** CRT power-pop */
  crtBlip() {
    this.shot((ctx, out, t0) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(2400, t0);
      o.frequency.exponentialRampToValueAtTime(160, t0 + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + 0.11);
    });
  }

  /** soft twin-bell alarm: three round beeps */
  beepAlarm() {
    this.shot((ctx, out, t0) => {
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = 1760;
        const g = ctx.createGain();
        const b = t0 + i * 0.16;
        g.gain.setValueAtTime(0, b);
        g.gain.linearRampToValueAtTime(0.06, b + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, b + 0.09);
        o.connect(g); g.connect(out);
        o.start(b); o.stop(b + 0.1);
      }
    });
  }

  /** microwave done! */
  ding() {
    this.shot((ctx, out, t0) => {
      for (const [f, dl] of [[988, 0] as const, [1319, 0.11] as const]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        const g = ctx.createGain();
        const b = t0 + dl;
        g.gain.setValueAtTime(0, b);
        g.gain.linearRampToValueAtTime(0.07, b + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, b + 0.5);
        o.connect(g); g.connect(out);
        o.start(b); o.stop(b + 0.52);
      }
    });
  }

  /** soft keyboard tick while the resident types */
  clack() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastClack < 150) return;
    this.lastClack = now;
    this.shot((ctx, out, t0) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 2200 + Math.random() * 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.022, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.018);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + 0.02);
    });
  }

  /** ~2.4s of contented cat rumble */
  purr() {
    this.shot((ctx, out, t0) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 52;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 23;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.02;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.035, t0 + 0.25);
      g.gain.setValueAtTime(0.035, t0 + 1.9);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 2.4);
      lfo.connect(lfoG); lfoG.connect(g.gain);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      o.connect(lp); lp.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + 2.45);
      lfo.start(t0); lfo.stop(t0 + 2.45);
    });
  }

  /** kibble rattling into the bowl */
  pour() {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = 1.6;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2700;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(); src.stop(t0 + 0.36);
    } catch {
      /* fine */
    }
  }

  /** two little water drops */
  drip() {
    this.shot((ctx, out, t0) => {
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        o.type = "sine";
        const b = t0 + i * 0.19;
        o.frequency.setValueAtTime(940 - i * 140, b);
        o.frequency.exponentialRampToValueAtTime(620 - i * 90, b + 0.07);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.045, b);
        g.gain.exponentialRampToValueAtTime(0.0001, b + 0.08);
        o.connect(g); g.connect(out);
        o.start(b); o.stop(b + 0.09);
      }
    });
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
  const panOuterRef = useRef<HTMLDivElement | null>(null); // hit-target & viewport
  const panInnerRef = useRef<HTMLDivElement | null>(null); // the wide room we translate

  const [view, setView] = useState<ViewState>(() => ({
    size: { w: 240, h: 160 },
    mode: "fit",
    ps: 3,
    cssW: 240 * 3,
    cssH: 160 * 3,
    ty: 0,
    vw: 240,
    vh: 160,
  }));
  const viewRef = useRef(view);
  viewRef.current = view;

  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULT_STORED);
  const [loaded, setLoaded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [hasPanned, setHasPanned] = useState(false);

  // alive: the room's random sky (displayed state eases toward the engine's pick) + ambience
  const skyRef = useRef<WeatherState>(CLEAR_WEATHER);
  const [skyKind, setSkyKind] = useState<WeatherState["kind"]>("clear");
  const [soundOn, setSoundOn] = useState(false);
  const ambRef = useRef<Ambience | null>(null);

  // top-left status ticker: clock + life's next moment (or the sky's mood)
  const [ticker, setTicker] = useState<{ clock: string; line: string; aria: string }>({ clock: "--:--", line: "", aria: "" });
  const tickerPrev = useRef("");

  // pan camera state (mutated directly — no react churn at 12fps)
  const cam = useRef({ x: -1, v: 0, target: -1, lastDrag: -1e12, lastT: 0 });
  const sfxPrev = useRef({
    lamp: 1,
    screen: 1,
    micro: false,
    alarm: false,
    eat: false,
    pet: false,
    pour: false,
    water: false,
    typing: 0,
  });

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
    try {
      setHasPanned(window.localStorage.getItem("mcwv-afk-panned") === "1");
    } catch {
      /* fine */
    }
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

  // track viewport → room pipeline (debounced)
  useEffect(() => {
    let timer = 0;
    const apply = () => {
      const v = computeView(window.innerWidth, window.innerHeight);
      setView(v);
      // keep the camera inside the new overflow bounds
      const c = cam.current;
      const maxX = Math.max(0, v.cssW - v.vw);
      c.x = c.x < 0 ? maxX / 2 : Math.min(Math.max(0, c.x), maxX);
      c.v = 0;
      if (v.mode === "pan" && panInnerRef.current) {
        panInnerRef.current.style.transform = `translate3d(${(-c.x).toFixed(2)}px, ${v.ty}px, 0)`;
      }
    };
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

  // drag the room sideways (pan mode) — pointer events cover touch + mouse
  useEffect(() => {
    if (view.mode !== "pan") return;
    const el = panOuterRef.current;
    if (!el) return;
    let dragging = false;
    let startClient = 0;
    let startX = 0;
    let moved = 0;
    let lastDx = 0;
    let lastMoveT = 0;
    const maxX = () => Math.max(0, viewRef.current.cssW - viewRef.current.vw);

    const down = (ev: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastDx = 0;
      lastMoveT = performance.now();
      startClient = ev.clientX;
      startX = cam.current.x < 0 ? maxX() / 2 : cam.current.x;
      cam.current.v = 0; // grab kills any spring/fling motion
      el.setPointerCapture(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      if (!dragging) return;
      const dx = ev.clientX - startClient;
      moved = Math.max(moved, Math.abs(dx));
      if (moved > 6) {
        cam.current.lastDrag = performance.now();
        if (!hasPanned) {
          setHasPanned(true);
          try {
            window.localStorage.setItem("mcwv-afk-panned", "1");
          } catch {
            /* fine */
          }
        }
      }
      cam.current.x = Math.min(maxX(), Math.max(0, startX - dx));
      // smoothed finger velocity → fling inertia on release
      const nowT = performance.now();
      const ddt = (nowT - lastMoveT) / 1000;
      if (ddt > 0.008) {
        cam.current.v = cam.current.v * 0.65 + (-(dx - lastDx) / ddt) * 0.35;
        lastDx = dx;
        lastMoveT = nowT;
      }
      // write here too (not just the rAF tick): reduced-motion users get no loop,
      // and this keeps the room glued to the finger even between ticks
      const inner = panInnerRef.current;
      if (inner) inner.style.transform = `translate3d(${(-cam.current.x).toFixed(2)}px, ${viewRef.current.ty}px, 0)`;
    };
    const up = () => {
      dragging = false;
      // finger held still before lifting → no fling; otherwise cap the throw
      if (performance.now() - lastMoveT > 90) cam.current.v = 0;
      else cam.current.v = Math.max(-2600, Math.min(2600, cam.current.v));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [view.mode, hasPanned]);

  // v7: taps — pet the cat, click the lamp, wake/sleep the monitor. A tap is a
  // <450ms, <8px pointer dance so it never fights the drag-to-pan gesture.
  useEffect(() => {
    const el = panOuterRef.current;
    if (!el) return;
    let downAt = 0;
    let downX = 0;
    let downY = 0;
    const down = (ev: PointerEvent) => {
      downAt = performance.now();
      downX = ev.clientX;
      downY = ev.clientY;
    };
    const up = (ev: PointerEvent) => {
      if (!downAt) return;
      const quick = performance.now() - downAt < 450;
      const small = Math.hypot(ev.clientX - downX, ev.clientY - downY) <= 8;
      downAt = 0;
      if (!quick || !small) return;
      const v = viewRef.current;
      const life = lastLifeRef.current;
      if (!life) return;
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      let lx: number;
      let ly: number;
      if (v.mode === "pan") {
        lx = (px + (cam.current.x < 0 ? (v.cssW - v.vw) / 2 : cam.current.x)) / v.ps;
        ly = (py - v.ty) / v.ps;
      } else {
        lx = (px / Math.max(1, v.cssW)) * v.size.w;
        ly = (py / Math.max(1, v.cssH)) * v.size.h;
      }
      const g = layoutOf(v.size.w, v.size.h);
      const nowT = performance.now();
      // the cat — the priority target, with a soft halo (it's smol)
      const c = life.cat;
      if (lx >= c.x - 3 && lx <= c.x + 14 && ly >= c.gy - 10 && ly <= c.gy + 3) {
        fxRef.current.petHeartsUntil = nowT + 2600;
        loveUntilRef.current = nowT + 10000;
        ambRef.current?.purr();
        return;
      }
      // floor lamp
      if (lx >= g.lampX - 9 && lx <= g.lampX + 3 && ly >= g.floorY - 50 && ly <= g.floorY - 2) {
        fxRef.current.lamp = { value: life.lampLevel < 0.5, until: nowT + 25 * 60000 };
        return;
      }
      // desk monitor
      if (lx >= g.deskX + g.deskW - 31 && lx <= g.deskX + g.deskW - 10 && ly >= g.floorY - 52 && ly <= g.floorY - 26) {
        fxRef.current.screen = { value: life.screenPower < 0.5, until: nowT + 25 * 60000 };
      }
    };
    const cancel = () => {
      downAt = 0;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
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

  const enginePrefs: AfkPrefs = useMemo(
    () => ({ bedtime: prefs.bedtime, catName: prefs.catName || undefined }),
    [prefs.bedtime, prefs.catName]
  );

  // v7: taps reach into the room — hearts over the cat, manual lamp/screen
  // switches with a polite 25-min expiry. Plain refs; the loop reads them.
  const fxRef = useRef<LiveOverrides>({});
  const loveUntilRef = useRef(0);
  const lastLifeRef = useRef<LifeState | null>(null);

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
      renderRoom(target, now, avatar, enginePrefs, tMs, viewRef.current.size, weather, fxRef.current);

      // everything alive this frame — powers the camera and the little sounds
      const v = viewRef.current;
      const life = lifeStateAt(now, enginePrefs, tMs, v.size, weather, fxRef.current);
      lastLifeRef.current = life;
      const g = layoutOf(v.size.w, v.size.h);

      // --- status ticker (only re-renders when a displayed string changes) ---
      {
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const clock = `${hh}:${mm}`;
        const ev = nextEventAt(now, enginePrefs);
        const loving = performance.now() < loveUntilRef.current;
        const aria = loving
          ? `💜 ${enginePrefs.catName?.trim().toUpperCase() || "THE CAT"} LOVES YOU`
          : ev
            ? `${ev.emoji} ${ev.kind === "now" ? "NOW: " : ""}${ev.label}${ev.kind === "in" ? ` IN ${ev.mins} MIN` : ""}`
            : `${KIND_EMOJI[weather.kind]} ${weatherLine(weather)}`;
        // pocket-sized strings under the sm breakpoint so the ticker never
        // reaches the war HUD's corner — countdowns keep their minutes as "NM"
        const compact = v.vw < 640;
        const line = loving
          ? aria // the love line is already pocket-sized
          : !compact
            ? aria
            : ev
              ? `${ev.emoji} ${(COMPACT_EVENT_LABEL[ev.label] ?? ev.label).replace(" IS EATING", " EATS").replace(" HAS ZOOMIES", " ZOOMIES")}${ev.kind === "in" ? ` ${ev.mins}M` : ""}`
              : `${KIND_EMOJI[weather.kind]} ${compactWeatherLine(weather)}`;
        const key = `${clock}|${line}`;
        if (key !== tickerPrev.current) {
          tickerPrev.current = key;
          setTicker({ clock, line, aria });
        }
      }

      // --- camera: hand the spring its target; the motion itself runs at full
      // display rate in tickCam (this draw only goes at a chill 12fps) ---
      if (v.mode === "pan") {
        const maxX = Math.max(0, v.cssW - v.vw);
        const focusCss = focusXAt(life, g) * v.ps;
        cam.current.target = Math.min(maxX, Math.max(0, focusCss - v.vw * 0.5));
      }

      // --- domestic one-shots on rising/falling edges (silent when off) ---
      const sp = sfxPrev.current;
      if (life.lampLevel < 0.5 && sp.lamp >= 0.5) ambRef.current?.click();
      sp.lamp = life.lampLevel;
      if (life.screenPower < 0.5 && sp.screen >= 0.5) ambRef.current?.crtBlip();
      sp.screen = life.screenPower;
      if (life.alarmRing && !sp.alarm) ambRef.current?.beepAlarm();
      sp.alarm = life.alarmRing;
      const micro = life.snack.microOn;
      if (!micro && sp.micro) ambRef.current?.ding();
      sp.micro = micro;
      const eat = life.cat.pose === "eat";
      if (eat && !sp.eat) ambRef.current?.purr();
      sp.eat = eat;
      const res = life.resident;
      const pet = res.mode === "chore" && res.kind === "pet";
      if (pet && !sp.pet) ambRef.current?.purr();
      sp.pet = pet;
      const pour = res.mode === "chore" && res.kind === "pour";
      if (pour && !sp.pour) ambRef.current?.pour();
      sp.pour = pour;
      const water = res.mode === "chore" && res.kind === "water";
      if (water && !sp.water) ambRef.current?.drip();
      sp.water = water;
      if (life.working) {
        const typing = Math.floor(tMs / 380) % 2;
        if (typing !== sp.typing) ambRef.current?.clack();
        sp.typing = typing;
      }

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

    // camera motion at display refresh rate — a critically damped spring toward
    // the resident's focus point (never overshoots), plus fling inertia after
    // the user lets go. Sub-pixel transforms: no more whole-px stair-steps.
    const tickCam = (tMs: number) => {
      const inner = panInnerRef.current;
      const vv = viewRef.current;
      if (!inner) return;
      const c = cam.current;
      const dt = c.lastT > 0 ? Math.min(0.05, Math.max(0, (tMs - c.lastT) / 1000)) : 0;
      c.lastT = tMs;
      if (vv.mode !== "pan") return;
      const maxX = Math.max(0, vv.cssW - vv.vw);
      if (c.x < 0) c.x = maxX / 2;
      if (dt > 0) {
        if (tMs - c.lastDrag < 6000) {
          // user-driven window: only a dying fling glides here
          if (Math.abs(c.v) > 8) {
            c.x += c.v * dt;
            c.v *= Math.exp(-3.4 * dt);
            if (c.x <= 0 || c.x >= maxX) {
              c.x = Math.min(maxX, Math.max(0, c.x));
              c.v = 0;
            }
          } else c.v = 0;
        } else if (!reduced) {
          // critically damped spring — smooth acceleration, zero overshoot
          const om = 4.4;
          const target = c.target < 0 ? maxX / 2 : c.target;
          c.v += (-(c.x - target) * om * om - 2 * om * c.v) * dt;
          c.x += c.v * dt;
          if (Math.abs(target - c.x) < 0.5 && Math.abs(c.v) < 3) {
            c.x = target;
            c.v = 0;
          }
          if (c.x < 0) {
            c.x = 0;
            c.v = 0;
          } else if (c.x > maxX) {
            c.x = maxX;
            c.v = 0;
          }
        }
      }
      inner.style.transform = `translate3d(${(-c.x).toFixed(2)}px, ${vv.ty}px, 0)`;
    };

    if (reduced) {
      draw(0);
      tickCam(0); // settle the initial transform even without the loop
      const timer = window.setInterval(() => draw(0), 30_000);
      return () => window.clearInterval(timer);
    }

    const loop = (tMs: number) => {
      raf = window.requestAnimationFrame(loop);
      tickCam(tMs); // camera moves at display rate — buttery even at 12fps paint
      if (tMs - last < FRAME_MS) return;
      last = tMs;
      draw(tMs);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [avatar, enginePrefs, view.size.w, view.size.h, view.mode]);

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

      {/* the room — full bleed; on narrow screens it's a wide world you drag across */}
      <div
        ref={panOuterRef}
        className="absolute inset-0"
        style={view.mode === "pan" ? { touchAction: "none" } : undefined}
      >
        <div
          ref={panInnerRef}
          className="absolute left-0 top-0"
          style={
            view.mode === "pan"
              ? { width: view.cssW, height: view.cssH, willChange: "transform" }
              : { inset: 0 }
          }
        >
          <canvas
            ref={canvasRef}
            width={view.size.w}
            height={view.size.h}
            className="block h-full w-full"
            style={{ imageRendering: "pixelated" }}
            role="img"
            aria-label="A cozy pixel bedroom that follows your local time of day"
          />
        </div>
      </div>

      {/* swipe hint — first visit on a narrow screen only */}
      {view.mode === "pan" && !hasPanned && (
        <div
          className="afk-pixel pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-black/35 px-3 py-2 text-[9px] tracking-widest text-violet-200 backdrop-blur-[2px]"
          style={{ bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 3rem)" }}
        >
          ⟷ drag to explore
        </div>
      )}

      {/* status ticker — clock + life's next moment, same pixel style as the war HUD */}
      <div
        className="afk-pixel pointer-events-none absolute rounded-lg bg-black/25 px-3 py-2 backdrop-blur-[2px]"
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          left: "max(0.75rem, env(safe-area-inset-left))",
          // keep clear of the top-right war HUD even on the narrowest phones
          maxWidth: "calc(100vw - 10rem)",
        }}
        role="status"
        aria-label="Room status"
      >
        <div className="text-[11px] leading-relaxed text-violet-100 sm:text-xs">{ticker.clock}</div>
        <div
          className="mt-1 truncate text-[9px] leading-relaxed text-violet-300 sm:text-[10px]"
          title={ticker.line !== ticker.aria ? ticker.aria : undefined}
        >
          {ticker.line}
        </div>
      </div>

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

          <label className="mb-3 block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-violet-400">
              Cat's name
            </span>
            <input
              type="text"
              value={prefs.catName}
              maxLength={9}
              placeholder="(unnamed menace)"
              onChange={(e) =>
                setPrefs((p) => ({ ...p, catName: e.target.value.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 9) }))
              }
              className="w-full rounded-md border border-violet-800 bg-[#0f0d1e] px-2 py-1 uppercase tracking-wider text-violet-100 placeholder:normal-case placeholder:tracking-normal placeholder:text-violet-500/70"
            />
            <span className="mt-1 block text-[9px] text-violet-500/80">the ticker uses it at dinner time & mid-zoomies</span>
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
          <p className="mt-1 text-[9px] leading-relaxed text-violet-500/80">
            {view.mode === "pan" ? "⟷ drag the room · camera follows its day" : "the room lives its day with you"}
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
