// ---------------------------------------------------------------------------
// MCWV AFK Room — pure pixel-room engine, Stardew-grade retro edition.
//
// NO DOM, NO Next imports: the same file drives the browser canvas (via a
// CanvasTarget adapter) and a software rasterizer used for offline snapshot
// tests/art QA. Everything the room knows: schedule, moods, lighting, avatar.
//
// v2: full-screen parametric layout (3-zone anchoring), beveled furniture,
// patchwork quilt, curtains, wallpaper + wainscot, plank floor, Bayer dither,
// contact shadows, fairy lights, wall clock with real local time.
//
// v3 "Window Cinema": time-angled god rays split by the mullions, traveling
// floor pool, wall wash, rim lighting on furniture + resident, beam-boosted
// dust, hills silhouette + far house lights, golden/silver cloud linings,
// low-sun bloom + fan rays, occasional shooting stars.
//
// v5 "LIVELY": power moments (lamp clicks off at bedtime, monitor CRT
// collapse/warm-up, twin-bell alarm, curtains that open with the morning walk
// and close at wind-down — slitted beams overnight), routines (weekday desk
// work sessions with scrolling code, cat feeding + pet stops, weekend plant
// watering), set pieces (wall fish tank, shelf boombox, sweeping second hand),
// and critters (moths at the lamp, summer fireflies, rainbow after storms).
// ---------------------------------------------------------------------------

export type RGB = [number, number, number]

/** Minimal drawing surface. All units are logical room pixels. */
export interface PixelTarget {
  /** opaque rect */
  fill(x: number, y: number, w: number, h: number, color: RGB): void
  /** alpha-over rect (0..1) */
  blend(x: number, y: number, w: number, h: number, color: RGB, alpha: number): void
  /** multiply rect — lighting/shadow */
  mul(x: number, y: number, w: number, h: number, color: RGB, alpha: number): void
  /** additive rect — glow */
  add(x: number, y: number, w: number, h: number, color: RGB, alpha: number): void
  /** restrict drawing to the rect until unclip() */
  clip(x: number, y: number, w: number, h: number): void
  unclip(): void
}

export type RoomSize = { w: number; h: number }

// ------------------------------ color helpers ------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t)
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
}

function scale(c: RGB, f: number): RGB {
  return [
    Math.min(255, Math.max(0, c[0] * f)),
    Math.min(255, Math.max(0, c[1] * f)),
    Math.min(255, Math.max(0, c[2] * f)),
  ]
}

/** deterministic 0..1 hash — stable star/dust/plank placement across frames */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const TAU = Math.PI * 2

// ------------------------------ mood timeline ------------------------------

export type MoodFrame = {
  skyTop: RGB
  skyHorizon: RGB
  /** 0..1 — strength of the dark-blue night overlay */
  ambient: number
  /** room multiply-tint color + amount */
  tint: RGB
  tintAmt: number
  /** 0..1 star visibility */
  stars: number
}

type MoodStop = MoodFrame & { hour: number }

const NIGHT_SKY_TOP: RGB = [8, 10, 30]
const NIGHT_SKY_HOR: RGB = [24, 28, 62]

// Circular timeline; wraps past 24h back to the first stop.
const MOOD_STOPS: MoodStop[] = [
  { hour: 0.0, skyTop: NIGHT_SKY_TOP, skyHorizon: NIGHT_SKY_HOR, ambient: 0.4, tint: [52, 58, 128], tintAmt: 0.3, stars: 1 },
  { hour: 5.0, skyTop: NIGHT_SKY_TOP, skyHorizon: NIGHT_SKY_HOR, ambient: 0.4, tint: [52, 58, 128], tintAmt: 0.3, stars: 1 },
  { hour: 6.0, skyTop: [28, 32, 74], skyHorizon: [126, 82, 112], ambient: 0.32, tint: [74, 70, 136], tintAmt: 0.24, stars: 0.5 },
  { hour: 7.0, skyTop: [96, 114, 192], skyHorizon: [255, 172, 112], ambient: 0.14, tint: [156, 124, 140], tintAmt: 0.12, stars: 0.08 },
  { hour: 8.5, skyTop: [122, 176, 240], skyHorizon: [206, 231, 250], ambient: 0.03, tint: [255, 244, 222], tintAmt: 0.05, stars: 0 },
  { hour: 12.5, skyTop: [112, 176, 250], skyHorizon: [216, 240, 255], ambient: 0.0, tint: [255, 252, 244], tintAmt: 0.03, stars: 0 },
  { hour: 16.5, skyTop: [122, 172, 240], skyHorizon: [226, 236, 250], ambient: 0.02, tint: [255, 240, 224], tintAmt: 0.04, stars: 0 },
  { hour: 18.0, skyTop: [142, 122, 210], skyHorizon: [255, 182, 102], ambient: 0.09, tint: [255, 192, 132], tintAmt: 0.12, stars: 0 },
  { hour: 19.25, skyTop: [72, 62, 142], skyHorizon: [236, 122, 112], ambient: 0.2, tint: [152, 112, 162], tintAmt: 0.2, stars: 0.3 },
  { hour: 20.5, skyTop: [22, 26, 62], skyHorizon: [92, 72, 122], ambient: 0.3, tint: [82, 82, 152], tintAmt: 0.26, stars: 0.7 },
  { hour: 22.0, skyTop: NIGHT_SKY_TOP, skyHorizon: NIGHT_SKY_HOR, ambient: 0.4, tint: [52, 58, 128], tintAmt: 0.3, stars: 1 },
]

export function moodAt(hour: number): MoodFrame {
  const h = ((hour % 24) + 24) % 24
  for (let i = 0; i < MOOD_STOPS.length; i++) {
    const cur = MOOD_STOPS[i]
    const nxt = MOOD_STOPS[(i + 1) % MOOD_STOPS.length]
    const span = i === MOOD_STOPS.length - 1 ? 24 - cur.hour + nxt.hour : nxt.hour - cur.hour
    const inSeg =
      i === MOOD_STOPS.length - 1 ? h >= cur.hour || h < nxt.hour : h >= cur.hour && h < nxt.hour
    if (inSeg && span > 0) {
      const t = clamp01(((h - cur.hour + 24) % 24) / span)
      return {
        skyTop: mix(cur.skyTop, nxt.skyTop, t),
        skyHorizon: mix(cur.skyHorizon, nxt.skyHorizon, t),
        ambient: lerp(cur.ambient, nxt.ambient, t),
        tint: mix(cur.tint, nxt.tint, t),
        tintAmt: lerp(cur.tintAmt, nxt.tintAmt, t),
        stars: lerp(cur.stars, nxt.stars, t),
      }
    }
  }
  return { ...MOOD_STOPS[0] }
}

// ------------------------------ schedule brain -----------------------------

export type AfkPrefs = {
  /** local hour the avatar goes to bed: 21,22,23,0 (=24),1 (=25) */
  bedtime: number
}

export const DEFAULT_PREFS: AfkPrefs = { bedtime: 23 }

// ------------------------------ weather -------------------------------------

export type WeatherKind = "clear" | "cloud" | "rain" | "snow" | "storm" | "fog"

/** live-sky description fed in from the client; engine stays pure & offline-capable */
export type WeatherState = {
  kind: WeatherKind
  /** 0..1 — rain rate, snow density, cloud cover or fog thickness */
  intensity: number
  /** 0..1 — curtain/plant sway, fairy-light swing, snow drift */
  wind: number
}

export const CLEAR_WEATHER: WeatherState = { kind: "clear", intensity: 0, wind: 0.15 }

/** overcast skies steal the sun's drama — scale the beam light down */
function dimWindowLightForWeather(wl: WindowLight, w: WeatherState): WindowLight {
  if (!wl.active || w.kind === "clear") return wl
  const cover = w.kind === "fog" ? Math.min(1, w.intensity * 1.2) : w.intensity
  const keep = 1 - 0.62 * cover
  return { ...wl, peak: wl.peak * keep, side: wl.side * keep }
}

/** double-pulse lightning flash 0..1 for storms (deterministic per ~12s lane) */
export function lightningAt(tMs: number, w: WeatherState): number {
  if (w.kind !== "storm") return 0
  const lane = Math.floor(tMs / 12000)
  if (hash(lane * 3.17 + 0.7) < 0.32) return 0
  const c = tMs % 12000
  const tri = (x: number, half: number) => Math.max(0, 1 - Math.abs(x) / half)
  const f = tri(c - 120, 120) + 0.85 * tri(c - 420, 220)
  return clamp01(f) * (0.55 + 0.45 * w.intensity)
}

const daySeedOf = (now: Date) =>
  hash((now.getFullYear() * 372 + (now.getMonth() + 1) * 31 + now.getDate()) * 0.773)

/**
 * The room's own weather system — random but deterministic per ~75-minute
 * sky-slot: the sky drifts through the day all by itself, identical for
 * anyone looking at the same moment. No network, no location, pure clockwork.
 */
export function weatherAt(now: Date): WeatherState {
  const daySeed = daySeedOf(now)
  const SLOT_MIN = 75
  const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / SLOT_MIN)
  const climate = hash(daySeed * 55.7) // 0 = unsettled day, 1 = golden day
  const roll = hash(daySeed * 91.7 + slot * 13.13)
  const windRoll = hash(slot * 7.77 + daySeed * 3.31)
  const wind = clamp01(0.12 + windRoll * 0.68)
  const month = now.getMonth() // 0-based; snow only Nov..Mar
  const snowSeason = month <= 2 || month >= 10

  const clearChance = 0.3 + climate * 0.38
  if (roll < clearChance) return { kind: "clear", intensity: 0, wind }
  const r = (roll - clearChance) / (1 - clearChance)
  const v = hash(slot * 5.51 + daySeed * 8.9)
  if (r < 0.3) return { kind: "cloud", intensity: 0.32 + v * 0.25, wind }
  if (r < 0.52) return { kind: "cloud", intensity: 0.62 + v * 0.3, wind }
  if (r < 0.7) return { kind: "rain", intensity: 0.3 + v * 0.4, wind }
  if (r < 0.78) {
    return climate < 0.55 && v > 0.35
      ? { kind: "storm", intensity: 0.55 + v * 0.35, wind: clamp01(0.5 + windRoll * 0.5) }
      : { kind: "rain", intensity: 0.65 + v * 0.3, wind }
  }
  if (r < 0.9) {
    return snowSeason
      ? { kind: "snow", intensity: 0.4 + v * 0.45, wind }
      : { kind: "rain", intensity: 0.5 + v * 0.35, wind }
  }
  return { kind: "fog", intensity: 0.55 + v * 0.35, wind: clamp01(windRoll * 0.4) }
}

export type DayPhase = "sleep" | "wake" | "day" | "evening" | "tobed"

export type SceneState = {
  hour: number
  weekend: boolean
  sleeping: boolean
  /** brief stand-by-bed moment after waking / before bed */
  standing: boolean
  justWoke: boolean
  yawning: boolean
  lampOn: boolean
  microOn: boolean
  mood: MoodFrame
  phase: DayPhase
}

const hoursUntil = (from: number, to: number) => ((to - from + 24) % 24 + 24) % 24

export function sceneStateAt(now: Date, prefs: AfkPrefs = DEFAULT_PREFS): SceneState {
  const hour =
    now.getHours() +
    now.getMinutes() / 60 +
    (now.getSeconds() + now.getMilliseconds() / 1000) / 3600
  const day = now.getDay()
  const weekend = day === 0 || day === 6
  const wake = weekend ? 9 : 6.5
  const bedRaw = prefs.bedtime
  const bedH = bedRaw >= 24 ? bedRaw - 24 : bedRaw

  const sleeping =
    bedH < wake ? hour >= bedH && hour < wake : hour >= bedH || hour < wake

  const justWoke = !sleeping && hour >= wake && hour < wake + 0.25
  const preBed = !sleeping && !justWoke && hoursUntil(hour, bedH) <= 0.3
  const standing = justWoke || preBed

  const mood = moodAt(hour)

  const lampOn = !sleeping && mood.ambient > 0.16
  const microOn = !sleeping && mood.ambient > 0.12

  if (sleeping) {
    mood.ambient = Math.min(0.46, mood.ambient + 0.08)
    mood.tintAmt = Math.min(0.38, mood.tintAmt + 0.05)
  }

  const phase: DayPhase = sleeping
    ? "sleep"
    : justWoke
      ? "wake"
      : preBed
        ? "tobed"
        : lampOn
          ? "evening"
          : "day"

  return {
    hour,
    weekend,
    sleeping,
    standing,
    justWoke,
    yawning: preBed,
    lampOn,
    microOn,
    mood,
    phase,
  }
}

// ------------------------------ avatar specs -------------------------------

export type HairStyle = "short" | "spiky" | "beanie" | "long"

export type AvatarSpec = {
  skin: RGB
  hair: RGB
  hairStyle: HairStyle
  hoodie: RGB
}

export const SKIN_PRESETS: { label: string; value: RGB }[] = [
  { label: "Porcelain", value: [250, 220, 190] },
  { label: "Honey", value: [226, 180, 132] },
  { label: "Amber", value: [188, 132, 84] },
  { label: "Cocoa", value: [122, 76, 48] },
]

export const HAIR_PRESETS: { label: string; value: RGB }[] = [
  { label: "Midnight", value: [44, 40, 56] },
  { label: "Chestnut", value: [104, 64, 38] },
  { label: "Sandy", value: [210, 168, 96] },
  { label: "Microwave Violet", value: [140, 92, 220] },
]

export const HAIR_STYLES: { label: string; value: HairStyle }[] = [
  { label: "Short", value: "short" },
  { label: "Spiky", value: "spiky" },
  { label: "Beanie", value: "beanie" },
  { label: "Long", value: "long" },
]

export const HOODIE_PRESETS: { label: string; value: RGB }[] = [
  { label: "MCWV Violet", value: [128, 88, 205] },
  { label: "Ocean", value: [64, 108, 180] },
  { label: "Mint", value: [76, 158, 120] },
  { label: "Sunset", value: [205, 110, 80] },
  { label: "Shadow", value: [66, 68, 86] },
]

export const DEFAULT_AVATAR: AvatarSpec = {
  skin: SKIN_PRESETS[1].value,
  hair: HAIR_PRESETS[0].value,
  hairStyle: "short",
  hoodie: HOODIE_PRESETS[0].value,
}

// ------------------------------ retro primitives ---------------------------

type Mode = "fill" | "blend" | "add" | "mul"

function stamp(t: PixelTarget, mode: Mode, x: number, y: number, w: number, h: number, c: RGB, a = 1) {
  if (w <= 0 || h <= 0) return
  if (mode === "fill") t.fill(x, y, w, h, c)
  else if (mode === "blend") t.blend(x, y, w, h, c, a)
  else if (mode === "add") t.add(x, y, w, h, c, a)
  else t.mul(x, y, w, h, c, a)
}

function ellipse(t: PixelTarget, cx: number, cy: number, rx: number, ry: number, mode: Mode, c: RGB, a = 1) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
    const f = dy / ry
    if (Math.abs(f) > 1) continue
    const half = Math.floor(rx * Math.sqrt(1 - f * f))
    if (half <= 0) continue
    stamp(t, mode, Math.round(cx - half), Math.round(cy + dy), half * 2, 1, c, a)
  }
}

/** classic RPG bevel: light top/left edge, dark bottom/right edge */
function bevel(t: PixelTarget, x: number, y: number, w: number, h: number, base: RGB) {
  t.fill(x, y, w, h, base)
  t.fill(x, y, w, 1, scale(base, 1.28))
  t.fill(x, y, 1, h, scale(base, 1.14))
  t.fill(x, y + h - 1, w, 1, scale(base, 0.62))
  t.fill(x + w - 1, y, 1, h, scale(base, 0.72))
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/** ordered-dither rect: draws scattered pixels — retro translucent shimmer */
function dither(t: PixelTarget, mode: Mode, x: number, y: number, w: number, h: number, c: RGB, density: number) {
  const d = clamp01(density)
  if (d <= 0) return
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if (BAYER4[(y + yy) & 3][(x + xx) & 3] / 16 < d) {
        stamp(t, mode, x + xx, y + yy, 1, 1, c, 1)
      }
    }
  }
}

function glow(t: PixelTarget, cx: number, cy: number, rx: number, ry: number, c: RGB, a: number) {
  ellipse(t, cx, cy, rx, ry, "add", c, a * 0.45)
  ellipse(t, cx, cy, Math.floor(rx * 0.62), Math.floor(ry * 0.62), "add", c, a * 0.6)
  ellipse(t, cx, cy, Math.floor(rx * 0.3), Math.floor(ry * 0.3), "add", c, a)
}

/** dithered glow — radial-falloff retro halo (bounded pixel loop) */
function ditherGlow(t: PixelTarget, cx: number, cy: number, rx: number, ry: number, c: RGB, density: number) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const rn = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
      if (rn > 1) continue
      const local = density * Math.pow(1 - rn, 1.4)
      if (BAYER4[(cy + dy) & 3][(cx + dx) & 3] / 16 < local) {
        t.add(cx + dx, cy + dy, 1, 1, c, 1)
      }
    }
  }
}

/** soft contact shadow that grounds objects in the world */
function contactShadow(t: PixelTarget, x: number, y: number, w: number, strength = 0.3) {
  t.blend(x, y, w, 2, [14, 10, 18], strength)
}

// ------------------------- window cinema: shared light math ----------------

/** the period-of-day light personality used by rays / wash / rims / dust */
export type WindowLight = {
  day: boolean
  /** sun (or moon) altitude 0..1 */
  alt: number
  /** warm side-light strength 0..1 (high at dawn/dusk) */
  side: number
  /** beam color */
  color: RGB
  /** base beam density 0..1 */
  peak: number
  /** beam slope: dx per dy (low noon → near vertical, dawn/dusk → long rake) */
  slope: number
  active: boolean
}

export function windowLightOf(s: SceneState): WindowLight {
  const m = s.mood
  const day = s.hour >= 5.8 && s.hour <= 18.6
  if (day) {
    const dayF = (s.hour - 5.8) / 12.8
    const alt = Math.sin(Math.PI * dayF)
    const warm = Math.pow(1 - alt, 1.3)
    const color = mix([255, 244, 214], [255, 170, 88], warm)
    const peak = 0.05 + 0.13 * warm
    return { day, alt, side: Math.pow(1 - alt, 1.5), color, peak, slope: 0.25 + (1 - alt) * 1.7, active: true }
  }
  const nt = s.hour > 12 ? (s.hour - 18.6) / 11.2 : (s.hour + 24 - 18.6) / 11.2
  if (nt < 0 || nt > 1 || m.stars < 0.3) {
    return { day, alt: 0, side: 0, color: [150, 172, 255], peak: 0, slope: 0.8, active: false }
  }
  const malt = Math.sin(Math.PI * nt)
  const peak = (0.06 + 0.1 * (1 - malt)) * m.stars
  return {
    day,
    alt: malt,
    side: Math.pow(1 - malt, 1.5) * 0.7 * m.stars,
    color: [150, 172, 255],
    peak,
    slope: 0.25 + (1 - malt) * 1.4,
    active: true,
  }
}

export type BeamField = {
  x0: number
  y0: number
  y1: number
  slope: number
  w: number
  active: boolean
}

/** geometry of the beams, shared by the rays and the in-beam dust booster */
function beamField(g: RoomGeo, wl: WindowLight): BeamField {
  const y0 = g.winY + g.winH - 12
  const y1 = g.floorY + Math.min(26, g.h - g.floorY - 6)
  return {
    x0: g.winX + 5,
    y0,
    y1,
    slope: wl.slope,
    w: g.winW - 10,
    active: wl.active && wl.peak > 0.04,
  }
}

// ------------------------------ layout -------------------------------------

/**
 * 3-zone anchored layout: everything keeps its fixed pixel size; only
 * positions move. Screens narrower than the 240px base compress X linearly;
 * wider screens push mid/right zones apart. Wall decor hangs a fixed offset
 * above the floor line, so tall screens just get more sky-wall up top.
 */
export type RoomGeo = {
  w: number
  h: number
  floorY: number
  winX: number
  winY: number
  winW: number
  winH: number
  posterX: number
  posterY: number
  shelfX: number
  shelfY: number
  clockX: number
  clockY: number
  bedX: number
  dresserX: number
  lampX: number
  deskX: number
  deskW: number
  rugCX: number
  rugCY: number
  rugRX: number
  rugRY: number
  catX: number
  catY: number
  sitX: number
  standX: number
}

const BASE_W = 240

export function layoutOf(w: number, h: number): RoomGeo {
  const floorY = Math.round(h * 0.7)
  const dy = floorY - 112 // wall decor anchor shift vs 240x160 reference
  const xs = (x: number) => Math.round((x * w) / BASE_W)
  const solve = (baseX: number, zone: 0 | 1 | 2) => {
    if (w >= BASE_W) {
      const extra = w - BASE_W
      return baseX + Math.round((extra * zone) / 2)
    }
    return xs(baseX)
  }
  const L = (x: number) => solve(x, 0)
  const M = (x: number) => solve(x, 1)
  const R = (x: number) => solve(x, 2)

  const bedX = L(16)
  const dresserX = M(116)
  const deskX = R(176)
  const deskW = 62
  // lamp floats in the free gap between dresser and desk
  const lampX = Math.max(M(164), Math.min(dresserX + 50, deskX - 14))

  const rugCX = M(126)
  const floorH = h - floorY
  const rugCY = floorY + Math.round(floorH * 0.52)
  const rugRX = Math.min(46, Math.max(34, Math.round(w * 0.16)))
  const rugRY = Math.max(9, Math.round(floorH * 0.24))

  return {
    w,
    h,
    floorY,
    winX: L(14),
    winY: 24 + dy,
    winW: 54,
    winH: 56,
    posterX: M(76),
    posterY: 26 + dy,
    shelfX: M(114),
    shelfY: 40 + dy,
    clockX: R(208),
    clockY: 40 + dy,
    bedX,
    dresserX,
    lampX,
    deskX,
    deskW,
    rugCX,
    rugCY,
    rugRX,
    rugRY,
    catX: M(134),
    catY: rugCY - 8,
    sitX: deskX + 12,
    standX: bedX + 84,
  }
}

// ------------------------------ walls & floor ------------------------------

const WALL_BASE: RGB = [74, 68, 112]
const WALL_MOTIF: RGB = [88, 82, 128]
const WAINSCOT: RGB = [116, 76, 46]
const FLOOR_BASE: RGB = [150, 104, 62]

function drawWalls(t: PixelTarget, g: RoomGeo) {
  // wallpaper base
  t.fill(0, 0, g.w, g.floorY, WALL_BASE)
  // wallpaper motif: tiny diamond lattice + faint pinstripes
  for (let y = 6; y < g.floorY - 16; y += 16) {
    for (let x = 5 + ((y / 16) % 2) * 8; x < g.w; x += 16) {
      t.fill(x, y, 1, 1, WALL_MOTIF)
      t.fill(x - 1, y + 1, 3, 1, WALL_MOTIF)
      t.fill(x, y + 2, 1, 1, WALL_MOTIF)
    }
  }
  for (let x = 8; x < g.w; x += 24) {
    t.blend(x, 0, 2, g.floorY, scale(WALL_BASE, 1.08), 0.5)
  }

  // wainscot band with top rail + grooves
  const wY = g.floorY - 14
  t.fill(0, wY, g.w, 14, WAINSCOT)
  t.fill(0, wY, g.w, 2, scale(WAINSCOT, 1.3))
  t.fill(0, wY + 2, g.w, 1, scale(WAINSCOT, 1.12))
  for (let x = 6; x < g.w; x += 10) {
    t.fill(x, wY + 3, 1, 11, scale(WAINSCOT, 0.78))
    t.fill(x + 1, wY + 3, 1, 11, scale(WAINSCOT, 1.1))
  }
  t.fill(0, g.floorY - 1, g.w, 1, scale(WAINSCOT, 0.55))
}

function drawFloor(t: PixelTarget, g: RoomGeo) {
  t.fill(0, g.floorY, g.w, g.h - g.floorY, FLOOR_BASE)
  const rows = Math.ceil((g.h - g.floorY) / 9)
  for (let r = 0; r < rows; r++) {
    const y = g.floorY + r * 9
    // plank face shading per row
    const rowTone = 0.94 + hash(r * 7 + 1) * 0.12
    t.fill(0, y, g.w, 9, scale(FLOOR_BASE, rowTone))
    // top highlight + bottom gap line
    t.fill(0, y, g.w, 1, scale(FLOOR_BASE, rowTone * 1.16))
    t.fill(0, y + 8, g.w, 1, scale(FLOOR_BASE, 0.62))
    // staggered joints + nails
    let x = ((r % 2) * 14 + 20) % Math.max(30, g.w)
    while (x < g.w) {
      t.fill(x, y, 1, 9, scale(FLOOR_BASE, 0.7))
      t.fill(x - 2, y + 2, 1, 1, scale(FLOOR_BASE, 0.55))
      t.fill(x + 2, y + 6, 1, 1, scale(FLOOR_BASE, 0.55))
      x += 30 + Math.floor(hash(x + r * 31) * 10)
    }
    // grain streaks
    for (let s = 0; s < Math.floor(g.w / 26); s++) {
      const gx = Math.floor(hash(r * 53 + s * 17) * (g.w - 12))
      const gy = y + 2 + Math.floor(hash(s * 23 + r * 5) * 5)
      t.fill(gx, gy, 6 + Math.floor(hash(s + r) * 8), 1, scale(FLOOR_BASE, rowTone * 0.88))
    }
  }
}

// ------------------------------ fairy lights -------------------------------

function drawFairyLights(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number, wind: number) {
  const topY = 5
  const span = g.w - 16
  const night = s.mood.ambient > 0.1
  let prevX = 8
  let prevY = topY
  for (let i = 0; i <= Math.floor(span / 11); i++) {
    const x = 8 + i * 11
    const sag = Math.sin((Math.PI * x) / g.w)
    const sway = Math.round(Math.sin(tMs * (0.0006 + wind * 0.0009) + i * 0.9) * Math.max(1, wind * 2.4))
    const y = topY + Math.round(6 * sag * (((i % 2) + 1) / 2)) + sway
    // wire
    if (i > 0) {
      const steps = Math.max(1, x - prevX)
      for (let k = 1; k < steps; k++) {
        const wx = prevX + k
        const wy = prevY + Math.round(((y - prevY) * k) / steps)
        t.fill(wx, wy, 1, 1, [30, 28, 42])
      }
    }
    prevX = x
    prevY = y
    // bulb
    const warm: RGB = [255, 208, 120]
    const violet: RGB = [178, 130, 255]
    const c = i % 2 === 0 ? violet : warm
    t.fill(x, y, 1, 1, scale(c, night ? 1 : 0.75))
    if (night) {
      const tw = 0.35 + 0.3 * Math.pow(Math.sin(tMs * 0.0013 + i * 2.1), 2)
      dither(t, "add", x - 2, y - 2, 5, 5, c, tw * 0.4)
    }
  }
}

// ------------------------------ sky & window -------------------------------

function sunMoonPos(hour: number, g: RoomGeo, inn: { x: number; y: number; w: number; h: number }) {
  if (hour >= 5.8 && hour <= 18.6) {
    const f = (hour - 5.8) / 12.8
    return { x: inn.x + 6 + f * (inn.w - 14), y: inn.y + inn.h - 14 - Math.sin(Math.PI * f) * (inn.h - 22), sun: true }
  }
  const nt = hour > 12 ? (hour - 18.6) / 11.2 : (hour + 24 - 18.6) / 11.2
  if (nt < 0 || nt > 1) return null
  return { x: inn.x + 6 + nt * (inn.w - 14), y: inn.y + inn.h - 14 - Math.sin(Math.PI * nt) * (inn.h - 22), sun: false }
}

function drawWindow(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number, wth: WeatherState, wl: WindowLight, life: LifeState) {
  const m = s.mood
  const W = { x: g.winX, y: g.winY, w: g.winW, h: g.winH }
  const inn = { x: W.x + 4, y: W.y + 4, w: W.w - 8, h: W.h - 8 }

  // the sky, weather-adjusted: overcast greys it out, fog washes it away
  const dayness = clamp01((0.45 - m.ambient) * 3)
  const skyDim =
    wth.kind === "clear" ? 0 : wth.kind === "fog" ? wth.intensity * 0.95 : wth.intensity * 0.8
  const overTop: RGB = mix([26, 28, 44], [96, 102, 130], dayness)
  const overHor: RGB = mix([40, 42, 62], [168, 174, 188], dayness)
  const skyTop = mix(m.skyTop, overTop, skyDim)
  const skyHor = mix(m.skyHorizon, overHor, Math.min(1, skyDim * 1.1))
  const starVis = m.stars * (1 - Math.min(1, skyDim))

  // curtain rod + curtains first (behind frame edges)
  const rodY = W.y - 4
  t.fill(W.x - 6, rodY, W.w + 12, 2, [92, 60, 60])
  t.fill(W.x - 7, rodY - 1, 3, 3, [140, 96, 92])
  t.fill(W.x + W.w + 4, rodY - 1, 3, 3, [140, 96, 92])
  const curtain: RGB = [100, 64, 150]
  for (const side of [0, 1]) {
    const cx = side === 0 ? W.x - 3 : W.x + W.w - 5
    for (let i = 0; i < W.h + 4; i++) {
      const flare = Math.floor(i / 8)
      const width = 8 - Math.floor(flare / 2)
      const off = side === 0 ? 0 : 8 - width
      const tone = i % 3 === 0 ? scale(curtain, 1.18) : i % 3 === 1 ? curtain : scale(curtain, 0.78)
      // breeze: the hem sways most on windy days
      const sway = Math.round(Math.sin(tMs * 0.0011 + side * 2.1) * wth.wind * 2.2 * (i / (W.h + 4)))
      t.fill(cx + off + sway + (side === 0 ? -Math.floor(flare / 3) : Math.floor(flare / 3)), W.y - 2 + i, width, 1, tone)
    }
    // tie-back gather
    const ty = W.y + Math.floor(W.h * 0.55)
    t.fill(cx + (side === 0 ? 1 : 4), ty, 3, 2, [210, 170, 90])
  }

  // frame
  bevel(t, W.x, W.y, W.w, W.h, [110, 76, 46])

  t.clip(inn.x, inn.y, inn.w, inn.h)

  // sky: retro banded gradient (2px bands)
  for (let i = 0; i < inn.h; i += 2) {
    const f = i / (inn.h - 1)
    const c = mix(skyTop, skyHor, Math.round(f * 8) / 8)
    t.fill(inn.x, inn.y + i, inn.w, 2, c)
  }

  // -------- the world outside: distant rolling hills, two layers --------
  const hillFar: RGB = mix(mix(skyHor, skyTop, 0.5), [34, 36, 64], 0.4)
  const hillNear: RGB = mix(mix(skyHor, skyTop, 0.5), [16, 18, 38], 0.62)
  for (let i = 0; i < inn.w; i++) {
    const waveF = Math.sin((i + 7) * 0.22) * 2 + Math.sin(i * 0.06) * 2
    const topF = inn.y + inn.h - 9 + Math.round(waveF)
    if (topF < inn.y + inn.h) t.fill(inn.x + i, topF, 1, inn.y + inn.h - topF, hillFar)
    const waveN = Math.sin((i + 23) * 0.3) * 2.4
    const topN = inn.y + inn.h - 5 + Math.round(waveN)
    if (topN < inn.y + inn.h) t.fill(inn.x + i, topN, 1, inn.y + inn.h - topN, hillNear)
  }
  // rainbow arcs over the hills in the slot after a storm passes
  if (life.rainbowA > 0.02) {
    const rcx = inn.x + inn.w - 8
    const rcy = inn.y + inn.h - 4
    const bands: [number, RGB][] = [
      [30, [255, 148, 148]],
      [28, [255, 214, 140]],
      [26, [168, 214, 255]],
    ]
    for (const [r, c] of bands) {
      for (let dy = 0; dy < r; dy++) {
        const half = Math.floor(Math.sqrt(r * r - dy * dy))
        const a = life.rainbowA * 0.16 * (1 - dy / r)
        if (a > 0.02) t.add(rcx - half, rcy - dy, half, 1, c, a)
      }
    }
  }

  // far house lights after dark — someone else's window glows out there
  if (starVis > 0.35) {
    for (let i = 0; i < 3; i++) {
      const hx = inn.x + 4 + Math.floor(hash(i * 17 + 5) * (inn.w - 8))
      const relI = hx - inn.x
      const hy = inn.y + inn.h - 8 + Math.round(Math.sin((relI + 7) * 0.22) * 2 + Math.sin(relI * 0.06) * 2)
      const a = starVis * (0.4 + 0.4 * Math.pow(Math.sin(tMs * 0.0009 + i * 2.4), 2))
      t.add(hx, hy, 1, 1, [255, 200, 110], Math.min(1, a))
    }
  }

  // stars
  if (starVis > 0.02) {
    for (let i = 0; i < 18; i++) {
      const sx = inn.x + 1 + Math.floor(hash(i * 3 + 1) * (inn.w - 4))
      const sy = inn.y + 1 + Math.floor(hash(i * 7 + 2) * (inn.h - 8))
      const tw = 0.45 + 0.55 * Math.pow(Math.sin(tMs * 0.0016 + hash(i + 90) * TAU), 2)
      const a = starVis * tw
      if (a > 0.06) t.add(sx, sy, 1, 1, [235, 240, 255], Math.min(1, a))
      if (i < 3 && a > 0.5) {
        t.add(sx - 1, sy, 1, 1, [235, 240, 255], a * 0.6)
        t.add(sx + 1, sy, 1, 1, [235, 240, 255], a * 0.6)
        t.add(sx, sy - 1, 1, 1, [235, 240, 255], a * 0.6)
        t.add(sx, sy + 1, 1, 1, [235, 240, 255], a * 0.6)
      }
    }
  }

  // fog rolls in and swallows the horizon
  if (wth.kind === "fog") {
    const fogC: RGB = mix([52, 54, 74], [188, 192, 204], dayness)
    for (let i = 0; i < inn.h; i += 2) {
      const f = i / inn.h
      t.blend(inn.x, inn.y + i, inn.w, 2, fogC, wth.intensity * (0.25 + 0.55 * f))
    }
  }

  // shooting star — one streaks by every ~53s on clear nights
  if (starVis > 0.5) {
    const cycle = tMs % 53000
    if (cycle < 900) {
      const p = cycle / 900
      const lane = Math.floor(tMs / 53000)
      const sx = inn.x + Math.floor(hash(lane * 3.3) * inn.w * 0.55) + Math.floor(p * 18)
      const sy = inn.y + 1 + Math.floor(hash(lane * 7.7) * 10) + Math.floor(p * 9)
      const fade = Math.sin(Math.PI * p)
      t.add(sx, sy, 1, 1, [255, 255, 255], 0.85 * fade)
      t.add(sx - 1, sy - 1, 1, 1, [220, 228, 255], 0.5 * fade)
      t.add(sx - 2, sy - 1, 1, 1, [190, 200, 255], 0.3 * fade)
      t.add(sx - 3, sy - 2, 1, 1, [190, 200, 255], 0.18 * fade)
    }
  }

  // sun / moon
  const body = sunMoonPos(s.hour, g, inn)
  if (body) {
    if (body.sun) {
      const hot = Math.pow(1 - wl.alt, 1.2)
      // low sun: giant warm bloom + fan rays; high sun: small fierce disc
      glow(t, body.x, body.y, 8 + Math.round(hot * 7), 8 + Math.round(hot * 6), [255, 214, 130], (0.4 + 0.3 * hot) * 0.7)
      if (hot > 0.5) {
        for (const an of [0.12 * Math.PI, 0.28 * Math.PI, 0.45 * Math.PI]) {
          for (let k = 4; k < 24; k += 2) {
            const px = body.x + Math.round(k * Math.cos(an))
            const py = body.y + Math.round(k * Math.sin(an))
            t.add(px, py, 1, 1, [255, 200, 120], 0.12 * (1 - k / 24) * hot)
          }
        }
      }
      ellipse(t, body.x, body.y, 3, 3, "fill", mix([255, 226, 150], [255, 196, 120], hot))
      ellipse(t, body.x, body.y, 2, 2, "fill", [255, 242, 190])
    } else {
      if (m.stars > 0.1) glow(t, body.x, body.y, 7, 7, [190, 205, 255], 0.32 * m.stars)
      ellipse(t, body.x, body.y, 3, 3, "fill", [232, 234, 220])
      t.fill(body.x - 1, body.y - 1, 1, 1, [198, 200, 186])
      t.fill(body.x + 1, body.y + 1, 1, 1, [206, 208, 194])
    }
  }

  // clouds — golden linings near the sun, silver near the moon; weather scales coverage
  const cloudA = Math.max(
    clamp01((0.62 - m.ambient) * 2.4),
    wth.kind === "cloud" || wth.kind === "rain" || wth.kind === "storm"
      ? 0.4 + wth.intensity * 0.55
      : 0
  )
  if (cloudA > 0.05 && wth.kind !== "fog") {
    const cloudy = wth.kind === "clear" ? 0 : wth.intensity
    const cloudBase: RGB = mix(mix([96, 104, 152], [245, 248, 255], dayness), [84, 88, 116], cloudy * 0.55)
    const lining: RGB = wl.day ? mix([255, 190, 120], [255, 236, 190], wl.alt) : [214, 224, 255]
    const cN = wth.kind === "clear" ? 2 : 5
    for (let i = 0; i < cN; i++) {
      const drift = (tMs * (0.0011 + i * 0.0005) * (1 + wth.wind)) % (inn.w + 26)
      const cx = inn.x - 13 + ((hash(i * 13 + 4) * 34 + drift) | 0)
      const cy = inn.y + 3 + Math.floor(hash(i * 5 + 8) * (inn.h - 16))
      const big = i >= 2 ? 3 : 0 // weather clouds are beefier
      t.blend(cx, cy, 10 + big, 2, cloudBase, 0.4 * cloudA)
      t.blend(cx + 2, cy - 1, 6 + big, 1, cloudBase, 0.4 * cloudA)
      t.blend(cx + 1, cy + 2, 8 + big, 1, cloudBase, 0.3 * cloudA)
      if (body) {
        const nearBody = Math.abs(cx + 5 - body.x) < 13 && Math.abs(cy - body.y) < 9
        const strong = wl.day ? 1 - wl.alt : m.stars
        if (nearBody && strong > 0.25) {
          t.blend(cx + 2, cy - 1, 6, 1, lining, 0.5 * cloudA * Math.min(1, strong))
          t.blend(cx + 4, cy, 4, 1, lining, 0.35 * cloudA * Math.min(1, strong))
        }
      }
    }
  }

  // a bird flaps across on fair days — the windowsill cat tracks it
  if (life.bird !== null) {
    const lane = Math.floor(tMs / 47000)
    const bx = inn.x - 4 + Math.floor(life.bird * (inn.w + 8))
    const by =
      inn.y + 4 + Math.floor(hash(lane * 3.3 + 1) * (inn.h - 20) * 0.6) + Math.round(Math.sin(life.bird * TAU) * 2)
    const flap = Math.floor(tMs / 220) % 2 === 0 ? -1 : 1
    t.fill(bx - 1, by + flap, 1, 1, [40, 36, 56])
    t.fill(bx, by, 1, 1, [40, 36, 56])
    t.fill(bx + 1, by + flap, 1, 1, [40, 36, 56])
    if (hash(lane * 5.13) > 0.7) {
      // a friend tags along sometimes
      t.fill(bx - 4, by + 2 + flap, 1, 1, [52, 46, 68])
      t.fill(bx - 3, by + 1, 1, 1, [52, 46, 68])
      t.fill(bx - 2, by + 2 + flap, 1, 1, [52, 46, 68])
    }
  }

  // summer fireflies drifting over the night garden
  if (life.fireflyA > 0.02) {
    for (let i = 0; i < 7; i++) {
      const fx = inn.x + 2 + Math.floor(hash(i * 29 + 7) * (inn.w - 6) + Math.sin(tMs * 0.00021 + i * 1.7) * 4)
      const fy = inn.y + inn.h - 10 + Math.round(Math.sin(tMs * 0.00034 + i * 2.3) * 3 + hash(i * 13) * 3)
      const pulse = Math.pow(Math.max(0, Math.sin(tMs * 0.0011 + i * 2.1)), 6)
      const a = life.fireflyA * pulse
      if (a > 0.1) {
        t.add(fx, fy, 1, 1, [206, 255, 148], Math.min(1, a))
        if (a > 0.45) t.add(fx, fy - 1, 1, 1, [206, 255, 148], a * 0.4)
      }
    }
  }

  // butterfly bumbles about on warm clear afternoons
  if (wth.kind === "clear" && s.hour >= 11 && s.hour <= 17 && tMs % 97000 < 6500) {
    const bt = (tMs % 97000) / 6500
    const fx = inn.x + 8 + Math.floor(hash(Math.floor(tMs / 97000) * 7.7) * (inn.w - 16)) + Math.round(Math.sin(bt * TAU * 2) * 5)
    const fy = inn.y + inn.h - 16 + Math.round(Math.sin(bt * TAU * 3.3) * 5)
    const flap = Math.floor(tMs / 160) % 2 === 0
    t.fill(fx, fy, 1, 1, [255, 178, 92])
    t.fill(fx + (flap ? -1 : 1), fy, 1, 1, [255, 208, 150])
  }

  // rain streaks run down the glass
  if ((wth.kind === "rain" || wth.kind === "storm") && wth.intensity > 0.05) {
    const n = Math.round(16 + wth.intensity * 30)
    for (let i = 0; i < n; i++) {
      const speed = 0.014 + 0.024 * hash(i * 7 + 1)
      const rx = inn.x + 1 + Math.floor(hash(i * 13 + 2) * (inn.w - 2) + Math.sin(tMs * 0.0009 + i) * wth.wind * 2)
      const span = inn.h + 6
      const ry = inn.y - 4 + Math.floor((hash(i * 5 + 3) * span + tMs * speed) % span)
      if (rx >= inn.x && rx < inn.x + inn.w) {
        t.blend(rx, ry, 1, 2, [198, 214, 240], 0.32)
        t.blend(rx, ry - 1, 1, 1, [198, 214, 240], 0.16)
      }
    }
  }

  // snowflakes drift past, wind pushes them sideways
  if (wth.kind === "snow" && wth.intensity > 0.05) {
    const n = Math.round(10 + wth.intensity * 24)
    const span = inn.h + 8
    for (let i = 0; i < n; i++) {
      const fy = (hash(i * 11 + 4) * span + tMs * (0.0035 + 0.004 * hash(i * 3 + 1))) % span
      const fx =
        inn.x +
        Math.floor(
          (hash(i * 17 + 6) * inn.w + Math.sin(tMs * 0.0006 + i * 1.9) * (3 + wth.wind * 6) + tMs * 0.0016 * wth.wind) %
            inn.w
        )
      const bigFlake = i % 5 === 0
      t.blend(fx, inn.y - 4 + Math.floor(fy), bigFlake ? 2 : 1, bigFlake ? 2 : 1, [242, 246, 252], 0.85)
    }
  }

  // lightning backlights the whole pane
  const flash = lightningAt(tMs, wth)
  if (flash > 0) t.add(inn.x, inn.y, inn.w, inn.h, [226, 234, 255], flash * 0.5)

  // glass glare — diagonal sheen
  for (let i = 0; i < inn.h; i++) {
    const gx = inn.x + 2 + Math.floor(i / 2.5)
    if (gx < inn.x + inn.w - 2) t.blend(gx, inn.y + i, 2, 1, [255, 255, 255], 0.07)
  }

  t.unclip()

  // mullions
  t.fill(W.x + Math.floor(W.w / 2) - 1, W.y, 3, W.h, [96, 66, 40])
  t.fill(W.x, W.y + Math.floor(W.h / 2) - 1, W.w, 3, [96, 66, 40])

  // curtains drawn for the night: panels slide inward, leaving a slim slit
  // of moonlit glass — beams outside shrink to match (see renderRoom)
  const cover = Math.round((1 - life.curtainP) * (W.w / 2 - 4))
  if (cover > 0) {
    const curtainC: RGB = [100, 64, 150]
    for (const side of [0, 1]) {
      const x0 = side === 0 ? W.x + 5 : W.x + W.w - 5 - cover
      for (let cx = 0; cx < cover; cx++) {
        const x = x0 + cx
        // scalloped inner edge + gentle fabric length variation
        const inner = side === 0 ? cx >= cover - 3 : cx < 3
        const drape = 1 - Math.abs(cover / 2 - cx) / Math.max(1, cover / 2) // 0 edge .. 1 mid
        const len = W.h - 4 - (inner ? 2 : Math.round(drape * 2))
        const sway = Math.round(Math.sin(tMs * 0.0011 + side * 2.1) * wth.wind * 1.2)
        for (let i = 0; i < len; i++) {
          const tone = (cx + i) % 3 === 0 ? scale(curtainC, 1.18) : (cx + i) % 3 === 1 ? curtainC : scale(curtainC, 0.78)
          t.fill(x + sway, W.y + 3 + i, 1, 1, tone)
        }
        // golden hem at the fabric foot
        t.fill(x + sway, W.y + 3 + len, 1, 1, scale(curtainC, 0.6))
      }
    }
  }

  // sill
  bevel(t, W.x - 3, W.y + W.h, W.w + 6, 4, [96, 64, 38])
  // snow settles on the outside sill
  if (wth.kind === "snow" && wth.intensity > 0.15) {
    t.blend(W.x - 3, W.y + W.h, W.w + 6, 1, [240, 244, 252], 0.25 + 0.6 * wth.intensity)
    if (wth.intensity > 0.6) t.blend(W.x - 1, W.y + W.h + 1, W.w + 2, 1, [240, 244, 252], 0.25 * wth.intensity)
  }
}

/**
 * GOD RAYS — volumetric beams pouring from the window, split by the mullion
 * bars, angled by sun/moon position: near-vertical at noon, long amber rakes
 * across the room at golden hour, cool blue moon-shafts at night.
 */
function drawGodRays(t: PixelTarget, g: RoomGeo, wl: WindowLight, bf: BeamField) {
  if (!bf.active) return

  const c = wl.color
  const span = bf.y1 - bf.y0
  // solid sheets read much softer than the old full-alpha speckle did —
  // moonlight needs a lift to stay visible, warm sun sheets are fine as-is
  const boost = wl.day ? 1 : 2.6
  const midX = g.winX + Math.floor(g.winW / 2)
  // two slits, split around the vertical mullion bar
  const slits: [number, number][] = [
    [bf.x0 + 1, midX - 3],
    [midX + 3, bf.x0 + bf.w],
  ]
  for (const [sx0, sx1] of slits) {
    const bw = sx1 - sx0
    if (bw <= 0) continue
    // SOLID scanline quad per beam: a soft outer sheet + a brighter inner spine.
    // Crisp edges (no dither) — sparse Bayer dots read as static, not light.
    for (let dy = 0; dy < span; dy++) {
      const widen = dy * 0.05
      const y = bf.y0 + dy
      const fade = 0.7 + 0.3 * (1 - dy / span) // brighter near the glass
      const bx0 = sx0 + dy * bf.slope - widen
      const bx1 = sx1 + dy * bf.slope + widen
      const wRow = Math.max(1, Math.round(bx1 - bx0))
      const aSheet = wl.peak * 0.5 * fade * boost
      if (aSheet > 0.012) t.add(Math.round(bx0), y, wRow, 1, c, aSheet)
      const inset = Math.round(wRow * 0.3)
      const aSpine = wl.peak * 0.4 * fade * boost
      if (aSpine > 0.014 && wRow - inset * 2 > 0)
        t.add(Math.round(bx0) + inset, y, wRow - inset * 2, 1, c, aSpine)
    }
  }
  // moving light pool where the beams land — solid layered glow, no speckle
  const poolX = bf.x0 + Math.round(span * bf.slope + bf.w / 2)
  glow(t, poolX, bf.y1 - 2, 20, 4, c, wl.peak * 0.55 * boost)
}

/** warm/cool atmosphere radiating on the wall around the window */
function drawWallWash(t: PixelTarget, g: RoomGeo, s: SceneState, wl: WindowLight) {
  if (!wl.active) return
  const cx = g.winX + Math.floor(g.winW / 2)
  const cy = g.winY + Math.floor(g.winH / 2)
  const strength = Math.min(0.055, wl.day ? 0.02 + 0.04 * wl.side : 0.04 * s.mood.stars)
  if (strength < 0.03) return
  // solid layered halo hugging the window (ditherGlow speckled the whole wall)
  glow(t, cx, cy, Math.round(g.winW * 0.8), Math.round(g.winH * 0.7), wl.color, strength * 0.85)
}

// ------------------------------ wall decor ---------------------------------

function drawPoster(t: PixelTarget, g: RoomGeo, tMs: number) {
  const x = g.posterX, y = g.posterY, w = 30, h = 38
  bevel(t, x - 2, y - 2, w + 4, h + 4, [52, 44, 84])
  t.fill(x, y, w, h, [40, 34, 78])
  // crescent
  ellipse(t, x + 14, y + 13, 7, 7, "fill", [238, 226, 180])
  ellipse(t, x + 17, y + 11, 6, 6, "fill", [40, 34, 78])
  // twinkling poster stars
  for (let i = 0; i < 4; i++) {
    const a = 0.35 + 0.65 * Math.pow(Math.sin(tMs * 0.0012 + i * 1.7), 2)
    t.add(x + 5 + ((i * 7) % 20), y + 26 + ((i * 5) % 9), 1, 1, [220, 220, 255], a * 0.5)
  }
  // pin corners
  t.fill(x + 1, y + 1, 1, 1, [220, 200, 150])
  t.fill(x + w - 2, y + 1, 1, 1, [220, 200, 150])
}

function drawShelf(t: PixelTarget, g: RoomGeo, dayNum: number) {
  const y = g.shelfY
  const x = g.shelfX
  const books: [number, number, RGB][] = [
    [3, 11, [96, 70, 168]],
    [3, 13, [70, 132, 128]],
    [4, 10, [172, 96, 70]],
    [3, 12, [204, 192, 150]],
    [4, 11, [204, 164, 72]],
    [3, 13, [122, 64, 112]],
  ]
  let bx = x + 4
  for (const [bw, bh, c] of books) {
    bevel(t, bx, y - bh, bw, bh, c)
    bx += bw + 1
  }
  // little cactus — it quietly grows a new segment every ~9 days (and flowers at full size!)
  const growth = Math.floor((dayNum % 36) / 9) // 0..3 segments
  bevel(t, x + 38, y - 4, 5, 4, [168, 92, 58])
  t.fill(x + 39, y - 9, 3, 6, [92, 158, 80])
  t.fill(x + 37, y - 7, 2, 2, [92, 158, 80])
  t.fill(x + 42, y - 8, 2, 2, [82, 146, 72])
  for (let i = 0; i < growth; i++) {
    t.fill(x + 40, y - 11 - i * 2, 1, 2, scale([92, 158, 80], 1 + i * 0.04) as RGB)
  }
  if (growth >= 3) t.fill(x + 40, y - 13, 1, 1, [236, 130, 170]) // bloom!
  // board + brackets
  bevel(t, x, y, 46, 3, [104, 70, 42])
  t.fill(x + 4, y + 3, 2, 3, scale([104, 70, 42], 0.7) as RGB)
  t.fill(x + 40, y + 3, 2, 3, scale([104, 70, 42], 0.7) as RGB)
}

/** the wall clock above the desk — REAL local time, true-angle hands,
 *  brass bezel, twelve ticks, sweeping second hand, glass sheen */
function drawWallClock(t: PixelTarget, g: RoomGeo, now: Date) {
  const cx = g.clockX
  const cy = g.clockY

  // wooden case with a lit crown edge
  ellipse(t, cx, cy, 7, 7, "fill", [86, 58, 38])
  t.fill(cx - 3, cy - 6, 7, 1, [116, 78, 48])
  t.fill(cx - 4, cy - 5, 3, 1, [116, 78, 48])
  // brass bezel + cream face, softly shaded lower-right
  ellipse(t, cx, cy, 6, 6, "fill", [168, 138, 92])
  ellipse(t, cx, cy, 5, 5, "fill", [241, 237, 225])
  ellipse(t, cx + 1, cy + 1, 4, 4, "blend", [198, 192, 174], 0.3)

  // twelve ticks; cardinals reach deeper into the face
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2
    const bold = i % 3 === 0
    const px = cx + Math.round(Math.cos(a) * 4)
    const py = cy + Math.round(Math.sin(a) * 4)
    t.fill(px, py, 1, 1, bold ? [72, 68, 62] : [128, 124, 114])
    if (bold) t.fill(cx + Math.round(Math.cos(a) * 3), cy + Math.round(Math.sin(a) * 3), 1, 1, [72, 68, 62])
  }

  // true-angle hands anchored at the hub
  const minutes = now.getMinutes() + now.getSeconds() / 60
  const hours = (now.getHours() % 12) + minutes / 60
  const hand = (a: number, len: number, c: RGB) => {
    for (let k = 1; k <= len; k++) {
      t.fill(cx + Math.round(Math.cos(a) * k), cy + Math.round(Math.sin(a) * k), 1, 1, c)
    }
  }
  hand((hours / 12) * TAU - Math.PI / 2, 2, [40, 38, 36]) // hour — short & dark
  hand((minutes / 60) * TAU - Math.PI / 2, 4, [58, 56, 52]) // minute — long
  // sweeping red second hand with a counterweight tail
  const sa = ((now.getSeconds() + now.getMilliseconds() / 1000) / 60) * TAU - Math.PI / 2
  hand(sa, 4, [212, 82, 70])
  t.fill(cx - Math.round(Math.cos(sa) * 2), cy - Math.round(Math.sin(sa) * 2), 1, 1, [168, 62, 54])
  // brass hub + whisper of glass
  t.fill(cx, cy, 1, 1, [124, 96, 54])
  t.blend(cx - 2, cy - 4, 2, 1, [255, 255, 255], 0.14)
  t.blend(cx - 3, cy - 3, 1, 1, [255, 255, 255], 0.1)
}

// ------------------------------ furniture ----------------------------------

function drawDresserAndMicrowave(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number, life: SnackFrame) {
  const x = g.dresserX
  const top = g.floorY - 26

  contactShadow(t, x + 1, g.floorY, 44, 0.35)

  // dresser
  bevel(t, x, top, 44, 24, [134, 88, 52])
  t.fill(x, top, 44, 3, scale([134, 88, 52], 1.32) as RGB)
  // drawer seams + handles
  t.fill(x + 21, top + 3, 1, 19, scale([134, 88, 52], 0.68) as RGB)
  t.fill(x, top + 12, 44, 1, scale([134, 88, 52], 0.68) as RGB)
  for (const hx of [x + 9, x + 31]) {
    t.fill(hx, top + 7, 5, 1, [216, 196, 156])
    t.fill(hx, top + 17, 5, 1, [216, 196, 156])
  }
  // feet
  t.fill(x + 2, top + 24, 3, 2, scale([134, 88, 52], 0.55) as RGB)
  t.fill(x + 39, top + 24, 3, 2, scale([134, 88, 52], 0.55) as RGB)

  // microwave — cream MCWV appliance with mesh door
  const mx = x + 4
  const my = top - 13
  const on = s.microOn || life.microOn
  const doorOpen = life.doorOpen
  contactShadow(t, mx, top - 1, 34, 0.25)
  bevel(t, mx, my, 34, 13, [212, 210, 200])
  t.fill(mx, my + 11, 34, 2, scale([212, 210, 200], 0.72) as RGB)
  if (doorOpen) {
    // open cavity — warm interior, little plate, door slab swung to the side
    t.fill(mx + 3, my + 3, 21, 8, [38, 30, 26])
    t.blend(mx + 3, my + 3, 21, 8, [255, 190, 110], 0.35)
    t.fill(mx + 10, my + 8, 7, 1, [226, 224, 210]) // plate
    t.fill(mx + 12, my + 5, 3, 3, [235, 240, 248]) // the mug
    t.fill(mx + 24, my + 2, 2, 9, scale([212, 210, 200], 0.85) as RGB)
    t.fill(mx + 24, my + 2, 1, 9, [30, 32, 42])
  } else {
    // door
    t.fill(mx + 3, my + 3, 21, 8, [30, 32, 42])
    t.fill(mx + 3, my + 3, 21, 1, [52, 54, 66])
    // mesh dither over the door
    dither(t, "blend", mx + 3, my + 3, 21, 8, [10, 12, 18], 0.3)
  }
  if (on && !doorOpen) {
    const pulse = 0.75 + 0.25 * Math.sin(tMs * 0.004)
    t.blend(mx + 3, my + 3, 21, 8, [255, 170, 70], 0.4 * pulse)
    ellipse(t, mx + 13, my + 7, 4, 2, "blend", [255, 196, 110], 0.55)
    ditherGlow(t, mx + 13, my + 8, 15, 7, [255, 160, 60], 0.3 * pulse)
    // re-mesh so it keeps the screen texture through the glow
    dither(t, "blend", mx + 3, my + 3, 21, 8, [10, 12, 18], 0.22)
  }
  // keypad + blinking colon clock
  t.fill(mx + 26, my + 3, 5, 8, [44, 46, 56])
  t.fill(mx + 26, my + 3, 5, 1, [58, 60, 72])
  const blink = Math.floor(tMs / 1000) % 2 === 0
  t.fill(mx + 28, my + 5, 1, 1, [110, 255, 160])
  if (blink) t.fill(mx + 28, my + 8, 1, 1, [110, 255, 160])
}

function drawDesk(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number, life: LifeState) {
  const x = g.deskX
  const surf = g.floorY - 24

  contactShadow(t, x + 1, g.floorY, g.deskW, 0.3)

  // legs first (behind surface)
  bevel(t, x + 2, surf + 4, 3, g.floorY - surf - 4, [118, 78, 46])
  bevel(t, x + g.deskW - 5, surf + 4, 3, g.floorY - surf - 4, [118, 78, 46])
  // surface
  bevel(t, x, surf, g.deskW, 4, [158, 108, 64])

  // monitor
  const mx = x + g.deskW - 30
  const my = surf - 26
  t.fill(mx + 9, my + 20, 3, 4, [58, 60, 70])
  t.fill(mx + 4, my + 24, 13, 2, [58, 60, 70])
  bevel(t, mx, my, 23, 20, [34, 36, 48])
  const power = life.screenPower
  if (life.crtLine === null && power > 0) {
    t.fill(mx + 2, my + 2, 19, 15, [30, 44, 68])
    // title bar with 2 buttons — retro OS vibes
    t.fill(mx + 2, my + 2, 19, 3, [58, 74, 110])
    t.fill(mx + 3, my + 3, 1, 1, [240, 120, 110])
    t.fill(mx + 5, my + 3, 1, 1, [240, 200, 110])
    if (life.working) {
      // deep-work mode: columns of scrolling glyph-code cascading downward
      for (let col = 0; col < 3; col++) {
        const cxc = mx + 3 + col * 6
        for (let row = 0; row < 8; row++) {
          const cell = (row * 7 + col * 13 + Math.floor(tMs / 180)) % 11
          if (cell < 6) {
            const c: RGB = col === 0 ? [110, 220, 160] : col === 1 ? [150, 120, 230] : [110, 170, 240]
            t.fill(cxc + (cell % 3), my + 6 + row, 2 + (cell % 2), 1, c)
          }
        }
      }
    } else {
      const lines: [number, number, number, RGB][] = [
        [6, 0, 12, [110, 220, 160]],
        [9, 2, 8, [150, 120, 230]],
        [12, 1, 14, [110, 170, 240]],
      ]
      for (const [ly, off, len, c] of lines) {
        const wobble = Math.floor(tMs / 900 + ly) % 3 === 0 ? 1 : 0
        t.fill(mx + 3 + off, my + ly, len - wobble * 2, 1, c)
      }
    }
    // taskbar
    t.fill(mx + 2, my + 15, 19, 2, [46, 56, 84])
    t.fill(mx + 3, my + 15, 1, 1, [110, 220, 160])
    // screen glow: solid layered halo + cool spill across the desk surface
    if (s.mood.ambient > 0.12) {
      const flick = 0.92 + 0.08 * Math.sin(tMs * 0.003 + 1.7)
      glow(t, mx + 11, my + 9, 13, 9, [150, 190, 255], 0.3 * flick)
      t.add(mx - 4, surf - 1, 26, 1, [130, 165, 235], 0.16 * flick)
      t.add(mx, surf + 1, 18, 1, [130, 165, 235], 0.1 * flick)
    }
  } else {
    t.fill(mx + 2, my + 2, 19, 15, [18, 20, 28])
    // CRT power moment: warm-up bloom line / collapse-to-line
    if (life.crtLine !== null) {
      const p = Math.abs(life.crtLine)
      const bandH = Math.max(1, Math.round(15 * (life.crtLine > 0 ? p : 1 - p)))
      const by = my + 9 - Math.floor(bandH / 2)
      t.add(mx + 2, by, 19, bandH, [170, 205, 255], 0.55)
      t.add(mx + 5, by + Math.floor(bandH / 2), 13, 1, [220, 236, 255], 0.5)
    }
    // standby LED — the monitor sleeps too
    if (power === 0) {
      const ledPulse = 0.5 + 0.5 * Math.sin(tMs * 0.0012)
      t.blend(mx + 19, my + 17, 1, 1, [255, 120, 80], 0.4 + 0.5 * ledPulse)
    }
  }
  // keyboard with key checker + mouse
  t.fill(mx - 2, surf - 2, 18, 2, [44, 46, 58])
  for (let k = 0; k < 8; k++) t.fill(mx - 1 + k * 2, surf - 1, 1, 1, [64, 66, 80])
  t.fill(mx + 17, surf - 2, 3, 2, [44, 46, 58])

  // the mug — waiting with steam while the resident's at the desk (and not off with it / sipping)
  if (!s.sleeping && !s.standing && !life.snack.active && !(life.working && tMs % 45000 < 1400)) {
    t.fill(x + 5, surf - 4, 3, 4, [226, 230, 240])
    t.fill(x + 8, surf - 3, 1, 2, [200, 206, 220])
    t.fill(x + 5, surf - 3, 3, 1, [150, 110, 220]) // violet band
    // two lazy steam wisps
    for (let i = 0; i < 2; i++) {
      const age = ((tMs + i * 1400) % 2800) / 2800
      const sx = x + 6 + Math.round(Math.sin(tMs * 0.002 + i * 2.4) * 1)
      const sy = surf - 6 - Math.floor(age * 6)
      const a = 0.4 * Math.sin(Math.PI * age)
      if (a > 0.06) t.blend(sx, sy, 1, 1, [240, 244, 255], a)
    }
  }
}

function drawLamp(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number, level = 1) {
  const x = g.lampX
  const floor = g.floorY
  contactShadow(t, x - 5, floor, 12, 0.3)
  const shadeY = floor - 48
  const lit = level > 0.02
  // layered SOLID light, drawn behind the fixture so it clearly comes from the lamp
  if (lit) {
    const pulse = (0.96 + 0.04 * Math.sin(tMs * 0.0035)) * level
    const warm: RGB = [255, 205, 110]
    const warmHi: RGB = [255, 228, 158]
    // halo blooming behind the shade
    glow(t, x, shadeY + 8, 15, 9, warmHi, 0.24 * pulse)
    // the shade's own bright core
    glow(t, x, shadeY + 11, 7, 5, warmHi, 0.4 * pulse)
    // light cone falling to the floor — solid gradient bands, no speckle
    const coneTop = shadeY + 12
    const coneH = floor - coneTop
    if (coneH > 0) {
      for (let i = 0; i < coneH; i++) {
        const f = i / coneH
        const half = Math.round(6 + f * 16)
        const a = (0.15 * (1 - f) + 0.045) * pulse
        t.add(x - half, coneTop + i, half * 2, 1, warm, a)
      }
    }
    // floor pool
    glow(t, x, floor + 2, 20, 3, warm, 0.28 * pulse)
    // warm rim on the furniture nearest the lamp
    if (Math.abs(g.dresserX + 44 - x) < 26)
      t.add(g.dresserX + 43, floor - 26, 1, 24, warm, 0.22 * pulse)
    if (Math.abs(g.deskX - x) < 26) t.add(g.deskX - 1, floor - 24, 1, 6, warm, 0.16 * pulse)
    // moths orbit the shade on dark evenings — little lissajous loops
    if (s.mood.ambient > 0.2 && level > 0.6) {
      for (let i = 0; i < 3; i++) {
        const mx = x + Math.round(Math.cos(tMs * (0.0021 + i * 0.0004) + i * 2.1) * (5 + i * 2))
        const my = shadeY + 7 + Math.round(Math.sin(tMs * (0.0017 + i * 0.0005) + i * 1.3) * 4)
        const flutter = Math.floor(tMs / 90 + i) % 2 === 0
        t.fill(mx, my, 1, 1, [222, 212, 182])
        if (flutter) t.fill(mx + 1, my - 1, 1, 1, [196, 186, 158])
      }
    }
  }
  // pole + base
  t.fill(x - 1, floor - 38, 2, 36, lit ? [168, 152, 172] : [128, 116, 138])
  ellipse(t, x, floor - 1, 6, 2, "fill", [94, 84, 108])
  if (lit) {
    t.fill(x - 7, shadeY, 14, 3, [240, 200, 124])
    t.fill(x - 6, shadeY + 3, 12, 3, [238, 196, 118])
    t.fill(x - 5, shadeY + 6, 10, 4, [232, 188, 110])
    // bulb bulb peeking under the shade
    t.fill(x - 1, shadeY + 10, 2, 2, [255, 240, 190])
    // pleats
    for (let p = -5; p <= 5; p += 3) t.fill(x + p, shadeY + 1, 1, 8, scale([238, 196, 118], 0.85) as RGB)
  } else {
    t.fill(x - 7, shadeY, 14, 3, [152, 142, 162])
    t.fill(x - 6, shadeY + 3, 12, 3, [146, 136, 156])
    t.fill(x - 5, shadeY + 6, 10, 4, [140, 130, 150])
    for (let p = -5; p <= 5; p += 3) t.fill(x + p, shadeY + 1, 1, 8, scale([146, 136, 156], 0.82) as RGB)
  }
}

const QUILT_A: RGB = [108, 74, 158]
const QUILT_B: RGB = [90, 58, 138]
const QUILT_HL: RGB = [132, 96, 186]

function quilt(t: PixelTarget, x: number, y: number, w: number, h: number, bumpX0?: number, bumpY_?: number) {
  // patchwork squares + stitch lines
  const cell = 7
  for (let yy = 0; yy < h; yy += cell) {
    for (let xx = 0; xx < w; xx += cell) {
      const alt = ((xx / cell) | 0) % 2 !== ((yy / cell) | 0) % 2
      t.fill(x + xx, y + yy, Math.min(cell, w - xx), Math.min(cell, h - yy), alt ? QUILT_B : QUILT_A)
    }
  }
  for (let xx = 0; xx <= w; xx += cell) t.fill(x + Math.min(xx, w - 1), y, 1, h, scale(QUILT_A, 0.72))
  for (let yy = 0; yy <= h; yy += cell) t.fill(x, y + Math.min(yy, h - 1), w, 1, scale(QUILT_A, 0.72))
  // top folded edge
  t.fill(x, y, w, 2, QUILT_HL)
}

function drawBed(t: PixelTarget, g: RoomGeo) {
  const x = g.bedX
  const top = g.floorY - 20

  contactShadow(t, x + 2, g.floorY, 96, 0.35)

  // headboard with post knobs
  bevel(t, x - 2, top - 18, 6, 38, [96, 62, 38])
  t.fill(x - 3, top - 21, 3, 3, scale([96, 62, 38], 1.35) as RGB)
  // footboard
  bevel(t, x + 90, top - 8, 5, 28, [96, 62, 38])
  t.fill(x + 91, top - 11, 3, 3, scale([96, 62, 38], 1.35) as RGB)
  // mattress
  bevel(t, x + 4, top, 88, 16, [218, 208, 188])
  // pillow
  bevel(t, x + 8, top - 2, 15, 8, [244, 240, 230])
  // quilt
  quilt(t, x + 26, top - 1, 64, 18)
}

function drawRug(t: PixelTarget, g: RoomGeo) {
  const { rugCX: cx, rugCY: cy, rugRX: rx, rugRY: ry } = g
  // fringe: tiny dots around the outer edge
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU
    ellipse(t, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1, 1, "fill", [196, 178, 220])
  }
  ellipse(t, cx, cy, rx, ry, "fill", [74, 48, 110])
  ellipse(t, cx, cy, rx - 4, ry - 3, "fill", [104, 74, 146])
  // diamond ring motif
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    const mx = Math.round(cx + Math.cos(a) * (rx - 8))
    const my = Math.round(cy + Math.sin(a) * (ry - 3))
    t.fill(mx, my, 1, 1, [150, 116, 196])
  }
  ellipse(t, cx, cy - 1, Math.floor(rx * 0.55), Math.floor(ry * 0.55), "fill", [128, 98, 168])
  // center diamond
  for (let i = 0; i < 3; i++) {
    t.fill(cx - 3 + i, cy - 1 - 1 + i, 7 - i * 2, 1, [188, 160, 224])
    t.fill(cx - 3 + i, cy + 1 - 1 + i, 7 - i * 2, 1, [188, 160, 224])
  }
}

const CAT_BODY: RGB = [214, 176, 126] // ginger
const CAT_STRIPE: RGB = [176, 136, 88]
const CAT_DARK: RGB = [120, 88, 60]

function drawCat(t: PixelTarget, g: RoomGeo, life: CatFrame, tMs: number) {
  const { x, pose, facing, perk } = life
  const gy = life.gy
  const breathe = Math.sin(tMs * 0.0011) > -0.2 ? 1 : 0
  const flick = tMs % 6000 < 700

  if (pose === "loaf") {
    const y = gy - 7
    contactShadow(t, x - 1, gy, 15, 0.25)
    t.fill(x, y + 2, 12, 5, CAT_BODY)
    t.fill(x + 1, y + 1, 10, 2, CAT_BODY)
    t.fill(x + 2, y + breathe, 7, 2, CAT_BODY)
    t.fill(x + 3, y + 2 + breathe, 1, 1, CAT_STRIPE)
    t.fill(x + 6, y + 2 + breathe, 1, 1, CAT_STRIPE)
    t.fill(x + 2, y - 1 + breathe, 1, 2, CAT_STRIPE)
    t.fill(x + 5, y - 1 + breathe, 1, 2, CAT_STRIPE)
    t.fill(x + 3, y + 3 + breathe, 1, 1, CAT_DARK)
    t.fill(x + 12, y + (flick ? 1 : 3), 2, 1, CAT_STRIPE)
    // tiny z
    if (tMs % 4200 > 1800) {
      const a = 0.25 + 0.35 * Math.sin(tMs * 0.002)
      t.blend(x + 8, y - 5, 3, 1, [230, 232, 255], a)
      t.blend(x + 9, y - 4, 1, 1, [230, 232, 255], a)
      t.blend(x + 8, y - 3, 3, 1, [230, 232, 255], a)
    }
    return
  }

  if (pose === "curl") {
    // cinnamon-roll nap: round ball, tail wrapped over the nose
    contactShadow(t, x, gy, 12, 0.25)
    t.fill(x + 1, gy - 5 + breathe, 10, 5 - breathe, CAT_BODY)
    t.fill(x + 2, gy - 6 + breathe, 8, 1, CAT_BODY)
    t.fill(x + 3, gy - 4 + breathe, 1, 1, CAT_STRIPE)
    t.fill(x + 6, gy - 5 + breathe, 1, 1, CAT_STRIPE)
    t.fill(x + 8, gy - 3 + breathe, 1, 1, CAT_STRIPE)
    // ear poking out
    t.fill(x + 2, gy - 7 + breathe, 1, 2, CAT_STRIPE)
    // wrapped tail
    t.fill(x + 4, gy - 2, 7, 1, CAT_STRIPE)
    t.fill(x + 10, gy - 3, 1, 2, CAT_STRIPE)
    if (tMs % 4200 > 1800) {
      const a = 0.25 + 0.35 * Math.sin(tMs * 0.002)
      t.blend(x + 6, gy - 11, 3, 1, [230, 232, 255], a)
      t.blend(x + 7, gy - 10, 1, 1, [230, 232, 255], a)
      t.blend(x + 6, gy - 9, 3, 1, [230, 232, 255], a)
    }
    return
  }

  if (pose === "walk") {
    // loaf on the move — little leg scuttle, tail up
    const step = Math.floor(tMs / 160) % 2 === 0 ? 1 : 0
    contactShadow(t, x, gy, 13, 0.22)
    t.fill(x, gy - 5, 11, 4, CAT_BODY)
    t.fill(x + 1, gy - 6, 9, 1, CAT_BODY)
    t.fill(x + 3, gy - 5, 1, 1, CAT_STRIPE)
    t.fill(x + 7, gy - 5, 1, 1, CAT_STRIPE)
    // legs
    t.fill(x + 2, gy - 1, 1, 1, CAT_BODY)
    t.fill(x + 5, gy - 1 - step, 1, 1 + step, CAT_BODY)
    t.fill(x + 8, gy - 1, 1, 1, CAT_BODY)
    // head forward + ears
    const hx = facing > 0 ? x + 10 : x - 2
    t.fill(hx, gy - 7, 3, 3, CAT_BODY)
    t.fill(hx + (facing > 0 ? 0 : 1), gy - 8, 1, 1, CAT_STRIPE)
    // tail up behind
    const tx = facing > 0 ? x - 1 : x + 11
    t.fill(tx, gy - 8, 1, 4, CAT_STRIPE)
    return
  }

  if (pose === "eat") {
    // head down in the bowl, tail high and happy
    contactShadow(t, x, gy, 13, 0.22)
    t.fill(x, gy - 5, 11, 5, CAT_BODY)
    t.fill(x + 1, gy - 6, 9, 1, CAT_BODY)
    t.fill(x + 3, gy - 5, 1, 1, CAT_STRIPE)
    t.fill(x + 7, gy - 4, 1, 1, CAT_STRIPE)
    // head bobs rhythmically into the bowl
    const dip = Math.floor(tMs / 300) % 2
    const hx = facing > 0 ? x + 10 : x - 2
    t.fill(hx, gy - 3 + dip, 3, 3, CAT_BODY)
    t.fill(hx + (facing > 0 ? 0 : 2), gy - 4 + dip, 1, 1, CAT_STRIPE) // ear
    // tail hoisted, tip swaying
    const txx = facing > 0 ? x - 1 : x + 11
    const sway = Math.round(Math.sin(tMs * 0.004) * 1)
    t.fill(txx + sway, gy - 9, 1, 6, CAT_STRIPE)
    return
  }

  // sit / sill / desk — upright supervisor pose
  const y = gy - 9
  if (pose !== "sill") contactShadow(t, x, gy, 10, 0.25)
  // haunches + chest
  t.fill(x, gy - 4, 7, 4, CAT_BODY)
  t.fill(x + 1, gy - 7, 5, 4, CAT_BODY)
  // front paws
  t.fill(x + 2, gy - 1, 1, 1, scale(CAT_BODY, 1.12) as RGB)
  t.fill(x + 4, gy - 1, 1, 1, scale(CAT_BODY, 1.12) as RGB)
  // head — sill cats face the window (back of head to us)
  const hy = y - 3 + (perk ? -1 : 0)
  t.fill(x + 1, hy, 5, 4, CAT_BODY)
  // ears — perked when tracking a bird
  t.fill(x + 1, hy - 1 + (perk ? 0 : 1), 1, 2, CAT_STRIPE)
  t.fill(x + 5, hy - 1 + (perk ? 0 : 1), 1, 2, CAT_STRIPE)
  if (pose === "sill") {
    // back-of-head stripes + tail dangling over the sill edge
    t.fill(x + 2, hy + 1, 1, 1, CAT_STRIPE)
    t.fill(x + 4, hy + 1, 1, 1, CAT_STRIPE)
    const sway = Math.round(Math.sin(tMs * 0.0013) * 1)
    t.fill(x + 7 + sway, gy - 3, 1, 5, CAT_STRIPE)
    t.fill(x + 7 + sway, gy + 2 + (flick ? 1 : 0), 1, 1, CAT_STRIPE)
  } else {
    // face toward the room — eyes slow-blink occasionally
    const blink = tMs % 4600 < 200
    const ex = facing > 0 ? x + 4 : x + 2
    t.fill(ex, hy + 2, 1, blink ? 1 : 2, CAT_DARK)
    // tail curled around the side
    t.fill(x + 7, gy - 2, 3, 1, CAT_STRIPE)
    t.fill(x + 9, gy - 3 + (flick ? -1 : 0), 1, 2, CAT_STRIPE)
  }
}

function drawPlant(t: PixelTarget, g: RoomGeo, tMs: number, wind: number, boost = 0) {
  const x = 3
  const floor = g.floorY
  contactShadow(t, x - 1, floor, 15, 0.3)
  // pot in the corner left of the bed
  bevel(t, x, floor - 10, 12, 10, [156, 90, 58])
  t.fill(x - 1, floor - 12, 14, 3, scale([156, 90, 58], 1.18) as RGB)
  // leaves — they shiver a little when the wind rattles the window
  const wob = Math.round(Math.sin(tMs * (0.0012 + wind * 0.002)) * wind * 1.4)
  const perkUp = 1 + boost * 0.25 // freshly watered: visibly happier greens
  const g1: RGB = scale([92, 182, 98], perkUp)
  const g2: RGB = scale([122, 206, 116], perkUp)
  t.fill(x + 2, floor - 18, 3, 6, g1)
  t.fill(x + 5 + wob, floor - 22, 3, 10, g2)
  t.fill(x + 8, floor - 18, 2, 6, g1)
  t.fill(x, floor - 16, 2, 4, g2)
  t.fill(x + 6 + wob, floor - 20, 1, 1, scale(g2, 1.2) as RGB)
  // post-watering sparkle
  if (boost > 0.25) {
    const tw = Math.pow(Math.sin(tMs * 0.004), 2)
    t.add(x + 5 + wob, floor - 23, 1, 1, [220, 255, 220], boost * 0.5 * tw)
    t.add(x + 3, floor - 17, 1, 1, [220, 255, 220], boost * 0.4 * (1 - tw))
  }
}

/**
 * RIM LIGHTS — window-side edge light catching furniture & the resident.
 * The hand-lit pixel art trick: amber at dawn/dusk, pale blue in moonlight.
 */
function drawRimLights(t: PixelTarget, g: RoomGeo, s: SceneState, wl: WindowLight) {
  const k = wl.side * (1 - s.mood.ambient * 0.8)
  if (!wl.active || k < 0.14) return
  const c = wl.color
  const a = Math.min(0.6, k * 0.75)
  const floor = g.floorY
  const bedTop = floor - 20
  const dresserTop = floor - 26
  const deskSurf = floor - 24

  // bed: headboard left edge + top, quilt top edge, pillow edge
  t.add(g.bedX - 2, bedTop - 18, 1, 36, c, a)
  t.add(g.bedX - 2, bedTop - 18, 6, 1, c, a * 0.8)
  t.add(g.bedX + 22, bedTop - 2, 44, 1, c, a * 0.5)
  t.add(g.bedX + 8, bedTop - 2, 1, 8, c, a * 0.4)
  // dresser + microwave tops
  t.add(g.dresserX, dresserTop, 1, 24, c, a * 0.7)
  t.add(g.dresserX + 4, dresserTop - 13, 1, 13, c, a * 0.7)
  t.add(g.dresserX + 4, dresserTop - 13, 20, 1, c, a * 0.45)
  // plant leaf tips
  t.add(3 + 5, floor - 22, 1, 2, c, a * 0.8)
  t.add(3 + 2, floor - 18, 1, 2, c, a * 0.7)
  // shelf + poster edges nearest the window
  t.add(g.shelfX, g.shelfY, 1, 4, c, a * 0.5)
  t.add(g.posterX - 2, g.posterY - 2, 1, 42, c, a * 0.5)
  // desk left edge + monitor top-left
  t.add(g.deskX, deskSurf, 1, 4, c, a * 0.6)
  t.add(g.deskX + g.deskW - 30, deskSurf - 26, 1, 20, c, a * 0.5)
  t.add(g.deskX + g.deskW - 30, deskSurf - 26, 10, 1, c, a * 0.4)
  // lamp rim when it's not the light source itself
  if (!s.lampOn) t.add(g.lampX - 7, floor - 48, 2, 10, c, a * 0.5)

  // the resident catches it too (backlit shoulder / hair edge)
  if (s.sleeping) {
    t.add(g.bedX + 11, bedTop - 1, 8, 1, c, a * 0.4)
  } else if (s.standing) {
    t.add(g.standX, floor - 44, 1, 6, c, a * 0.6)
    t.add(g.standX, floor - 45, 5, 1, c, a * 0.5)
  } else {
    t.add(g.sitX + 1, floor - 42, 1, 6, c, a * 0.6)
    t.add(g.sitX + 1, floor - 43, 4, 1, c, a * 0.5)
    t.add(g.sitX, floor - 32, 1, 8, c, a * 0.5)
  }
}

// ------------------------------- life brain ---------------------------------
//
// Everything here is a PURE function of (date, tMs, layout, weather): the
// room's little lives run on their own schedule whether anyone watches or
// not — open the page a day later and the cat has simply moved on with life.

export type CatPose = "loaf" | "sit" | "curl" | "sill" | "desk" | "walk" | "eat"

export type CatFrame = {
  x: number
  /** feet baseline (floor / sill / mattress / desk surface the cat rests on) */
  gy: number
  pose: CatPose
  facing: 1 | -1
  /** ears up, tracking a bird outside */
  perk: boolean
  /** v5: content rumbles — eating or being petted */
  purr?: boolean
}

export type SnackFrame = {
  active: boolean
  /** walking to microwave / waiting at it / walking back with the goods */
  phase: "to" | "at" | "back"
  x: number
  facing: 1 | -1
  doorOpen: boolean
  microOn: boolean
  leaning: boolean
  carryMug: boolean
}

/** what the resident hauls around while walking errands */
export type CarryProp = "mug" | "can" | "bag"

/** where the resident's body is and what it's doing — the full journey model */
export type ResidentFrame =
  | { mode: "sleep" }
  | { mode: "getup"; stage: 0 | 1 | 2; p: number }
  | { mode: "getin"; stage: 0 | 1 | 2; p: number }
  | { mode: "stand"; justWoke: boolean; yawning: boolean; x: number }
  | { mode: "walk"; x: number; facing: 1 | -1; carry?: CarryProp }
  | { mode: "chore"; kind: "pour" | "water" | "pet"; x: number; p: number; facing: 1 | -1 }
  | { mode: "sit" }

export type LifeState = {
  cat: CatFrame
  snack: SnackFrame
  resident: ResidentFrame
  /** bird flyby progress 0..1, or null */
  bird: number | null
  /** resident checking their phone right now */
  phone: boolean
  /** v5: desk work session running — typing arms + scrolling code on the monitor */
  working: boolean
  /** v5: twin-bell alarm is ringing (wake + 0..1.1s) */
  alarmRing: boolean
  /** v5: actual lamp output 0..1 — dusk fade-in, click-off while climbing into bed */
  lampLevel: number
  /** v5: monitor power envelope 0..1 (CRT warm-up / collapse) */
  screenPower: number
  /** v5: bright CRT line mid-collapse (negative) / mid-warm-up (positive), else null */
  crtLine: number | null
  /** v5: curtains 0 = closed for the night, 1 = fully open */
  curtainP: number
  /** v5: plants freshly watered — sparkle + brighter greens for a while */
  plantBoost: number
  /** v5: faint rainbow outside (alpha 0..1) in the slot after rain/storm */
  rainbowA: number
  /** v5: summer-evening fireflies outside the window (0..1 presence) */
  fireflyA: number
}

/** small birds cross the sky on decent-weather days — ~5s flyby every ~47s */
function birdPAt(tMs: number, s: SceneState, w: WeatherState): number | null {
  if (s.hour < 7.4 || s.hour > 17.6) return null
  if (w.kind === "rain" || w.kind === "snow" || w.kind === "storm" || w.kind === "fog") return null
  if (w.kind === "cloud" && w.intensity > 0.6) return null
  const cyc = tMs % 47000
  return cyc < 5200 ? cyc / 5200 : null
}

// --- cat adventures ----------------------------------------------------------

type CatSpot = { x: number; gy: number; pose: CatPose; w: number }

function catSpots(
  g: RoomGeo,
  s: SceneState,
  wl: WindowLight,
  bf: BeamField,
  w: WeatherState
): CatSpot[] {
  const spots: CatSpot[] = [{ x: g.catX, gy: g.catY + 7, pose: "loaf", w: 1 }]
  // THE favorite: curl up inside the traveling sunbeam pool
  if (wl.day && bf.active && wl.peak > 0.045) {
    const poolX = bf.x0 + Math.round((bf.y1 - bf.y0) * bf.slope + bf.w / 2)
    spots.push({ x: Math.max(7, Math.min(g.w - 22, poolX - 7)), gy: bf.y1 - 2, pose: "curl", w: 1.7 })
  }
  // windowsill bird-watching on decent daylight
  if (s.hour >= 7.5 && s.hour <= 18.2 && (w.kind === "clear" || (w.kind === "cloud" && w.intensity <= 0.6))) {
    spots.push({ x: g.winX + 10, gy: g.winY + g.winH + 1, pose: "sill", w: 1.25 })
  }
  // bed foot — extra likely once the resident is asleep
  spots.push({ x: g.bedX + 64, gy: g.floorY - 19, pose: "curl", w: s.sleeping ? 2.1 : 0.6 })
  // desk supervisor during the evening gaming session
  if (!s.sleeping && !s.standing && s.lampOn) {
    spots.push({ x: g.deskX + 3, gy: g.floorY - 23, pose: "desk", w: 1.1 })
  }
  return spots
}

function pickCatSpot(spots: CatSpot[], bucket: number, daySeed: number): CatSpot {
  const total = spots.reduce((a, s) => a + s.w, 0)
  let roll = hash(bucket * 7.313 + daySeed * 3.71) * total
  for (const s of spots) {
    roll -= s.w
    if (roll <= 0) return s
  }
  return spots[0]
}

function catPlan(
  g: RoomGeo,
  s: SceneState,
  wl: WindowLight,
  bf: BeamField,
  w: WeatherState,
  daySeed: number,
  tMs: number,
  bird: number | null
): CatFrame {
  const BUCKET = 230000 // ~3.8 min per hangout
  const bucket = Math.floor(tMs / BUCKET)
  const rel = tMs % BUCKET
  const spots = catSpots(g, s, wl, bf, w)
  const cur = pickCatSpot(spots, bucket, daySeed)
  const prev = pickCatSpot(spots, bucket - 1, daySeed)

  // hop between spots during the first 1.3s of a new bucket
  if ((cur.x !== prev.x || cur.gy !== prev.gy) && rel < 1300) {
    const p = rel / 1300
    const hop = Math.round(Math.sin(Math.PI * p) * 3)
    return {
      x: Math.round(prev.x + (cur.x - prev.x) * p),
      gy: Math.round(prev.gy + (cur.gy - prev.gy) * p) - hop,
      pose: "walk",
      facing: cur.x >= prev.x ? 1 : -1,
      perk: false,
    }
  }
  return {
    x: cur.x,
    gy: cur.gy,
    pose: cur.pose,
    facing: cur.pose === "sill" ? -1 : 1,
    perk: cur.pose === "sill" && bird !== null,
  }
}

// --- microwave snack runs ----------------------------------------------------

function snackPlan(g: RoomGeo, s: SceneState, daySeed: number): SnackFrame {
  const off: SnackFrame = { active: false, phase: "to", x: g.sitX, facing: -1, doorOpen: false, microOn: false, leaning: false, carryMug: false }
  // snack o'clock: one run per evening (deterministic start), weekend bonus round
  const eveningStart = 20 * 3600 + Math.floor(daySeed * 95) * 60
  const weekendStart = 15 * 3600 + Math.floor(hash(daySeed * 13.7) * 55) * 60
  const daySec = s.hour * 3600
  const startSec = daySec >= eveningStart ? eveningStart : s.weekend ? weekendStart : eveningStart

  const seatX = g.sitX + 4
  const microX = g.dresserX + 20
  const walkMs = Math.max(2500, Math.round(((seatX - microX) / 14) * 1000))
  const AT_MS = 900 + 6200 // door open + it spins
  const totalMs = walkMs * 2 + AT_MS
  const relMs = (daySec - startSec) * 1000

  if (relMs < 0 || relMs > totalMs || s.sleeping || s.standing) return off

  if (relMs < walkMs) {
    const p = relMs / walkMs
    return { ...off, active: true, phase: "to", x: Math.round(seatX + (microX - seatX) * p), facing: -1, carryMug: true }
  }
  if (relMs < walkMs + AT_MS) {
    const at = relMs - walkMs
    return {
      ...off, active: true, phase: "at", x: microX, facing: -1,
      doorOpen: at < 900 || at > AT_MS - 400,
      microOn: at >= 900 && at <= AT_MS - 400,
      leaning: at < 1100 || at > AT_MS - 900,
      carryMug: at > AT_MS - 900,
    }
  }
  const p = (relMs - walkMs - AT_MS) / walkMs
  return { ...off, active: true, phase: "back", x: Math.round(microX + (seatX - microX) * p), facing: 1, carryMug: true }
}

// --- resident journeys: wake -> get up -> shuffle -> desk -> ... -> bed ------

const WALK_SPEED = 14 // px per second, matches the snack run

/** v5: the day's little errands, all deterministic from the date */
export type Chores = {
  /** cat-feeding runs: walk from the desk, pour, walk back */
  feeds: { start: number; outT: number; standX: number }[]
  /** weekend plant watering route, else null */
  water: { start: number; leg1: number; leg2: number; leg3: number; spot1: number; spot2: number } | null
  /** weekday desk-work sessions [startSec, endSec] */
  work: [number, number][]
  /** pet interlude chances for the morning / evening commute */
  petMorning: boolean
  petEvening: boolean
}

const wrapDay = (v: number) => ((v % 86400) + 86400) % 86400

function choresAt(g: RoomGeo, s: SceneState, prefs: AfkPrefs, daySeed: number): Chores {
  const wake = s.weekend ? 9 : 6.5
  const bowlX = g.dresserX + 30
  const standX = bowlX + 8
  const outT = Math.abs(g.sitX - standX) / WALK_SPEED
  const jf = Math.floor(hash(daySeed * 7.31 + 0.11) * 600)
  const jf2 = Math.floor(hash(daySeed * 7.31 + 0.22) * 900)
  const feeds = [
    { start: (s.weekend ? 9.6 * 3600 + Math.floor(hash(daySeed * 7.31 + 0.15) * 300) : 8 * 3600 + jf), outT, standX },
    { start: 18.5 * 3600 + jf2, outT, standX },
  ]

  const water = s.weekend
    ? {
        start: 10.25 * 3600 + Math.floor(hash(daySeed * 9.17 + 0.33) * 900),
        leg1: Math.abs(g.sitX - 17) / WALK_SPEED,
        leg2: Math.abs(g.winX + 34 - 17) / WALK_SPEED,
        leg3: Math.abs(g.sitX - (g.winX + 34)) / WALK_SPEED,
        spot1: 17,
        spot2: g.winX + 34,
      }
    : null

  const work: [number, number][] = s.weekend
    ? []
    : [
        [(wake + 3.5) * 3600 + Math.floor(hash(daySeed * 5.13 + 0.44) * 1500), 0],
        [(14 + 11 / 60) * 3600 + Math.floor(hash(daySeed * 5.13 + 0.55) * 1500), 0],
      ]
  work[0] = [work[0]?.[0] ?? 0, (work[0]?.[0] ?? 0) + 5400]
  work[1] = [work[1]?.[0] ?? 0, (work[1]?.[0] ?? 0) + 6300]

  return {
    feeds,
    water,
    work: s.weekend ? [] : work,
    petMorning: hash(daySeed * 17.31 + 3.1) < 0.35,
    petEvening: hash(daySeed * 17.31 + 4.2) < 0.35,
  }
}

/** is the cat lounging on the foreground rug plane where a walker can stop & pet it? */
function pettableCat(cat: CatFrame, floorY: number): boolean {
  return (cat.pose === "loaf" || cat.pose === "curl") && cat.gy > floorY + 8
}

function residentPlan(g: RoomGeo, s: SceneState, prefs: AfkPrefs, cat: CatFrame, chores: Chores): ResidentFrame {
  const wake = s.weekend ? 9 : 6.5
  const bedH = prefs.bedtime >= 24 ? prefs.bedtime - 24 : prefs.bedtime
  const wakeSec = wake * 3600
  const daySec = s.hour * 3600
  const sitX = g.sitX
  const riseX = g.bedX + 30 // bed-side spot where they wake up & climb in

  if (s.sleeping) {
    // climbing into bed right at bedtime: flap -> sit -> lie down (+ settle)
    const relIn = wrapDay(daySec - bedH * 3600)
    if (relIn < 1.4) return { mode: "getin", stage: 0, p: relIn / 1.4 }
    if (relIn < 2.8) return { mode: "getin", stage: 1, p: (relIn - 1.4) / 1.4 }
    if (relIn < 4.6) return { mode: "getin", stage: 2, p: (relIn - 2.8) / 1.8 }
    return { mode: "sleep" }
  }

  const justWoke = daySec >= wakeSec && daySec < wakeSec + 900
  if (justWoke) {
    const rel = daySec - wakeSec
    // get out of bed: sit up -> legs over the edge -> rise
    if (rel < 1.8) return { mode: "getup", stage: 0, p: rel / 1.8 }
    if (rel < 3.0) return { mode: "getup", stage: 1, p: (rel - 1.8) / 1.2 }
    if (rel < 4.0) return { mode: "getup", stage: 2, p: (rel - 3.0) / 1.0 }
    // zombie moment at the bedside — shorter on mornings with a cat to pet —
    // then shuffle to the desk (arrival time is the same either way)
    const petNow = chores.petMorning && pettableCat(cat, g.floorY) && cat.x > riseX + 4 && cat.x < sitX - 4
    const standS = petNow ? 18 : 24
    if (rel < standS) return { mode: "stand", justWoke: true, yawning: false, x: riseX }
    const leg1 = petNow ? (cat.x - riseX) / WALK_SPEED : 0
    if (petNow && rel < standS + leg1) {
      const p = (rel - standS) / leg1
      return { mode: "walk", x: Math.round(riseX + (cat.x - riseX) * p), facing: 1 }
    }
    if (petNow && rel < standS + leg1 + 3) {
      return { mode: "chore", kind: "pet", x: cat.x, p: (rel - standS - leg1) / 3, facing: 1 }
    }
    const out = Math.abs(sitX - riseX) / WALK_SPEED
    if (rel < standS + (petNow ? 3 : 0) + out) {
      const walked = petNow ? sitX - (sitX - cat.x) : riseX
      const p = (rel - standS - (petNow ? 3 : 0) - leg1) / ((sitX - walked) / WALK_SPEED)
      return { mode: "walk", x: Math.round(walked + (sitX - walked) * p), facing: 1 }
    }
    return { mode: "sit" }
  }

  // winding down: rise from the chair, maybe pet the cat en route, yawn at the bedside
  const preStart = wrapDay(bedH * 3600 - 1080)
  const preRel = wrapDay(daySec - preStart)
  if (preRel >= 0 && preRel < 1080 && !justWoke) {
    const dist = Math.abs(riseX - sitX)
    const back = dist / WALK_SPEED
    if (preRel < 0.9) return { mode: "stand", justWoke: false, yawning: false, x: sitX }
    const petNow = chores.petEvening && pettableCat(cat, g.floorY) && cat.x > riseX + 4 && cat.x < sitX - 4
    const leg1 = petNow ? (sitX - cat.x) / WALK_SPEED : 0
    if (petNow && preRel < 0.9 + leg1) {
      const p = (preRel - 0.9) / leg1
      return { mode: "walk", x: Math.round(sitX - (sitX - cat.x) * p), facing: -1 }
    }
    if (petNow && preRel < 0.9 + leg1 + 3) {
      return { mode: "chore", kind: "pet", x: cat.x, p: (preRel - 0.9 - leg1) / 3, facing: -1 }
    }
    const rest = petNow ? (cat.x - riseX) / WALK_SPEED : back
    if (preRel < 0.9 + (petNow ? 3 : 0) + back) {
      const from = petNow ? cat.x : sitX
      const p = (preRel - 0.9 - (petNow ? 3 : 0) - leg1) / rest
      return { mode: "walk", x: Math.round(from - (from - riseX) * p), facing: -1 }
    }
    return { mode: "stand", justWoke: false, yawning: true, x: riseX }
  }

  // --- errands: cat feeding (twice a day) ---------------------------------
  for (const f of chores.feeds) {
    const rel = daySec - f.start
    if (rel < 0 || rel > f.outT * 2 + 3.2) continue
    if (rel < f.outT) {
      const p = rel / f.outT
      return { mode: "walk", x: Math.round(sitX + (f.standX - sitX) * p), facing: f.standX >= sitX ? 1 : -1, carry: "bag" }
    }
    if (rel < f.outT + 3.2) {
      return { mode: "chore", kind: "pour", x: f.standX, p: (rel - f.outT) / 3.2, facing: -1 }
    }
    const p = (rel - f.outT - 3.2) / f.outT
    return { mode: "walk", x: Math.round(f.standX + (sitX - f.standX) * p), facing: sitX >= f.standX ? 1 : -1 }
  }

  // --- errands: weekend plant watering ------------------------------------
  if (chores.water) {
    const w = chores.water
    const rel = daySec - w.start
    const total = w.leg1 + 1.8 + w.leg2 + 1.8 + w.leg3
    if (rel >= 0 && rel <= total) {
      if (rel < w.leg1) {
        const p = rel / w.leg1
        return { mode: "walk", x: Math.round(sitX + (w.spot1 - sitX) * p), facing: w.spot1 >= sitX ? 1 : -1, carry: "can" }
      }
      if (rel < w.leg1 + 1.8) return { mode: "chore", kind: "water", x: w.spot1, p: (rel - w.leg1) / 1.8, facing: -1 }
      if (rel < w.leg1 + 1.8 + w.leg2) {
        const p = (rel - w.leg1 - 1.8) / w.leg2
        return { mode: "walk", x: Math.round(w.spot1 + (w.spot2 - w.spot1) * p), facing: w.spot2 >= w.spot1 ? 1 : -1, carry: "can" }
      }
      if (rel < w.leg1 + 3.6 + w.leg2) return { mode: "chore", kind: "water", x: w.spot2, p: (rel - w.leg1 - 1.8 - w.leg2) / 1.8, facing: -1 }
      const p = (rel - w.leg1 - 3.6 - w.leg2) / w.leg3
      return { mode: "walk", x: Math.round(w.spot2 + (sitX - w.spot2) * p), facing: sitX >= w.spot2 ? 1 : -1, carry: "can" }
    }
  }

  return { mode: "sit" }
}

// --- v5: power moments -------------------------------------------------------

/** how much the lamp actually glows: dusk fade-in, click-off mid-climb-in */
function lampLevelAt(s: SceneState, prefs: AfkPrefs): number {
  const env = clamp01((s.mood.ambient - 0.14) / 0.06)
  let gate = 1
  if (s.sleeping) {
    const bedH = prefs.bedtime >= 24 ? prefs.bedtime - 24 : prefs.bedtime
    const relIn = wrapDay(s.hour * 3600 - bedH * 3600)
    // click as the quilt slides: on through flap & perch, fade out, off all night
    gate = relIn < 2.8 ? 1 : relIn < 3.4 ? 1 - (relIn - 2.8) / 0.6 : 0
  }
  return clamp01(env * gate)
}

/** monitor power envelope + CRT line animation cue */
function screenPowerAt(
  s: SceneState,
  prefs: AfkPrefs
): { power: number; crtLine: number | null } {
  const bedH = prefs.bedtime >= 24 ? prefs.bedtime - 24 : prefs.bedtime
  if (s.sleeping) {
    const relIn = wrapDay(s.hour * 3600 - bedH * 3600)
    if (relIn < 2.8) return { power: 1, crtLine: null }
    if (relIn < 3.3) return { power: 0, crtLine: -((relIn - 2.8) / 0.5) } // collapse
    return { power: 0, crtLine: null }
  }
  const wake = s.weekend ? 9 : 6.5
  const rel = s.hour * 3600 - wake * 3600
  if (s.phase === "wake" && rel >= 0 && rel < 0.5) return { power: rel / 0.5, crtLine: rel / 0.5 } // warm-up
  return { power: 1, crtLine: null }
}

/** curtains: closed overnight, slide open as the morning walk passes the
 *  window, slide shut as the wind-down walk passes it again */
function curtainPAt(g: RoomGeo, s: SceneState, prefs: AfkPrefs, chores: Chores, cat: CatFrame): number {
  const wake = s.weekend ? 9 : 6.5
  const wakeSec = wake * 3600
  const daySec = s.hour * 3600
  const bedH = prefs.bedtime >= 24 ? prefs.bedtime - 24 : prefs.bedtime
  const riseX = g.bedX + 30
  const sitX = g.sitX

  // same pet-stop timing as residentPlan so the curtains match the walk
  const petM = chores.petMorning && pettableCat(cat, g.floorY) && cat.x > riseX + 4 && cat.x < sitX - 4
  const petE = chores.petEvening && pettableCat(cat, g.floorY) && cat.x > riseX + 4 && cat.x < sitX - 4
  const standS = petM ? 18 : 24
  const tOpen = wakeSec + standS + Math.max(0, (g.winX + g.winW - 6 - riseX) / WALK_SPEED)
  const preStart = wrapDay(bedH * 3600 - 1080)
  const tClose =
    preStart + 0.9 + (petE ? 3 : 0) + Math.max(0, (sitX - (g.winX + g.winW + 2)) / WALK_SPEED)

  if (s.sleeping) return 0
  // opening glide right as the morning walk passes the window
  if (daySec >= tOpen && daySec < tOpen + 1.6) return clamp01((daySec - tOpen) / 1.6)
  // open all day between the two walk-by triggers (handles wrapped bedtimes)
  const inDay = tClose > tOpen ? daySec >= tOpen && daySec < tClose : daySec >= tOpen || daySec < tClose
  if (!inDay) return 0
  // closing glide as the wind-down walk passes — fully shut exactly at tClose
  const relClose = tClose - daySec
  if (relClose <= 1.6 && relClose > 0) return clamp01(relClose / 1.6)
  return 1
}

/** plants sparkle & glow for ~an hour after the weekend watering */
function plantBoostAt(s: SceneState, g: RoomGeo, chores: Chores): number {
  if (!chores.water) return 0
  const firstWatered = chores.water.start + chores.water.leg1 + 0.4
  const rel = s.hour * 3600 - firstWatered
  if (rel < 0 || rel > 3600) return 0
  return clamp01(1 - rel / 3600)
}

/** faint rainbow in the slot right after rain/storm gives way to fair sky */
export function rainbowAt(now: Date, weather: WeatherState, ambient: number): number {
  const fair =
    weather.kind === "clear" || (weather.kind === "cloud" && weather.intensity < 0.5)
  if (!fair) return 0
  const h = now.getHours() + now.getMinutes() / 60
  if (h < 7.5 || h > 18) return 0
  const prev = weatherAt(new Date(now.getTime() - 75 * 60000))
  if (prev.kind !== "rain" && prev.kind !== "storm") return 0
  const slotPos = ((now.getHours() * 60 + now.getMinutes()) % 75) / 75
  const fade = 1 - slotPos * 0.8 // dissolves across the slot
  return clamp01(0.85 * fade * clamp01((0.35 - ambient) * 3))
}

// --- everything at once -------------------------------------------------------

export function lifeState(
  g: RoomGeo,
  s: SceneState,
  wl: WindowLight,
  bf: BeamField,
  w: WeatherState,
  now: Date,
  tMs: number,
  prefs: AfkPrefs = DEFAULT_PREFS
): LifeState {
  const daySeed = daySeedOf(now)
  const bird = birdPAt(tMs, s, w)
  const chores = choresAt(g, s, prefs, daySeed)
  const daySec = s.hour * 3600

  // cat first, then the resident (pet stops need to know where the cat is)
  let cat = catPlan(g, s, wl, bf, w, daySeed, tMs, bird)
  // supper time overrides everything — trot to the bowl and chow down
  for (const f of chores.feeds) {
    const eatStart = f.start + f.outT + 0.6
    const rel = daySec - eatStart
    if (rel >= 0 && rel < 100) {
      const bowlX = g.dresserX + 30
      if (rel < 1.3) {
        const p = rel / 1.3
        const hop = Math.round(Math.sin(Math.PI * p) * 3)
        cat = {
          x: Math.round(cat.x + (bowlX - 6 - cat.x) * p),
          gy: Math.round(cat.gy + (g.floorY - cat.gy) * p) - hop,
          pose: "walk",
          facing: bowlX - 6 >= cat.x ? 1 : -1,
          perk: false,
        }
      } else {
        cat = { x: bowlX - 6, gy: g.floorY, pose: "eat", facing: 1, perk: false, purr: true }
      }
    }
  }

  const resident = residentPlan(g, s, prefs, cat, chores)
  if (resident.mode === "chore" && resident.kind === "pet") cat = { ...cat, purr: true }

  const snack = snackPlan(g, s, daySeed)
  const phone =
    !s.sleeping && !s.standing && !snack.active && s.mood.ambient > 0.14 && tMs % 300000 < 3400

  const working =
    !s.weekend && s.phase === "day" && chores.work.some(([a, b]) => daySec >= a && daySec < b)
  const wake = s.weekend ? 9 : 6.5
  const alarmRing = s.phase === "wake" && daySec - wake * 3600 >= 0 && daySec - wake * 3600 < 1.1
  const lampLevel = lampLevelAt(s, prefs)
  const { power: screenPower, crtLine } = screenPowerAt(s, prefs)
  const curtainP = curtainPAt(g, s, prefs, chores, cat)
  const plantBoost = plantBoostAt(s, g, chores)
  const rainbowA = rainbowAt(now, w, s.mood.ambient)
  const month = now.getMonth()
  const fireflyA =
    month >= 5 && month <= 8 && s.hour >= 20.5 && s.hour <= 23 &&
    (w.kind === "clear" || (w.kind === "cloud" && w.intensity < 0.5))
      ? clamp01((s.mood.ambient - 0.14) / 0.12)
      : 0

  return {
    cat, snack, resident, bird, phone,
    working, alarmRing, lampLevel, screenPower, crtLine, curtainP, plantBoost, rainbowA, fireflyA,
  }
}

/** one-call convenience for clients: the full life frame for a given moment */
export function lifeStateAt(
  now: Date,
  prefs: AfkPrefs = DEFAULT_PREFS,
  tMs: number = Date.now(),
  size: RoomSize = { w: BASE_W, h: 160 },
  weather: WeatherState = CLEAR_WEATHER
): LifeState {
  const g = layoutOf(size.w, size.h)
  const s = sceneStateAt(now, prefs)
  const wl = dimWindowLightForWeather(windowLightOf(s), weather)
  const bf = beamField(g, wl)
  return lifeState(g, s, wl, bf, weather, now, tMs, prefs)
}

/** where the camera should look: the resident (or the microwave run in progress) */
export function focusXAt(life: LifeState, g: RoomGeo): number {
  if (life.snack.active) return life.snack.x + 5
  const r = life.resident
  switch (r.mode) {
    case "sleep":
    case "getup":
    case "getin":
      return g.bedX + 45
    case "stand":
    case "walk":
    case "chore":
      return r.x + 5
    case "sit":
      return g.sitX + 5
  }
}

// ------------------------------ status ticker ------------------------------
//
// The top-left "what's up" line: an ACTIVE little moment wins, otherwise the
// next scheduled thing within 75 minutes, otherwise null (client shows the
// weather instead). Pure & deterministic, like everything else here.

export type AfkEvent = {
  emoji: string
  /** short shouty label, e.g. "FEEDING THE CAT", "LIGHTS OUT" */
  label: string
  /** "now" = happening right now, "in" = coming up within the horizon */
  kind: "now" | "in"
  /** whole minutes until it starts (kind "in" only) */
  mins?: number
}

const HORIZON_SEC = 75 * 60 // one full sky-slot of foresight

export function nextEventAt(now: Date, prefs: AfkPrefs = DEFAULT_PREFS): AfkEvent | null {
  const s = sceneStateAt(now, prefs)
  const g = layoutOf(BASE_W, 160)
  const daySeed = daySeedOf(now)
  const chores = choresAt(g, s, prefs, daySeed)
  const daySec = s.hour * 3600
  const wake = s.weekend ? 9 : 6.5
  const bedH = prefs.bedtime >= 24 ? prefs.bedtime - 24 : prefs.bedtime

  // ---- active little moments (priority order) ----
  for (const f of chores.feeds) {
    const eatEnd = f.start + f.outT + 0.6 + 100
    if (daySec >= f.start && daySec < eatEnd)
      return { emoji: "🐈", label: "FEEDING THE CAT", kind: "now" }
  }
  {
    // microwave snack run window (mirrors snackPlan's timing)
    const eveningStart = 20 * 3600 + Math.floor(daySeed * 95) * 60
    const weekendStart = 15 * 3600 + Math.floor(hash(daySeed * 13.7) * 55) * 60
    const startSec = daySec >= eveningStart ? eveningStart : s.weekend ? weekendStart : eveningStart
    const seatX = g.sitX + 4
    const microX = g.dresserX + 20
    const walkMs = Math.max(2500, Math.round(((seatX - microX) / 14) * 1000))
    const totalSec = (walkMs * 2 + 900 + 6200) / 1000
    if (daySec >= startSec && daySec < startSec + totalSec && !s.sleeping && !s.standing)
      return { emoji: "🍿", label: "SNACK RUN", kind: "now" }
  }
  if (chores.water) {
    const w = chores.water
    const total = w.leg1 + 1.8 + w.leg2 + 1.8 + w.leg3
    if (daySec >= w.start && daySec < w.start + total)
      return { emoji: "🪴", label: "WATERING PLANTS", kind: "now" }
  }

  // ---- next scheduled thing inside the horizon ----
  // urgent journey beats (lights out / wind-down / wake-up) outrank ambient
  // sky moments; casual errands wait their turn behind the scenery
  const fwd = (t: number) => (t - daySec + 86400) % 86400
  type Cand = { at: number; emoji: string; label: string; h: number }
  const urgent: Cand[] = []
  const casual: Cand[] = []

  if (!s.sleeping) {
    // bedtime beats get a tight 45-min leash so they don't hog the evening line
    urgent.push({ at: bedH * 3600, h: 45 * 60, emoji: "🛏️", label: "LIGHTS OUT" })
    urgent.push({ at: bedH * 3600 - 1080, h: 45 * 60, emoji: "🌙", label: "WIND-DOWN" })
    for (const f of chores.feeds) casual.push({ at: f.start, h: HORIZON_SEC, emoji: "🐈", label: "CAT FEEDING" })
    for (const [a] of chores.work) casual.push({ at: a, h: HORIZON_SEC, emoji: "💻", label: "DESK WORK" })
    if (chores.water) casual.push({ at: chores.water.start, h: HORIZON_SEC, emoji: "🪴", label: "PLANT WATERING" })
    {
      const eveningStart = 20 * 3600 + Math.floor(daySeed * 95) * 60
      const weekendStart = 15 * 3600 + Math.floor(hash(daySeed * 13.7) * 55) * 60
      const startSec = daySec >= eveningStart ? eveningStart : s.weekend ? weekendStart : eveningStart
      casual.push({ at: startSec, h: HORIZON_SEC, emoji: "🍿", label: "SNACK RUN" })
    }
  } else {
    urgent.push({ at: wake * 3600, h: HORIZON_SEC, emoji: "⏰", label: "WAKE-UP" })
  }

  const soonest = (list: Cand[]) => {
    let best: Cand | null = null
    for (const c of list) {
      const d = fwd(c.at)
      if (d > 0 && d <= c.h && (!best || d < fwd(best.at))) best = c
    }
    return best
  }

  const nextUrgent = soonest(urgent)
  if (nextUrgent)
    return { emoji: nextUrgent.emoji, label: nextUrgent.label, kind: "in", mins: Math.max(1, Math.ceil(fwd(nextUrgent.at) / 60)) }

  // ---- ambient sky moments, when no journey is imminent ----
  if (rainbowAt(now, weatherAt(now), s.mood.ambient) > 0.25)
    return { emoji: "🌈", label: "RAINBOW", kind: "now" }
  {
    const month = now.getMonth()
    if (
      month >= 5 && month <= 8 && s.hour >= 20.5 && s.hour <= 23 &&
      (weatherAt(now).kind === "clear" || (weatherAt(now).kind === "cloud" && weatherAt(now).intensity < 0.5))
    )
      return { emoji: "✨", label: "FIREFLIES", kind: "now" }
  }

  const nextCasual = soonest(casual)
  if (nextCasual)
    return { emoji: nextCasual.emoji, label: nextCasual.label, kind: "in", mins: Math.max(1, Math.ceil(fwd(nextCasual.at) / 60)) }
  return null
}

// ------------------------------ avatar -------------------------------------

function drawHead(t: PixelTarget, av: AvatarSpec, x: number, y: number, blink: boolean, yawning: boolean) {
  const hair = av.hairStyle === "beanie" ? av.hoodie : av.hair
  // face with soft outline
  t.fill(x, y, 8, 8, av.skin)
  t.fill(x, y + 7, 8, 1, scale(av.skin, 0.88)) // chin shade
  // hair
  if (av.hairStyle === "spiky") {
    t.fill(x, y - 1, 8, 3, hair)
    t.fill(x + 1, y - 2, 1, 1, hair)
    t.fill(x + 3, y - 3, 1, 2, hair)
    t.fill(x + 6, y - 2, 1, 1, hair)
  } else if (av.hairStyle === "beanie") {
    t.fill(x, y - 1, 8, 3, hair)
    t.fill(x, y + 2, 8, 1, scale(hair, 0.8))
    t.fill(x + 3, y - 2, 2, 1, scale(hair, 1.2))
  } else if (av.hairStyle === "long") {
    t.fill(x, y - 1, 8, 3, hair)
    t.fill(x, y + 2, 1, 6, hair)
    t.fill(x + 7, y + 2, 1, 6, hair)
  } else {
    t.fill(x, y - 1, 8, 3, hair)
  }
  // eyes (facing right-ish, toward monitor)
  if (!blink && !yawning) {
    t.fill(x + 4, y + 4, 1, 2, [30, 28, 40])
    t.fill(x + 6, y + 4, 1, 2, [30, 28, 40])
  } else if (yawning) {
    t.fill(x + 4, y + 4, 1, 1, [30, 28, 40])
    t.fill(x + 6, y + 4, 1, 1, [30, 28, 40])
    t.fill(x + 5, y + 6, 2, 1, [120, 60, 60])
  } else {
    t.fill(x + 4, y + 5, 1, 1, [30, 28, 40])
    t.fill(x + 6, y + 5, 1, 1, [30, 28, 40])
  }
}

function drawAvatarSitting(t: PixelTarget, g: RoomGeo, s: SceneState, av: AvatarSpec, tMs: number, life: LifeState) {
  const x = g.sitX
  const floor = g.floorY
  const blink = tMs % 3400 < 130
  const typePhase = Math.floor(tMs / 380) % 2 === 0
  // lo-fi head-bob during the dark cozy hours, phone-check overrides typing
  const bob = !life.phone && !life.working && s.mood.ambient > 0.14 ? (Math.floor(tMs / 550) % 2) : 0

  contactShadow(t, x - 5, floor, 22, 0.3)

  // chair (behind avatar)
  bevel(t, x - 3, floor - 34, 3, 26, [96, 66, 138])
  t.fill(x - 3, floor - 34, 9, 3, scale([96, 66, 138], 1.28) as RGB)
  t.fill(x - 2, floor - 8, 2, 6, [60, 50, 70])
  ellipse(t, x, floor - 1, 7, 2, "fill", [46, 40, 54])

  // legs + shoes tucked under the desk
  t.fill(x + 1, floor - 16, 3, 12, scale(av.hoodie, 0.55))
  t.fill(x + 5, floor - 16, 3, 12, scale(av.hoodie, 0.5))
  t.fill(x + 1, floor - 4, 4, 2, [40, 36, 48])
  t.fill(x + 6, floor - 4, 4, 2, [40, 36, 48])
  // knee forward
  t.fill(x + 8, floor - 16, 5, 7, scale(av.hoodie, 0.6))
  t.fill(x + 11, floor - 9, 3, 6, scale(av.hoodie, 0.55))
  t.fill(x + 11, floor - 3, 4, 2, [40, 36, 48])

  // torso (hoodie) — seated height, beveled shoulders
  t.fill(x, floor - 32, 10, 16, av.hoodie)
  t.fill(x, floor - 32, 10, 2, scale(av.hoodie, 1.18))
  t.fill(x, floor - 32, 1, 16, scale(av.hoodie, 1.1))
  t.fill(x + 9, floor - 32, 1, 16, scale(av.hoodie, 0.75))
  // pocket
  t.fill(x + 3, floor - 24, 4, 3, scale(av.hoodie, 0.85))

  // arms reaching right to keyboard — two-frame typing
  if (life.phone) {
    // phone check: arms drop to lap, screen glows on the face
    t.fill(x + 10, floor - 22, 6, 3, av.hoodie)
    t.fill(x + 14, floor - 23, 3, 2, av.skin)
    t.fill(x + 15, floor - 26, 3, 4, [22, 24, 34])
    t.fill(x + 16, floor - 25, 1, 2, [150, 190, 255])
    t.add(x + 4, floor - 40, 6, 5, [140, 175, 255], 0.14)
  } else if (life.working && tMs % 45000 < 1400) {
    // coffee break mid-session: right arm lifts the mug for a sip
    t.fill(x + 10, floor - 28, 6, 3, av.hoodie)
    t.fill(x + 12, floor - 31, 3, 4, av.hoodie)
    t.fill(x + 12, floor - 33, 3, 2, av.skin)
    t.fill(x + 11, floor - 37, 3, 4, [226, 230, 240])
    t.fill(x + 11, floor - 36, 3, 1, [150, 110, 220])
    const sa = 0.3 * Math.sin(tMs * 0.004)
    if (sa > 0.08) t.blend(x + 12, floor - 39, 1, 1, [240, 244, 255], sa)
  } else {
    const armY = floor - 28 + (typePhase ? 0 : 1)
    t.fill(x + 10, armY, 8, 3, av.hoodie)
    t.fill(x + 17, armY + 1, 3, 2, av.skin)
  }

  drawHead(t, av, x + 1, floor - 41 + bob, blink, false)

  // monitor glow catching the face edge, chest and floor at their feet
  const screenFlick = 0.24 + 0.05 * Math.sin(tMs * 0.003 + 1.7)
  if (s.mood.ambient > 0.12 && life.screenPower > 0.5) {
    t.add(x + 8, floor - 39 + bob, 1, 3, [150, 190, 255], screenFlick * 0.5)
    t.add(x + 9, floor - 30, 1, 7, [150, 190, 255], screenFlick * 0.35)
    t.add(x + 2, floor + 1, 12, 2, [140, 170, 240], screenFlick * 0.28)
  }
}

/** snack-run & journey sprite: walking with a little bounce, prop in hand when carrying */
function drawAvatarWalking(
  t: PixelTarget,
  g: RoomGeo,
  av: AvatarSpec,
  tMs: number,
  x: number,
  facing: 1 | -1,
  carry: CarryProp | false
) {
  const floor = g.floorY
  const f = facing
  const step = Math.floor(tMs / 170) % 2 === 0 ? 1 : 0
  const blink = tMs % 3400 < 130
  const bob = step
  const fx = (v: number) => (f > 0 ? x + v : x + 9 - v) // mirror helper

  contactShadow(t, x - 2, floor, 14, 0.3)

  // legs mid-stride
  t.fill(x + 1, floor - 16 + step, 3, 16 - step, scale(av.hoodie, 0.55))
  t.fill(x + 5, floor - 15 - step, 3, 15 - step, scale(av.hoodie, 0.5))
  t.fill(x + (step ? 0 : -1), floor - 2, 4, 2, [40, 36, 48])
  t.fill(x + (step ? 5 : 6), floor - 2, 4, 2, [40, 36, 48])

  // torso
  t.fill(x, floor - 34 + bob, 9, 19, av.hoodie)
  t.fill(x, floor - 34 + bob, 9, 2, scale(av.hoodie, 1.18))
  t.fill(x + 8, floor - 34 + bob, 1, 19, scale(av.hoodie, 0.75))

  // back arm swings
  t.fill(fx(-1), floor - 31 + step, 2, 11, av.hoodie)

  // front arm: bent, carrying the goods when carrying
  t.fill(fx(8), floor - 31 - step, 2, 8, av.hoodie)
  if (carry === "mug") {
    t.fill(fx(8), floor - 24, f > 0 ? 5 : 5, 2, av.hoodie)
    const mugX = f > 0 ? x + 13 : x - 6
    t.fill(mugX, floor - 27, 3, 4, [226, 230, 240])
    t.fill(mugX + (f > 0 ? 3 : -1), floor - 26, 1, 2, [200, 206, 220])
    // steam while carrying (hot choc secured)
    const a = 0.3 * Math.sin(tMs * 0.004)
    if (a > 0.08) t.blend(mugX + 1, floor - 29, 1, 1, [240, 244, 255], a)
  } else if (carry === "can") {
    // little teal watering can swinging at their side
    const canX = f > 0 ? x + 11 : x - 4
    const canY = floor - 21 + step
    t.fill(canX, canY, 4, 3, [62, 138, 142])
    t.fill(canX, canY, 4, 1, [84, 168, 172])
    t.fill(canX + (f > 0 ? 3 : -2), canY, 2, 1, [84, 168, 172]) // spout
    t.fill(canX + (f > 0 ? -1 : 4), canY - 1, 1, 2, [62, 138, 142]) // handle
  } else if (carry === "bag") {
    // crinkly kibble sack hugged in the front arm
    const bagX = f > 0 ? x + 11 : x - 4
    t.fill(bagX, floor - 28, 4, 6, [156, 106, 54])
    t.fill(bagX, floor - 28, 4, 1, [186, 134, 74])
    t.fill(bagX + 1, floor - 25, 2, 2, [232, 206, 150]) // label
  }

  drawHead(t, av, x, floor - 43 + bob, blink, false)
}

function drawAvatarStanding(
  t: PixelTarget,
  g: RoomGeo,
  av: AvatarSpec,
  tMs: number,
  justWoke: boolean,
  yawning: boolean,
  xOverride?: number
) {
  const x = xOverride ?? g.standX
  const floor = g.floorY
  const blink = tMs % 3400 < 130

  contactShadow(t, x - 2, floor, 14, 0.3)

  // legs
  t.fill(x + 1, floor - 16, 3, 14, scale(av.hoodie, 0.55))
  t.fill(x + 5, floor - 16, 3, 14, scale(av.hoodie, 0.5))
  t.fill(x, floor - 2, 4, 2, [40, 36, 48])
  t.fill(x + 5, floor - 2, 4, 2, [40, 36, 48])

  // torso
  t.fill(x, floor - 34, 9, 19, av.hoodie)
  t.fill(x, floor - 34, 9, 2, scale(av.hoodie, 1.18))
  t.fill(x + 8, floor - 34, 1, 19, scale(av.hoodie, 0.75))

  if (justWoke) {
    // stretch: both arms up
    const sway = Math.floor(tMs / 500) % 2 === 0 ? 1 : 0
    t.fill(x - 2, floor - 38 - sway, 2, 8, av.hoodie)
    t.fill(x + 9, floor - 38 - sway, 2, 8, av.hoodie)
    t.fill(x - 2, floor - 39 - sway, 2, 2, av.skin)
    t.fill(x + 9, floor - 39 - sway, 2, 2, av.skin)
  } else {
    // sleepy arms down / yawn arm
    t.fill(x - 1, floor - 32, 2, 12, av.hoodie)
    t.fill(x + 8, floor - 32, 2, 12, av.hoodie)
    if (yawning) {
      t.fill(x + 8, floor - 34, 2, 3, av.hoodie)
      t.fill(x + 8, floor - 36, 2, 2, av.skin)
    }
  }

  drawHead(t, av, x, floor - 43, yawning ? false : blink, yawning)
}

function drawZ(t: PixelTarget, x: number, y: number, a: number) {
  const c: RGB = [200, 214, 255]
  t.blend(x, y, 3, 1, c, a)
  t.blend(x + 2, y + 1, 1, 1, c, a)
  t.blend(x + 1, y + 2, 1, 1, c, a)
  t.blend(x, y + 3, 3, 1, c, a)
}

function drawAvatarSleeping(t: PixelTarget, g: RoomGeo, av: AvatarSpec, tMs: number) {
  const x = g.bedX
  const top = g.floorY - 20

  // breathing as a slow eased wave, plus the occasional deep sigh
  const phase = (tMs % 4600) / 4600
  const ease = (v: number) => v * v * (3 - 2 * v)
  const breath =
    phase < 0.4 ? ease(phase / 0.4) : phase < 0.55 ? 1 : 1 - ease((phase - 0.55) / 0.45)
  const sighAge = tMs % 47000
  const sigh = sighAge < 1500 ? Math.sin((sighAge / 1500) * Math.PI) : 0
  const bumpY = top - 2 - Math.round(breath) - (sigh > 0.6 ? 1 : 0)

  // head nested into the pillow: crease it, sink a pixel on the big sighs
  const hx = x + 11
  const hy = top + (sigh > 0.5 ? 1 : 0)
  t.fill(hx - 1, hy + 1, 1, 3, scale([244, 240, 230], 0.86) as RGB) // pillow crease
  t.fill(hx + 8, hy + 1, 1, 2, scale([244, 240, 230], 0.9) as RGB)
  t.fill(hx, hy, 8, 6, av.skin)
  t.fill(hx, hy + 6, 8, 1, scale(av.skin, 0.88)) // jaw tucked at the covers
  const hair = av.hairStyle === "beanie" ? av.hoodie : av.hair
  t.fill(hx, hy - 1, 8, 2, hair) // hairline
  t.fill(hx - 1, hy, 1, 2, hair) // tufts splayed onto the pillow
  t.fill(hx + 8, hy, 1, 2, hair)
  if (av.hairStyle === "long") {
    t.fill(hx + 8, hy + 2, 1, 3, hair)
    t.fill(hx - 1, hy + 2, 1, 2, hair)
  } else if (av.hairStyle === "spiky") {
    t.fill(hx + 1, hy - 2, 1, 1, hair)
    t.fill(hx + 5, hy - 2, 1, 1, hair)
  }
  // peacefully closed eyes: thin lid lines + a lash tick under each — in dim
  // night light the old fat bars read as wide-awake open eyes
  t.fill(hx + 2, hy + 3, 2, 1, [96, 74, 78])
  t.fill(hx + 5, hy + 3, 2, 1, [96, 74, 78])
  t.fill(hx + 2, hy + 4, 1, 1, [122, 94, 96]) // lash hints
  t.fill(hx + 6, hy + 4, 1, 1, [122, 94, 96])
  t.fill(hx + 6, hy + 5, 1, 1, scale(av.skin, 0.84) as RGB) // cheek shade
  // the snot bubble — it swells and shrinks with every breath
  const bub = breath > 0.45 ? 2 : 1
  t.blend(hx + 4, hy + 6 - bub, bub, bub, [214, 226, 255], 0.26 + 0.12 * breath)
  if (bub > 1) t.blend(hx + 4, hy + 4, 1, 1, [246, 250, 255], 0.5)

  // quilt over the body, TUCKED UP TO THE CHIN: the patchwork now rises in a
  // little shoulder stair to meet the jaw — the old cliff left a bare sheet
  // band between pillow and covers that read as a missing body
  const breathe = Math.round(breath)
  const qh = 20 + (top - 1 - bumpY)
  quilt(t, x + 24, bumpY, 56, qh)
  t.fill(x + 22, bumpY + 2, 2, 1, QUILT_A) // shoulder stair…
  t.fill(x + 20, bumpY + 3, 4, qh - 3, QUILT_A) // …rising to just right of the chin
  t.fill(x + 20, bumpY + 3, 1, qh - 3, scale(QUILT_A, 0.72)) // seam shade on the rise
  const waveX = x + 30 + Math.round(breath * 14)
  t.blend(waveX, bumpY + 1, 5, 1, QUILT_HL, 0.5)
  t.blend(waveX + 1, bumpY + 2, 3, 1, QUILT_HL, 0.28)

  // one hand out of the covers, tucked up by the cheek — riding every breath
  t.fill(x + 22, bumpY + 1, 3, 3, scale(av.hoodie, 0.92)) // sleeve peeking over the fold
  t.fill(x + 19, bumpY + 2, 2, 2, av.skin) // the hand
  t.fill(x + 21, bumpY + 3, 1, 1, av.skin) // knuckle

  // Z's drifting up from the head
  for (let i = 0; i < 3; i++) {
    const age = ((tMs + i * 1100) % 3300) / 3300
    const zx = hx + 4 + Math.floor(age * 10)
    const zy = hy - 6 - Math.floor(age * 14)
    const a = 0.75 * Math.sin(Math.PI * age)
    if (a > 0.08) drawZ(t, zx, zy, a)
  }
}

/** seated on the mattress front edge, feet toward the floor — shared by both sequences */
function drawAvatarSeatedEdge(t: PixelTarget, g: RoomGeo, av: AvatarSpec, x: number, tMs: number, yawn: boolean) {
  const floor = g.floorY
  const top = floor - 20
  const blink = tMs % 3400 < 130

  contactShadow(t, x - 2, floor, 16, 0.28)

  // torso
  t.fill(x, top - 13, 9, 16, av.hoodie)
  t.fill(x, top - 13, 9, 2, scale(av.hoodie, 1.18))
  t.fill(x + 8, top - 13, 1, 16, scale(av.hoodie, 0.75))
  // thigh forward + shin hanging + shoe
  t.fill(x + 4, top + 2, 7, 3, scale(av.hoodie, 0.6))
  t.fill(x + 9, top + 3, 3, floor - top - 5, scale(av.hoodie, 0.55))
  t.fill(x + 9, floor - 2, 4, 2, [40, 36, 48])
  // sleepy arm onto the mattress
  t.fill(x - 1, top - 11, 2, 9, av.hoodie)
  t.fill(x - 1, top - 1, 2, 2, av.skin)
  if (yawn) {
    t.fill(x + 8, top - 12, 2, 3, av.hoodie)
    t.fill(x + 8, top - 14, 2, 2, av.skin)
  }

  drawHead(t, av, x, top - 21, yawn ? false : blink, yawn)
}

/** lifted quilt corner at the foot of the bed + the dark opening beneath */
function drawQuiltFlap(t: PixelTarget, g: RoomGeo, tMs: number) {
  const top = g.floorY - 20
  const x = g.bedX
  const wobble = Math.floor(tMs / 400) % 2 === 0 ? 0 : 1
  t.fill(x + 66, top + 2, 20, 13, [26, 20, 38]) // opening under the covers
  t.fill(x + 62, top + wobble, 6, 2, QUILT_HL)
  t.fill(x + 64, top + 2 + wobble, 4, 2, QUILT_A)
  t.fill(x + 66, top + 4 + wobble, 2, 2, QUILT_B)
}

/** morning: sit up in bed -> swing legs over the edge -> rise */
function drawAvatarGetUp(t: PixelTarget, g: RoomGeo, av: AvatarSpec, tMs: number, stage: 0 | 1 | 2) {
  const x = g.bedX
  const floor = g.floorY
  const top = floor - 20

  if (stage === 0) {
    // up against the headboard, quilt still over the legs, eyes barely open
    const blink = tMs % 2600 < 620
    t.fill(x + 9, top - 15, 9, 17, av.hoodie)
    t.fill(x + 9, top - 15, 9, 2, scale(av.hoodie, 1.18))
    t.fill(x + 17, top - 15, 1, 17, scale(av.hoodie, 0.75))
    // arms flopped onto the covers
    t.fill(x + 16, top - 6, 8, 3, av.hoodie)
    t.fill(x + 22, top - 5, 3, 2, av.skin)
    drawHead(t, av, x + 10, top - 23, blink, false)
    return
  }
  if (stage === 1) {
    // quilt kicked toward the foot of the bed
    t.fill(x + 26, top - 1, 22, 18, [218, 208, 188]) // exposed sheet
    quilt(t, x + 48, top - 3, 42, 20) // bunched at the foot
    drawAvatarSeatedEdge(t, g, av, x + 28, tMs, false)
    return
  }
  drawAvatarStanding(t, g, av, tMs, true, false, g.bedX + 30)
}

/** night: fold the covers back -> perch -> lie down as the quilt settles over */
function drawAvatarGetIn(t: PixelTarget, g: RoomGeo, av: AvatarSpec, tMs: number, stage: 0 | 1 | 2, p: number) {
  const x = g.bedX
  const top = g.floorY - 20

  if (stage === 0) {
    drawQuiltFlap(t, g, tMs)
    drawAvatarStanding(t, g, av, tMs, false, false, g.bedX + 30)
    return
  }
  if (stage === 1) {
    drawQuiltFlap(t, g, tMs)
    drawAvatarSeatedEdge(t, g, av, x + 28, tMs, true)
    return
  }
  // lying over the sheet while the quilt slides across
  const hx = x + 11
  t.fill(hx, top, 8, 6, av.skin)
  const hair = av.hairStyle === "beanie" ? av.hoodie : av.hair
  t.fill(hx, top - 1, 8, 2, hair)
  if (av.hairStyle === "long") t.fill(hx + 7, top, 1, 5, hair)
  t.fill(hx + 4, top + 3, 3, 1, [70, 55, 60]) // closed eye
  // body stretched over the sheet
  t.fill(x + 19, top - 2, 18, 7, av.hoodie)
  t.fill(x + 37, top, 30, 5, scale(av.hoodie, 0.55))
  t.fill(x + 67, top, 5, 4, [40, 36, 48]) // feet past the covers
  // the quilt slides from the pillow end across them
  const coverW = Math.round(18 + (64 - 18) * Math.min(1, p))
  quilt(t, x + 26, top - 2, coverW, 19)
  t.fill(x + 26, top - 3, coverW, 1, QUILT_HL)
}

// ------------------------------ v5 set pieces ------------------------------

/** the cat's bowl, floor-front of the dresser — kibble appears at mealtimes */
function drawBowl(t: PixelTarget, g: RoomGeo, life: LifeState) {
  const bx = g.dresserX + 30
  const gy = g.floorY
  contactShadow(t, bx - 1, gy, 9, 0.22)
  // how full: pour progress while filling, slowly empties while the cat eats
  let fillN = 0
  const res = life.resident
  if (res.mode === "chore" && res.kind === "pour") fillN = Math.min(4, 1 + Math.floor(res.p * 4))
  else if (life.cat.pose === "eat") fillN = 4
  // red bowl, dark inner
  t.fill(bx + 1, gy - 3, 5, 1, [196, 74, 74])
  t.fill(bx, gy - 2, 7, 2, [176, 62, 62])
  if (fillN > 0) {
    for (let i = 0; i < fillN; i++) {
      t.fill(bx + 1 + (i % 3), gy - 2 - (i > 2 ? 1 : 0), 1, 1, [214, 160, 96])
    }
  } else {
    t.fill(bx + 1, gy - 2, 5, 1, [96, 40, 44])
  }
}

/** a tiny friend on the windowsill, drinking the sun */
function drawSillPlant(t: PixelTarget, g: RoomGeo, boost: number, tMs: number) {
  const x = g.winX + g.winW - 13
  const y = g.winY + g.winH // sits on the sill top
  contactShadow(t, x, y + 4, 7, 0.2)
  bevel(t, x, y - 1, 5, 5, [172, 96, 60])
  const perkUp = 1 + boost * 0.25
  const leaf: RGB = scale([100, 190, 104], perkUp)
  t.fill(x + 1, y - 4, 1, 3, leaf)
  t.fill(x + 3, y - 5, 1, 4, scale([124, 210, 120], perkUp))
  t.fill(x + 2, y - 3, 1, 2, leaf)
  if (boost > 0.25) {
    const tw = Math.pow(Math.sin(tMs * 0.004 + 1.1), 2)
    t.add(x + 3, y - 6, 1, 1, [220, 255, 220], boost * 0.5 * tw)
  }
}

/** little shelf boombox — the source of the evening lo-fi head-bob */
function drawBoombox(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number) {
  const x = g.shelfX + 29
  const y = g.shelfY // sits on the shelf board
  const lofi = s.mood.ambient > 0.14
  bevel(t, x, y - 6, 7, 6, [48, 44, 66])
  // speakers with beating cones
  const beat = lofi ? (Math.floor(tMs / 550) % 2) : 0
  t.fill(x, y - 5, 2, 3, [30, 28, 44])
  t.fill(x + 5, y - 5, 2, 3, [30, 28, 44])
  t.fill(x, y - 4 + (beat ? 0 : 0), 1, 1, lofi ? [120, 104, 190] : [70, 66, 96])
  t.fill(x + 6, y - 4, 1, 1, lofi ? [120, 104, 190] : [70, 66, 96])
  // EQ window — bars bounce along with the head-bob
  t.fill(x + 2, y - 5, 3, 3, [22, 24, 36])
  for (let i = 0; i < 3; i++) {
    const hgt = lofi ? 1 + Math.floor(Math.abs(Math.sin(tMs * 0.004 + i * 1.6)) * 2) : 1
    t.fill(x + 2 + i, y - 2 - (hgt - 1), 1, hgt, [118, 226, 164])
  }
  // antenna
  t.fill(x + 5, y - 9, 1, 3, [120, 118, 140])
  // a note floats off now and then while the evening session is on
  if (lofi) {
    const age = (tMs % 9000) / 1400
    if (age < 1) {
      const a = 0.55 * Math.sin(Math.PI * age)
      const nx = x + 3 + Math.floor(age * 3)
      const ny = y - 10 - Math.floor(age * 4)
      t.blend(nx, ny, 1, 2, [210, 190, 255], a)
      t.blend(nx + 1, ny + 1, 1, 1, [210, 190, 255], a)
    }
  }
}

/** wall-mounted aquarium on its own little bracket — the room's night light */
function drawFishTank(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number) {
  const tx = g.shelfX + 52 // same mid-zone anchor as the shelf
  const ty = g.shelfY - 2
  // bracket board + supports
  bevel(t, tx - 1, ty + 11, 20, 2, [104, 70, 42])
  t.fill(tx + 1, ty + 13, 2, 3, scale([104, 70, 42], 0.7) as RGB)
  t.fill(tx + 16, ty + 13, 2, 3, scale([104, 70, 42], 0.7) as RGB)

  const night = s.mood.ambient > 0.18
  if (night) glow(t, tx + 9, ty + 5, 14, 9, [110, 190, 255], 0.15)

  // hood with a tiny light bar
  t.fill(tx - 1, ty - 1, 20, 2, [40, 44, 58])
  if (night) t.add(tx + 1, ty + 1, 16, 1, [130, 205, 255], 0.5)
  // glass + water bands
  bevel(t, tx, ty + 1, 18, 10, [58, 78, 96])
  t.fill(tx + 1, ty + 2, 16, 8, mix([30, 74, 96], [16, 44, 64], 0))
  t.fill(tx + 1, ty + 6, 16, 4, [16, 44, 64])
  if (night) t.blend(tx + 1, ty + 2, 16, 8, [40, 90, 140], 0.35)
  // water surface shimmer
  const shim = 0.5 + 0.5 * Math.sin(tMs * 0.002)
  t.blend(tx + 1, ty + 2, 16, 1, [150, 210, 235], 0.25 + 0.2 * shim)
  // gravel
  for (let i = 0; i < 8; i++) t.fill(tx + 1 + i * 2, ty + 9, 1, 1, [150 + (i % 3) * 20, 126, 96] as RGB)
  // plant inside, swaying
  const sway = Math.round(Math.sin(tMs * 0.0011) * 1)
  t.fill(tx + 13 + sway, ty + 6, 1, 3, [64, 150, 96])
  t.fill(tx + 14 + sway, ty + 5, 1, 2, [84, 176, 110])
  // airstone bubbles wobbling up
  for (let i = 0; i < 3; i++) {
    const rise = (tMs * (0.0016 + i * 0.0004) + i * 3.1) % 7
    const bx = tx + 2 + Math.round(Math.sin(tMs * 0.003 + i * 2.2) * 1)
    const by = ty + 9 - Math.floor(rise)
    if (by > ty + 2) t.blend(bx, by, 1, 1, [190, 225, 245], 0.5)
  }
  // two fish on lazy loops
  const swim = (periodMs: number, off: number) => {
    const ph = ((tMs + off) % periodMs) / periodMs
    return { p: ph < 0.5 ? ph * 2 : (1 - ph) * 2, fwd: ph < 0.5 }
  }
  const f1 = swim(11000, 0)
  const f1x = tx + 3 + Math.round(f1.p * 10)
  const f1y = ty + 4 + Math.round(Math.sin(tMs * 0.0011) * 1)
  t.fill(f1x, f1y, 3, 1, [240, 164, 84])
  t.fill(f1x + (f1.fwd ? -1 : 3), f1y - 1, 1, 2, [224, 140, 66]) // tail
  t.fill(f1x + (f1.fwd ? 2 : 0), f1y, 1, 1, [40, 32, 28]) // eye
  const f2 = swim(7000, 3200)
  const f2x = tx + 2 + Math.round(f2.p * 12)
  const f2y = ty + 7 + Math.round(Math.sin(tMs * 0.0014 + 2) * 1)
  t.fill(f2x, f2y, 2, 1, [110, 170, 230])
  t.fill(f2x + (f2.fwd ? -1 : 2), f2y, 1, 1, [88, 142, 200]) // tail
  // glass glare
  t.blend(tx + 2, ty + 2, 1, 8, [235, 245, 255], 0.1)
}

/** twin-bell alarm clock perched on the headboard — rings at wake, tapped off */
function drawAlarmClock(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number, ringing: boolean) {
  const x = g.bedX - 1
  const top = g.floorY - 20
  const y = top - 22 // feet rest on the headboard's top edge — nothing floats
  const jig = ringing ? (Math.floor(tMs / 70) % 2 === 0 ? 1 : -1) : 0
  // bells + hammer
  t.fill(x - 1 + jig, y - 2, 2, 2, [206, 208, 216])
  t.fill(x + 4 - jig, y - 2, 2, 2, [206, 208, 216])
  if (ringing) {
    t.add(x - 2 + jig, y - 3, 1, 1, [255, 120, 110], 0.7)
    t.add(x + 6 - jig, y - 3, 1, 1, [255, 120, 110], 0.7)
  }
  // body + face
  bevel(t, x, y, 5, 4, [202, 88, 80])
  const faceFlash = ringing && Math.floor(tMs / 140) % 2 === 0
  t.fill(x + 1, y + 1, 3, 2, faceFlash ? [255, 150, 140] : [240, 238, 226])
  // tiny hands ~alarm time
  t.fill(x + 2, y + 1, 1, 1, [60, 58, 54])
  // feet
  t.fill(x, y + 4, 1, 1, scale([202, 88, 80], 0.7) as RGB)
  t.fill(x + 4, y + 4, 1, 1, scale([202, 88, 80], 0.7) as RGB)
}

/** errand poses: pouring kibble, watering plants, petting the cat */
function drawAvatarChore(
  t: PixelTarget,
  g: RoomGeo,
  av: AvatarSpec,
  tMs: number,
  frame: { kind: "pour" | "water" | "pet"; x: number; p: number; facing: 1 | -1 }
) {
  const floor = g.floorY
  const { kind, x, p, facing } = frame
  const blink = tMs % 3400 < 130

  if (kind === "pet") {
    // crouch down to cat level and reach out the scritch-hand
    contactShadow(t, x - 2, floor, 15, 0.28)
    // folded legs
    t.fill(x, floor - 9, 9, 7, scale(av.hoodie, 0.55))
    t.fill(x, floor - 2, 5, 2, [40, 36, 48])
    // torso low
    t.fill(x, floor - 22, 9, 13, av.hoodie)
    t.fill(x, floor - 22, 9, 2, scale(av.hoodie, 1.18))
    t.fill(x + (facing > 0 ? 8 : 0), floor - 22, 1, 13, scale(av.hoodie, 0.75))
    // scritch arm reaching down-forward, wiggling a little
    const wig = Math.floor(tMs / 140) % 2
    const ax = facing > 0 ? x + 8 : x - 3
    t.fill(ax, floor - 16, 2, 6, av.hoodie)
    t.fill(ax + (facing > 0 ? 1 : -1), floor - 11 + wig, 2, 2, av.skin)
    drawHead(t, av, x, floor - 31, blink, false)
    // hearts rising from the cat
    for (let i = 0; i < 3; i++) {
      const age = (((tMs + i * 800) % 2400) / 2400)
      const hx = (facing > 0 ? x + 12 : x - 8) + Math.round(Math.sin(age * TAU + i) * 2)
      const hy = floor - 16 - Math.floor(age * 13)
      const a = 0.8 * Math.sin(Math.PI * Math.min(1, age * 1.15))
      if (a > 0.08) {
        const hc: RGB = [240, 130, 160]
        t.blend(hx, hy, 1, 1, hc, a)
        t.blend(hx + 2, hy, 1, 1, hc, a)
        t.blend(hx, hy + 1, 3, 1, hc, a)
        t.blend(hx + 1, hy + 2, 1, 1, hc, a)
      }
    }
    return
  }

  // pour / water share the standing silhouette with a working front arm
  contactShadow(t, x - 2, floor, 14, 0.3)
  t.fill(x + 1, floor - 16, 3, 14, scale(av.hoodie, 0.55))
  t.fill(x + 5, floor - 16, 3, 14, scale(av.hoodie, 0.5))
  t.fill(x, floor - 2, 4, 2, [40, 36, 48])
  t.fill(x + 5, floor - 2, 4, 2, [40, 36, 48])
  t.fill(x, floor - 34, 9, 19, av.hoodie)
  t.fill(x, floor - 34, 9, 2, scale(av.hoodie, 1.18))
  t.fill(x + (facing > 0 ? 8 : 0), floor - 34, 1, 19, scale(av.hoodie, 0.75))
  // back arm rests
  t.fill(facing > 0 ? x - 1 : x + 8, floor - 31, 2, 11, av.hoodie)

  const f = facing
  if (kind === "pour") {
    // kibble sack tipped over the bowl; pellets rattling out
    const bagX = f > 0 ? x + 10 : x - 4
    t.fill(f > 0 ? x + 8 : x - 1, floor - 29, 3, 3, av.hoodie)
    t.fill(bagX, floor - 28, 4, 6, [156, 106, 54])
    t.fill(bagX + (f > 0 ? 3 : 0), floor - 28, 1, 1, [232, 206, 150])
    const bowlX = g.dresserX + 30
    for (let i = 0; i < 3; i++) {
      const drop = ((tMs + i * 170) % 500) / 500
      const dx = bowlX + 2 + (i % 2)
      const dy = floor - 22 + Math.floor(drop * 19)
      t.fill(dx, dy, 1, 1, [214, 160, 96])
    }
  } else {
    // watering can raised, spout tipped down, drips falling
    const canX = f > 0 ? x + 10 : x - 5
    t.fill(f > 0 ? x + 8 : x - 1, floor - 30, 3, 3, av.hoodie)
    t.fill(canX, floor - 33, 4, 3, [62, 138, 142])
    t.fill(canX, floor - 33, 4, 1, [84, 168, 172])
    const spX = canX + (f > 0 ? 4 : -2)
    t.fill(spX, floor - 32, 2, 1, [84, 168, 172])
    for (let i = 0; i < 2; i++) {
      const drop = ((tMs + i * 260) % 720) / 720
      const dxp = spX + (f > 0 ? 1 : 0) + Math.round(drop * 2) * f
      const dyp = floor - 31 + Math.floor(drop * drop * 26)
      if (drop < 0.8) t.blend(dxp, dyp, 1, 1, [170, 214, 240], 0.75 * (1 - drop * 0.4))
    }
  }
  drawHead(t, av, x, floor - 43, blink, false)
}

// ------------------------------ atmosphere ---------------------------------

function drawDust(t: PixelTarget, g: RoomGeo, wl: WindowLight, bf: BeamField, tMs: number) {
  // dust is only VISIBLE when caught in a beam — free-roaming motes just
  // read as noise sprinked across the dark wall, so none of those anymore
  if (!bf.active) return
  for (let i = 0; i < 12; i++) {
    const fy = hash(i * 11 + 3)
    const fx = hash(i * 17 + 6)
    const y = Math.round(bf.y0 + 4 + fy * (bf.y1 - bf.y0 - 6) + Math.sin(tMs * 0.00013 + i * 1.3) * 3)
    const beamCX = bf.x0 + (y - bf.y0) * bf.slope + bf.w / 2
    const half = bf.w / 2 - 2
    const x = Math.round(beamCX + (fx * 2 - 1) * half + Math.sin(tMs * 0.00021 + i * 2.1) * 4)
    if (x < 0 || x >= g.w || y < 0 || y >= g.h) continue
    const tw = 0.25 + 0.75 * Math.pow(Math.sin(tMs * 0.0009 + i * 1.9), 2)
    const a = Math.min(0.45, wl.peak * (0.5 + 0.8 * tw))
    if (a > 0.03) t.add(x, y, 1, 1, [255, 246, 220], a)
  }
}

function drawLighting(t: PixelTarget, g: RoomGeo, s: SceneState, flash: number) {
  const m = s.mood
  if (m.tintAmt > 0.01) t.mul(0, 0, g.w, g.h, m.tint, m.tintAmt)
  if (m.ambient > 0.005) t.mul(0, 0, g.w, g.h, [44, 50, 104], m.ambient)
  // lightning bounce off the walls
  if (flash > 0) t.add(0, 0, g.w, g.h, [190, 200, 255], flash * 0.1)
  // vignette (stronger at night)
  const v = 0.1 + m.ambient * 0.3
  const vw = Math.max(6, Math.round(g.w * 0.03))
  t.blend(0, 0, g.w, 8, [10, 10, 26], v)
  t.blend(0, g.h - 8, g.w, 8, [8, 8, 22], v * 0.8)
  t.blend(0, 0, vw, g.h, [10, 10, 26], v * 0.7)
  t.blend(g.w - vw, 0, vw, g.h, [10, 10, 26], v * 0.7)
}

// ------------------------------ main render --------------------------------

export function renderRoom(
  t: PixelTarget,
  now: Date,
  avatar: AvatarSpec = DEFAULT_AVATAR,
  prefs: AfkPrefs = DEFAULT_PREFS,
  tMs: number = Date.now(),
  size: RoomSize = { w: BASE_W, h: 160 },
  weather: WeatherState = CLEAR_WEATHER
) {
  const g = layoutOf(size.w, size.h)
  const s = sceneStateAt(now, prefs)
  const wlSky = windowLightOf(s)
  const wl0 = dimWindowLightForWeather(wlSky, weather)
  const bf0 = beamField(g, wl0)
  const life = lifeState(g, s, wl0, bf0, weather, now, tMs, prefs)
  const flash = lightningAt(tMs, weather)
  const dayNum = Math.floor(now.getTime() / 86400000)
  // drawn light obeys the curtains (the sky itself stays full-strength)
  const cFactor = 0.25 + 0.75 * life.curtainP
  const wl: WindowLight = { ...wl0, peak: wl0.peak * cFactor, side: wl0.side * cFactor }
  const bf = beamField(g, wl)

  drawWalls(t, g)
  drawFloor(t, g)

  drawWindow(t, g, s, tMs, weather, wlSky /* full-strength for sky lining */, life)
  drawWallWash(t, g, s, wl)
  drawGodRays(t, g, wl, bf)
  drawPoster(t, g, tMs)
  drawWallClock(t, g, now)
  drawShelf(t, g, dayNum)
  drawBoombox(t, g, s, tMs)
  drawFishTank(t, g, s, tMs)
  drawFairyLights(t, g, s, tMs, weather.wind)

  drawRug(t, g)
  drawDresserAndMicrowave(t, g, s, tMs, life.snack)
  drawBowl(t, g, life)
  drawPlant(t, g, tMs, weather.wind, life.plantBoost)
  drawSillPlant(t, g, life.plantBoost, tMs)
  drawBed(t, g)
  drawAlarmClock(t, g, s, tMs, life.alarmRing)
  drawLamp(t, g, s, tMs, life.lampLevel)
  drawDesk(t, g, s, tMs, life)

  // the resident — full journey: sleeps, gets up, walks, runs errands, climbs in
  const res = life.resident
  if (res.mode === "sleep") drawAvatarSleeping(t, g, avatar, tMs)
  else if (res.mode === "getup") drawAvatarGetUp(t, g, avatar, tMs, res.stage)
  else if (res.mode === "getin") drawAvatarGetIn(t, g, avatar, tMs, res.stage, res.p)
  else if (res.mode === "stand") drawAvatarStanding(t, g, avatar, tMs, res.justWoke, res.yawning, res.x)
  else if (res.mode === "walk") drawAvatarWalking(t, g, avatar, tMs, res.x, res.facing, res.carry ?? false)
  else if (res.mode === "chore") drawAvatarChore(t, g, avatar, tMs, res)
  else if (life.snack.active)
    drawAvatarWalking(t, g, avatar, tMs, life.snack.x, life.snack.facing, life.snack.carryMug ? "mug" : false)
  else drawAvatarSitting(t, g, s, avatar, tMs, life)

  drawCat(t, g, life.cat, tMs)
  drawRimLights(t, g, s, wl)
  drawDust(t, g, wl, bf, tMs)

  // final lighting pass
  drawLighting(t, g, s, flash)
}
