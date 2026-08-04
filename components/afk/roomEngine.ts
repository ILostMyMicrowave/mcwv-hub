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
  const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
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

type BeamField = {
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

function drawFairyLights(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number) {
  const topY = 5
  const span = g.w - 16
  const night = s.mood.ambient > 0.1
  let prevX = 8
  let prevY = topY
  for (let i = 0; i <= Math.floor(span / 11); i++) {
    const x = 8 + i * 11
    const sag = Math.sin((Math.PI * x) / g.w)
    const sway = Math.round(Math.sin(tMs * 0.0006 + i * 0.9) * 1)
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

function drawWindow(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number) {
  const m = s.mood
  const wl = windowLightOf(s)
  const W = { x: g.winX, y: g.winY, w: g.winW, h: g.winH }
  const inn = { x: W.x + 4, y: W.y + 4, w: W.w - 8, h: W.h - 8 }

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
      t.fill(cx + off + flare * (side === 0 ? -1 : 1) * 0 + (side === 0 ? -Math.floor(flare / 3) : Math.floor(flare / 3)), W.y - 2 + i, width, 1, tone)
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
    const c = mix(m.skyTop, m.skyHorizon, Math.round(f * 8) / 8)
    t.fill(inn.x, inn.y + i, inn.w, 2, c)
  }

  // -------- the world outside: distant rolling hills, two layers --------
  const hillFar: RGB = mix(mix(m.skyHorizon, m.skyTop, 0.5), [34, 36, 64], 0.4)
  const hillNear: RGB = mix(mix(m.skyHorizon, m.skyTop, 0.5), [16, 18, 38], 0.62)
  for (let i = 0; i < inn.w; i++) {
    const waveF = Math.sin((i + 7) * 0.22) * 2 + Math.sin(i * 0.06) * 2
    const topF = inn.y + inn.h - 9 + Math.round(waveF)
    if (topF < inn.y + inn.h) t.fill(inn.x + i, topF, 1, inn.y + inn.h - topF, hillFar)
    const waveN = Math.sin((i + 23) * 0.3) * 2.4
    const topN = inn.y + inn.h - 5 + Math.round(waveN)
    if (topN < inn.y + inn.h) t.fill(inn.x + i, topN, 1, inn.y + inn.h - topN, hillNear)
  }
  // far house lights after dark — someone else's window glows out there
  if (m.stars > 0.35) {
    for (let i = 0; i < 3; i++) {
      const hx = inn.x + 4 + Math.floor(hash(i * 17 + 5) * (inn.w - 8))
      const relI = hx - inn.x
      const hy = inn.y + inn.h - 8 + Math.round(Math.sin((relI + 7) * 0.22) * 2 + Math.sin(relI * 0.06) * 2)
      const a = m.stars * (0.4 + 0.4 * Math.pow(Math.sin(tMs * 0.0009 + i * 2.4), 2))
      t.add(hx, hy, 1, 1, [255, 200, 110], Math.min(1, a))
    }
  }

  // stars
  if (m.stars > 0.02) {
    for (let i = 0; i < 18; i++) {
      const sx = inn.x + 1 + Math.floor(hash(i * 3 + 1) * (inn.w - 4))
      const sy = inn.y + 1 + Math.floor(hash(i * 7 + 2) * (inn.h - 8))
      const tw = 0.45 + 0.55 * Math.pow(Math.sin(tMs * 0.0016 + hash(i + 90) * TAU), 2)
      const a = m.stars * tw
      if (a > 0.06) t.add(sx, sy, 1, 1, [235, 240, 255], Math.min(1, a))
      if (i < 3 && a > 0.5) {
        t.add(sx - 1, sy, 1, 1, [235, 240, 255], a * 0.6)
        t.add(sx + 1, sy, 1, 1, [235, 240, 255], a * 0.6)
        t.add(sx, sy - 1, 1, 1, [235, 240, 255], a * 0.6)
        t.add(sx, sy + 1, 1, 1, [235, 240, 255], a * 0.6)
      }
    }
  }

  // shooting star — one streaks by every ~53s on clear nights
  if (m.stars > 0.5) {
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
      ditherGlow(t, body.x, body.y, 8 + Math.round(hot * 7), 8 + Math.round(hot * 6), [255, 214, 130], 0.4 + 0.3 * hot)
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
      if (m.stars > 0.1) ditherGlow(t, body.x, body.y, 7, 7, [190, 205, 255], 0.4 * m.stars)
      ellipse(t, body.x, body.y, 3, 3, "fill", [232, 234, 220])
      t.fill(body.x - 1, body.y - 1, 1, 1, [198, 200, 186])
      t.fill(body.x + 1, body.y + 1, 1, 1, [206, 208, 194])
    }
  }

  // clouds — golden linings near the sun, silver near the moon, out day & night
  const cloudA = clamp01((0.62 - m.ambient) * 2.4)
  if (cloudA > 0.05) {
    const dayness = clamp01((0.45 - m.ambient) * 3)
    const cloudBase: RGB = mix([96, 104, 152], [245, 248, 255], dayness)
    const lining: RGB = wl.day ? mix([255, 190, 120], [255, 236, 190], wl.alt) : [214, 224, 255]
    for (let i = 0; i < 2; i++) {
      const drift = (tMs * (0.0011 + i * 0.0005)) % (inn.w + 22)
      const cx = inn.x - 12 + ((hash(i * 13 + 4) * 30 + drift) | 0)
      const cy = inn.y + 4 + Math.floor(hash(i * 5 + 8) * (inn.h - 18))
      t.blend(cx, cy, 10, 2, cloudBase, 0.4 * cloudA)
      t.blend(cx + 2, cy - 1, 6, 1, cloudBase, 0.4 * cloudA)
      t.blend(cx + 1, cy + 2, 8, 1, cloudBase, 0.3 * cloudA)
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

  // glass glare — diagonal sheen
  for (let i = 0; i < inn.h; i++) {
    const gx = inn.x + 2 + Math.floor(i / 2.5)
    if (gx < inn.x + inn.w - 2) t.blend(gx, inn.y + i, 2, 1, [255, 255, 255], 0.07)
  }

  t.unclip()

  // mullions
  t.fill(W.x + Math.floor(W.w / 2) - 1, W.y, 3, W.h, [96, 66, 40])
  t.fill(W.x, W.y + Math.floor(W.h / 2) - 1, W.w, 3, [96, 66, 40])
  // sill
  bevel(t, W.x - 3, W.y + W.h, W.w + 6, 4, [96, 64, 38])
}

/**
 * GOD RAYS — volumetric beams pouring from the window, split by the mullion
 * bars, angled by sun/moon position: near-vertical at noon, long amber rakes
 * across the room at golden hour, cool blue moon-shafts at night.
 */
function drawGodRays(t: PixelTarget, g: RoomGeo, s: SceneState) {
  const wl = windowLightOf(s)
  const bf = beamField(g, wl)
  if (!bf.active) return

  const c = wl.color
  const span = bf.y1 - bf.y0
  const midX = g.winX + Math.floor(g.winW / 2)
  // two slits, split around the vertical mullion bar
  const slits: [number, number][] = [
    [bf.x0 + 1, midX - 3],
    [midX + 3, bf.x0 + bf.w],
  ]
  for (const [sx0, sx1] of slits) {
    const bw = sx1 - sx0
    if (bw <= 0) continue
    for (let dy = 0; dy < span; dy += 2) {
      const widen = dy * 0.05
      const bx = sx0 + dy * bf.slope - widen
      const fade = Math.pow(1 - dy / span, 1.25)
      const dens = wl.peak * fade
      if (dens > 0.03) dither(t, "add", Math.round(bx), bf.y0 + dy, Math.round(bw + widen * 2), 2, c, dens)
    }
  }
  // moving light pool where the beams land
  const poolX = bf.x0 + span * bf.slope + Math.round(bf.w / 2)
  ditherGlow(t, poolX, bf.y1 - 2, 22, 4, c, wl.peak * 0.4)
}

/** warm/cool atmosphere radiating on the wall around the window */
function drawWallWash(t: PixelTarget, g: RoomGeo, s: SceneState) {
  const wl = windowLightOf(s)
  if (!wl.active) return
  const cx = g.winX + Math.floor(g.winW / 2)
  const cy = g.winY + Math.floor(g.winH / 2)
  const strength = Math.min(0.055, wl.day ? 0.02 + 0.04 * wl.side : 0.04 * s.mood.stars)
  if (strength < 0.03) return
  ditherGlow(t, cx, cy, Math.round(g.winW * 0.85), Math.round(g.winH * 0.74), wl.color, strength)
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

function drawShelf(t: PixelTarget, g: RoomGeo) {
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
  // little cactus
  bevel(t, x + 38, y - 4, 5, 4, [168, 92, 58])
  t.fill(x + 39, y - 9, 3, 6, [92, 158, 80])
  t.fill(x + 37, y - 7, 2, 2, [92, 158, 80])
  t.fill(x + 42, y - 8, 2, 2, [82, 146, 72])
  // board + brackets
  bevel(t, x, y, 46, 3, [104, 70, 42])
  t.fill(x + 4, y + 3, 2, 3, scale([104, 70, 42], 0.7) as RGB)
  t.fill(x + 40, y + 3, 2, 3, scale([104, 70, 42], 0.7) as RGB)
}

/** tiny wall clock above the desk — shows REAL local time, 8-direction hands */
function drawWallClock(t: PixelTarget, g: RoomGeo, now: Date) {
  const cx = g.clockX, cy = g.clockY
  ellipse(t, cx, cy, 6, 6, "fill", [90, 62, 40])
  ellipse(t, cx, cy, 5, 5, "fill", [236, 232, 220])
  // ticks
  t.fill(cx - 1, cy - 4, 1, 1, [70, 66, 60])
  t.fill(cx + 3, cy - 1, 1, 1, [70, 66, 60])
  t.fill(cx - 1, cy + 3, 1, 1, [70, 66, 60])
  t.fill(cx - 4, cy - 1, 1, 1, [70, 66, 60])

  const DIRS8: [number, number][] = [
    [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ]
  const minutes = now.getMinutes() + now.getSeconds() / 60
  const hours = (now.getHours() % 12) + minutes / 60
  const [mdx, mdy] = DIRS8[Math.round((minutes / 60) * 8) % 8]
  const [hdx, hdy] = DIRS8[Math.round((hours / 12) * 8) % 8]
  t.fill(cx - 1 + mdx, cy - 1 + mdy, 1, 1, [60, 58, 54])
  t.fill(cx - 1 + mdx * 2, cy - 1 + mdy * 2, 1, 1, [60, 58, 54])
  t.fill(cx - 1 + mdx * 3, cy - 1 + mdy * 3, 1, 1, [60, 58, 54])
  t.fill(cx - 1 + hdx, cy - 1 + hdy, 1, 1, [40, 38, 36])
  t.fill(cx - 1, cy - 1, 1, 1, [150, 60, 60])
}

// ------------------------------ furniture ----------------------------------

function drawDresserAndMicrowave(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number) {
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
  const on = s.microOn
  contactShadow(t, mx, top - 1, 34, 0.25)
  bevel(t, mx, my, 34, 13, [212, 210, 200])
  t.fill(mx, my + 11, 34, 2, scale([212, 210, 200], 0.72) as RGB)
  // door
  t.fill(mx + 3, my + 3, 21, 8, [30, 32, 42])
  t.fill(mx + 3, my + 3, 21, 1, [52, 54, 66])
  // mesh dither over the door
  dither(t, "blend", mx + 3, my + 3, 21, 8, [10, 12, 18], 0.3)
  if (on) {
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

function drawDesk(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number) {
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
  const awakeScreen = !s.sleeping
  if (awakeScreen) {
    t.fill(mx + 2, my + 2, 19, 15, [30, 44, 68])
    // title bar with 2 buttons — retro OS vibes
    t.fill(mx + 2, my + 2, 19, 3, [58, 74, 110])
    t.fill(mx + 3, my + 3, 1, 1, [240, 120, 110])
    t.fill(mx + 5, my + 3, 1, 1, [240, 200, 110])
    const lines: [number, number, number, RGB][] = [
      [6, 0, 12, [110, 220, 160]],
      [9, 2, 8, [150, 120, 230]],
      [12, 1, 14, [110, 170, 240]],
    ]
    for (const [ly, off, len, c] of lines) {
      const wobble = Math.floor(tMs / 900 + ly) % 3 === 0 ? 1 : 0
      t.fill(mx + 3 + off, my + ly, len - wobble * 2, 1, c)
    }
    // taskbar
    t.fill(mx + 2, my + 15, 19, 2, [46, 56, 84])
    t.fill(mx + 3, my + 15, 1, 1, [110, 220, 160])
    if (s.mood.ambient > 0.12) ditherGlow(t, mx + 11, my + 10, 16, 11, [150, 190, 255], 0.32)
  } else {
    t.fill(mx + 2, my + 2, 19, 15, [18, 20, 28])
    // standby LED — the monitor sleeps too
    const ledPulse = 0.5 + 0.5 * Math.sin(tMs * 0.0012)
    t.blend(mx + 19, my + 17, 1, 1, [255, 120, 80], 0.4 + 0.5 * ledPulse)
  }
  // keyboard with key checker + mouse
  t.fill(mx - 2, surf - 2, 18, 2, [44, 46, 58])
  for (let k = 0; k < 8; k++) t.fill(mx - 1 + k * 2, surf - 1, 1, 1, [64, 66, 80])
  t.fill(mx + 17, surf - 2, 3, 2, [44, 46, 58])
}

function drawLamp(t: PixelTarget, g: RoomGeo, s: SceneState) {
  const x = g.lampX
  const floor = g.floorY
  contactShadow(t, x - 5, floor, 12, 0.3)
  const shadeY = floor - 48
  // glow BEHIND the fixture, so the light clearly comes from the lamp
  if (s.lampOn) {
    ditherGlow(t, x, shadeY + 12, 24, 16, [255, 205, 110], 0.34)
    ditherGlow(t, x, shadeY + 10, 11, 8, [255, 220, 140], 0.42)
  }
  // pole + base
  t.fill(x - 1, floor - 38, 2, 36, s.lampOn ? [168, 152, 172] : [128, 116, 138])
  ellipse(t, x, floor - 1, 6, 2, "fill", [94, 84, 108])
  if (s.lampOn) {
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

function drawCat(t: PixelTarget, g: RoomGeo, tMs: number) {
  const x = g.catX, y = g.catY
  const body: RGB = [214, 176, 126] // ginger loaf
  const stripe: RGB = [176, 136, 88]
  const breathe = Math.sin(tMs * 0.0011) > -0.2 ? 1 : 0
  contactShadow(t, x - 1, y + 7, 15, 0.25)
  // loaf
  t.fill(x, y + 2, 12, 5, body)
  t.fill(x + 1, y + 1, 10, 2, body)
  t.fill(x + 2, y + breathe, 7, 2, body)
  // stripes
  t.fill(x + 3, y + 2 + breathe, 1, 1, stripe)
  t.fill(x + 6, y + 2 + breathe, 1, 1, stripe)
  // ears
  t.fill(x + 2, y - 1 + breathe, 1, 2, stripe)
  t.fill(x + 5, y - 1 + breathe, 1, 2, stripe)
  // face hint (closed eyes, asleep)
  t.fill(x + 3, y + 3 + breathe, 1, 1, [120, 88, 60])
  // tail flick ~every 6s
  const flick = tMs % 6000 < 700
  t.fill(x + 12, y + (flick ? 1 : 3), 2, 1, stripe)
  // tiny z
  if (tMs % 4200 > 1800) {
    const a = 0.25 + 0.35 * Math.sin(tMs * 0.002)
    t.blend(x + 8, y - 5, 3, 1, [230, 232, 255], a)
    t.blend(x + 9, y - 4, 1, 1, [230, 232, 255], a)
    t.blend(x + 8, y - 3, 3, 1, [230, 232, 255], a)
  }
}

function drawPlant(t: PixelTarget, g: RoomGeo) {
  const x = 3
  const floor = g.floorY
  contactShadow(t, x - 1, floor, 15, 0.3)
  // pot in the corner left of the bed
  bevel(t, x, floor - 10, 12, 10, [156, 90, 58])
  t.fill(x - 1, floor - 12, 14, 3, scale([156, 90, 58], 1.18) as RGB)
  // leaves
  const g1: RGB = [92, 182, 98]
  const g2: RGB = [122, 206, 116]
  t.fill(x + 2, floor - 18, 3, 6, g1)
  t.fill(x + 5, floor - 22, 3, 10, g2)
  t.fill(x + 8, floor - 18, 2, 6, g1)
  t.fill(x, floor - 16, 2, 4, g2)
  t.fill(x + 6, floor - 20, 1, 1, scale(g2, 1.2) as RGB)
}

/**
 * RIM LIGHTS — window-side edge light catching furniture & the resident.
 * The hand-lit pixel art trick: amber at dawn/dusk, pale blue in moonlight.
 */
function drawRimLights(t: PixelTarget, g: RoomGeo, s: SceneState) {
  const wl = windowLightOf(s)
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
  t.add(g.bedX + 26, bedTop - 2, 40, 1, c, a * 0.5)
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

function drawAvatarSitting(t: PixelTarget, g: RoomGeo, av: AvatarSpec, tMs: number) {
  const x = g.sitX
  const floor = g.floorY
  const blink = tMs % 3400 < 130
  const typePhase = Math.floor(tMs / 380) % 2 === 0

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
  const armY = floor - 28 + (typePhase ? 0 : 1)
  t.fill(x + 10, armY, 8, 3, av.hoodie)
  t.fill(x + 17, armY + 1, 3, 2, av.skin)

  drawHead(t, av, x + 1, floor - 41, blink, false)
}

function drawAvatarStanding(t: PixelTarget, g: RoomGeo, av: AvatarSpec, tMs: number, justWoke: boolean, yawning: boolean) {
  const x = g.standX
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

  // head on pillow
  const hx = x + 11
  const hy = top
  t.fill(hx, hy, 8, 6, av.skin)
  const hair = av.hairStyle === "beanie" ? av.hoodie : av.hair
  t.fill(hx, hy - 1, 8, 2, hair)
  if (av.hairStyle === "long") t.fill(hx + 7, hy, 1, 5, hair)
  // closed eye
  t.fill(hx + 4, hy + 3, 3, 1, [70, 55, 60])

  // breathing patchwork bump over the body
  const breathe = Math.sin(tMs * 0.0012 * TAU) > -0.1 ? 1 : 0
  const bumpY = top - 2 - breathe
  quilt(t, x + 26, bumpY, 54, 20 + (top - 1 - bumpY))
  // fold shadow near head
  t.fill(x + 26, bumpY + 2, 3, 17, scale(QUILT_A, 0.7))

  // Z's drifting up from the head
  for (let i = 0; i < 3; i++) {
    const age = ((tMs + i * 1100) % 3300) / 3300
    const zx = hx + 4 + Math.floor(age * 10)
    const zy = hy - 6 - Math.floor(age * 14)
    const a = 0.75 * Math.sin(Math.PI * age)
    if (a > 0.08) drawZ(t, zx, zy, a)
  }
}

// ------------------------------ atmosphere ---------------------------------

function drawDust(t: PixelTarget, g: RoomGeo, s: SceneState, tMs: number) {
  const vis = 0.16 + (0.4 - Math.min(0.4, s.mood.ambient)) * 0.5
  const wl = windowLightOf(s)
  const bf = beamField(g, wl)
  for (let i = 0; i < 14; i++) {
    const bx = hash(i * 11 + 3) * g.w
    const by = 30 + hash(i * 17 + 6) * Math.max(60, g.floorY - 40)
    const x = Math.round(bx + Math.sin(tMs * 0.00021 + i * 2.1) * 14)
    const y = Math.round(by + Math.sin(tMs * 0.00013 + i * 1.3) * 8)
    if (x < 0 || x >= g.w || y < 0 || y >= g.h) continue
    let a = vis * (0.25 + 0.75 * Math.pow(Math.sin(tMs * 0.0009 + i * 1.9), 2))
    // motes caught in a god ray sparkle brighter
    if (bf.active && y >= bf.y0 && y <= bf.y1) {
      const beamCX = bf.x0 + (y - bf.y0) * bf.slope + bf.w / 2
      if (Math.abs(x - beamCX) < bf.w / 2 + 4) a = Math.min(0.6, a + wl.peak * 0.85)
    }
    if (a > 0.04) t.add(x, y, 1, 1, [255, 246, 220], Math.min(0.6, a))
  }
}

function drawLighting(t: PixelTarget, g: RoomGeo, s: SceneState) {
  const m = s.mood
  if (m.tintAmt > 0.01) t.mul(0, 0, g.w, g.h, m.tint, m.tintAmt)
  if (m.ambient > 0.005) t.mul(0, 0, g.w, g.h, [44, 50, 104], m.ambient)
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
  size: RoomSize = { w: BASE_W, h: 160 }
) {
  const g = layoutOf(size.w, size.h)
  const s = sceneStateAt(now, prefs)

  drawWalls(t, g)
  drawFloor(t, g)

  drawWindow(t, g, s, tMs)
  drawWallWash(t, g, s)
  drawGodRays(t, g, s)
  drawPoster(t, g, tMs)
  drawWallClock(t, g, now)
  drawShelf(t, g)
  drawFairyLights(t, g, s, tMs)

  drawRug(t, g)
  drawDresserAndMicrowave(t, g, s, tMs)
  drawPlant(t, g)
  drawBed(t, g)
  drawLamp(t, g, s)
  drawDesk(t, g, s, tMs)

  // the resident
  if (s.sleeping) drawAvatarSleeping(t, g, avatar, tMs)
  else if (s.standing) drawAvatarStanding(t, g, avatar, tMs, s.justWoke, s.yawning)
  else drawAvatarSitting(t, g, avatar, tMs)

  drawCat(t, g, tMs)
  drawRimLights(t, g, s)
  drawDust(t, g, s, tMs)

  // final lighting pass
  drawLighting(t, g, s)
}
