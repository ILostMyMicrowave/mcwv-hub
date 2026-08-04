// ---------------------------------------------------------------------------
// MCWV AFK Room — pure pixel-room engine.
//
// NO DOM, NO Next imports: the same file drives the browser canvas (via a
// CanvasTarget adapter) and a software rasterizer used for offline snapshot
// tests/art QA. Everything the room knows: schedule, moods, lighting, avatar.
// ---------------------------------------------------------------------------

export const ROOM_W = 240
export const ROOM_H = 160

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

// ------------------------------ color helpers ------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t)
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
}

function scale(c: RGB, f: number): RGB {
  return [clamp01((c[0] * f) / 255) * 255, clamp01((c[1] * f) / 255) * 255, clamp01((c[2] * f) / 255) * 255]
}

/** deterministic 0..1 hash — stable star/dust/mote placement across frames */
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
  let a = MOOD_STOPS[MOOD_STOPS.length - 1]
  let b = MOOD_STOPS[0]
  for (let i = 0; i < MOOD_STOPS.length; i++) {
    const cur = MOOD_STOPS[i]
    const nxt = MOOD_STOPS[(i + 1) % MOOD_STOPS.length]
    const span = i === MOOD_STOPS.length - 1 ? 24 - cur.hour + nxt.hour : nxt.hour - cur.hour
    const inSeg =
      i === MOOD_STOPS.length - 1 ? h >= cur.hour || h < nxt.hour : h >= cur.hour && h < nxt.hour
    if (inSeg && span > 0) {
      a = cur
      b = nxt
      const offset = ((h - cur.hour + 24) % 24) / span
      const t = clamp01(offset)
      return {
        skyTop: mix(a.skyTop, b.skyTop, t),
        skyHorizon: mix(a.skyHorizon, b.skyHorizon, t),
        ambient: lerp(a.ambient, b.ambient, t),
        tint: mix(a.tint, b.tint, t),
        tintAmt: lerp(a.tintAmt, b.tintAmt, t),
        stars: lerp(a.stars, b.stars, t),
      }
    }
  }
  return { ...a }
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
  /** brief stand-by-bad moment after waking / before bed */
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

// ------------------------------ avatar -------------------------------------

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

// ------------------------------ scene layout -------------------------------

const WALL: RGB = [66, 64, 100]
const FLOOR: RGB = [124, 86, 52]
const FLOOR_DARK: RGB = [100, 68, 40]
const BASEBOARD: RGB = [52, 50, 76]

const WIN = { x: 14, y: 24, w: 52, h: 54 } // outer frame
const WIN_IN = { x: 17, y: 27, w: 46, h: 48 } // sky opening

const DESK = { x: 176, y: 88, w: 62 }
const BED = { x: 16, y: 92, w: 92, h: 22 }

// sitting avatar anchor (desk)
const SIT = { x: 188, floor: 112 }
// standing anchor (by bed)
const STAND = { x: 100, floor: 112 }

// ------------------------------ primitives ---------------------------------

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

function glow(t: PixelTarget, cx: number, cy: number, rx: number, ry: number, c: RGB, a: number) {
  ellipse(t, cx, cy, rx, ry, "add", c, a * 0.45)
  ellipse(t, cx, cy, Math.floor(rx * 0.62), Math.floor(ry * 0.62), "add", c, a * 0.6)
  ellipse(t, cx, cy, Math.floor(rx * 0.3), Math.floor(ry * 0.3), "add", c, a)
}

// ------------------------------ sky & window -------------------------------

function sunMoonPos(hour: number): { x: number; y: number; sun: boolean } | null {
  if (hour >= 5.8 && hour <= 18.6) {
    const t = (hour - 5.8) / 12.8
    return { x: WIN_IN.x + 6 + t * (WIN_IN.w - 14), y: WIN_IN.y + 34 - Math.sin(Math.PI * t) * 28, sun: true }
  }
  const nt = hour > 12 ? (hour - 18.6) / 11.2 : (hour + 24 - 18.6) / 11.2
  if (nt < 0 || nt > 1) return null
  return { x: WIN_IN.x + 6 + nt * (WIN_IN.w - 14), y: WIN_IN.y + 34 - Math.sin(Math.PI * nt) * 28, sun: false }
}

function drawWindow(t: PixelTarget, s: SceneState, tMs: number) {
  const m = s.mood
  // outer frame + cross shadow
  t.fill(WIN.x - 2, WIN.y - 2, WIN.w + 4, WIN.h + 4, [40, 34, 30])
  t.fill(WIN.x, WIN.y, WIN.w, WIN.h, [94, 66, 40])

  t.clip(WIN_IN.x, WIN_IN.y, WIN_IN.w, WIN_IN.h)

  // sky gradient
  for (let i = 0; i < WIN_IN.h; i++) {
    const c = mix(m.skyTop, m.skyHorizon, i / (WIN_IN.h - 1))
    t.fill(WIN_IN.x, WIN_IN.y + i, WIN_IN.w, 1, c)
  }

  // stars
  if (m.stars > 0.02) {
    for (let i = 0; i < 18; i++) {
      const sx = WIN_IN.x + 2 + Math.floor(hash(i * 3 + 1) * (WIN_IN.w - 5))
      const sy = WIN_IN.y + 1 + Math.floor(hash(i * 7 + 2) * (WIN_IN.h - 8))
      const tw = 0.45 + 0.55 * Math.pow(Math.sin(tMs * 0.0016 + hash(i + 90) * TAU), 2)
      const a = m.stars * tw
      if (a > 0.06) t.add(sx, sy, 1, 1, [235, 240, 255], Math.min(1, a))
    }
  }

  // sun / moon
  const body = sunMoonPos(s.hour)
  if (body) {
    if (body.sun) {
      glow(t, body.x, body.y, 7, 7, [255, 214, 130], 0.5)
      ellipse(t, body.x, body.y, 3, 3, "fill", [255, 226, 150])
      ellipse(t, body.x, body.y, 2, 2, "fill", [255, 242, 190])
    } else {
      if (m.stars > 0.1) glow(t, body.x, body.y, 6, 6, [190, 205, 255], 0.35 * m.stars)
      ellipse(t, body.x, body.y, 3, 3, "fill", [232, 234, 220])
      t.fill(body.x - 1, body.y - 1, 1, 1, [198, 200, 186])
      t.fill(body.x + 1, body.y + 1, 1, 1, [206, 208, 194])
    }
  }

  // clouds (day-ish only)
  const cloudA = clamp01((0.5 - m.ambient) * 2.4)
  if (cloudA > 0.05) {
    for (let i = 0; i < 2; i++) {
      const drift = (tMs * (0.0011 + i * 0.0005)) % (WIN_IN.w + 22)
      const cx = WIN_IN.x - 12 + ((hash(i * 13 + 4) * 30 + drift) | 0)
      const cy = WIN_IN.y + 6 + Math.floor(hash(i * 5 + 8) * 20)
      const c: RGB = [245, 248, 255]
      t.blend(cx, cy, 10, 2, c, 0.4 * cloudA)
      t.blend(cx + 2, cy - 1, 6, 1, c, 0.4 * cloudA)
      t.blend(cx + 1, cy + 2, 8, 1, c, 0.3 * cloudA)
    }
  }

  t.unclip()

  // mullions
  t.fill(WIN_IN.x + 22, WIN.y, 2, WIN.h, [86, 60, 36])
  t.fill(WIN.x, WIN.y + 24, WIN.w, 2, [86, 60, 36])
  // inner frame light edge
  t.fill(WIN.x + 2, WIN.y + 2, WIN.w - 4, 1, [120, 86, 54])
  // sill
  t.fill(WIN.x - 3, WIN.y + WIN.h, WIN.w + 6, 3, [84, 56, 34])
  t.fill(WIN.x - 3, WIN.y + WIN.h, WIN.w + 6, 1, [112, 78, 48])
}

/** warm sun / cool moon beam falling from the window onto the floor */
function drawWindowShaft(t: PixelTarget, s: SceneState) {
  const m = s.mood
  const day = s.hour >= 6 && s.hour <= 18
  if (day && m.ambient > 0.2) return
  const warm: RGB = [255, 232, 180]
  const cool: RGB = [150, 170, 255]
  const c = day ? warm : cool
  const base = day ? 0.055 : 0.06 * m.stars
  if (base < 0.008) return
  let y = WIN.y + WIN.h + 3
  let x = WIN.x - 2
  let w = 60
  for (let i = 0; i < 7; i++) {
    t.add(x, y, w, 4, c, base * (1 - i / 8))
    y += 5
    x -= 2
    w += 6
  }
}

// ------------------------------ furniture ----------------------------------

function drawPoster(t: PixelTarget, tMs: number) {
  const x = 76, y = 26, w = 30, h = 38
  t.fill(x - 1, y - 1, w + 2, h + 2, [30, 28, 52])
  t.fill(x, y, w, h, [40, 34, 78])
  // crescent
  ellipse(t, x + 15, y + 14, 7, 7, "fill", [238, 226, 180])
  ellipse(t, x + 18, y + 12, 6, 6, "fill", [40, 34, 78])
  // poster stars twinkle gently
  for (let i = 0; i < 4; i++) {
    const a = 0.35 + 0.65 * Math.pow(Math.sin(tMs * 0.0012 + i * 1.7), 2)
    t.add(x + 5 + ((i * 7) % 20), y + 26 + ((i * 5) % 9), 1, 1, [220, 220, 255], a * 0.5)
  }
}

function drawShelf(t: PixelTarget) {
  const y = 40
  const books: [number, number, RGB][] = [
    [3, 11, [96, 70, 168]],
    [3, 13, [70, 132, 128]],
    [4, 10, [172, 96, 70]],
    [3, 12, [204, 192, 150]],
    [4, 11, [204, 164, 72]],
    [3, 13, [122, 64, 112]],
  ]
  let bx = 118
  for (const [bw, bh, c] of books) {
    t.fill(bx, y - bh, bw, bh, c)
    t.fill(bx, y - bh, bw, 1, scale(c, 1.25))
    bx += bw + 1
  }
  // little cactus
  t.fill(152, y - 4, 5, 4, [168, 92, 58])
  t.fill(153, y - 9, 3, 6, [92, 158, 80])
  t.fill(151, y - 7, 2, 2, [92, 158, 80])
  t.fill(156, y - 8, 2, 2, [82, 146, 72])
  // board
  t.fill(114, y, 46, 3, [88, 60, 38])
  t.fill(114, y + 3, 46, 1, [60, 40, 26])
}

function drawDresserAndMicrowave(t: PixelTarget, s: SceneState, tMs: number) {
  // dresser — warm wood
  t.fill(116, 86, 42, 24, [126, 84, 50])
  t.fill(116, 86, 42, 3, [148, 102, 62])
  t.fill(136, 89, 1, 19, [94, 62, 38])
  t.fill(116, 98, 42, 1, [96, 64, 38])
  t.fill(125, 93, 4, 1, [216, 196, 156])
  t.fill(146, 93, 4, 1, [216, 196, 156])
  t.fill(125, 103, 4, 1, [216, 196, 156])
  t.fill(146, 103, 4, 1, [216, 196, 156])
  t.fill(118, 110, 3, 3, [74, 50, 32])
  t.fill(153, 110, 3, 3, [74, 50, 32])

  // microwave — cream MCWV appliance, the room's pride
  const on = s.microOn
  t.fill(121, 85, 30, 1, [94, 62, 38]) // contact shadow
  t.fill(120, 73, 32, 13, [210, 208, 198])
  t.fill(120, 73, 32, 1, [232, 230, 220])
  t.fill(120, 84, 32, 2, [168, 166, 158])
  // door
  t.fill(123, 76, 20, 8, on ? [64, 44, 22] : [28, 30, 40])
  t.fill(123, 76, 20, 1, [180, 178, 170])
  if (on) {
    const pulse = 0.75 + 0.25 * Math.sin(tMs * 0.004)
    t.blend(123, 76, 20, 8, [255, 170, 70], 0.4 * pulse)
    ellipse(t, 133, 80, 4, 2, "blend", [255, 196, 110], 0.55)
    glow(t, 133, 81, 16, 8, [255, 160, 60], 0.12 * pulse)
  }
  // keypad + blinking colon clock
  t.fill(145, 76, 6, 8, [44, 46, 56])
  const blink = Math.floor(tMs / 1000) % 2 === 0
  t.fill(147, 78, 1, 1, [110, 255, 160])
  if (blink) t.fill(147, 80, 1, 1, [110, 255, 160])
}

function drawDesk(t: PixelTarget, s: SceneState, tMs: number) {
  // surface
  t.fill(DESK.x, DESK.y, DESK.w, 4, [142, 98, 60])
  t.fill(DESK.x, DESK.y, DESK.w, 1, [168, 120, 76])
  // legs
  t.fill(DESK.x + 2, DESK.y + 4, 3, 20, [104, 70, 44])
  t.fill(DESK.x + DESK.w - 5, DESK.y + 4, 3, 20, [104, 70, 44])

  // monitor
  const mx = 208, my = 62, mw = 23, mh = 20
  t.fill(mx + 9, my + mh, 3, 4, [58, 60, 70])
  t.fill(mx + 4, my + mh + 4, 13, 2, [58, 60, 70])
  t.fill(mx, my, mw, mh, [24, 26, 36])
  const awakeScreen = !s.sleeping
  if (awakeScreen) {
    t.fill(mx + 2, my + 2, mw - 4, mh - 4, [30, 44, 68])
    const lines: [number, number, number, RGB][] = [
      [4, 0, 12, [110, 220, 160]],
      [7, 2, 8, [150, 120, 230]],
      [10, 1, 14, [110, 170, 240]],
      [13, 3, 7, [230, 190, 90]],
    ]
    for (const [ly, off, len, c] of lines) {
      const wobble = Math.floor(tMs / 900 + ly) % 3 === 0 ? 1 : 0
      t.fill(mx + 3 + off, my + 3 + ly, len - wobble * 2, 1, c)
    }
    if (s.mood.ambient > 0.12) glow(t, mx + 11, my + 10, 20, 14, [150, 190, 255], 0.1)
  } else {
    t.fill(mx + 2, my + 2, mw - 4, mh - 4, [18, 20, 28])
    // standby LED — the monitor sleeps too
    const ledPulse = 0.5 + 0.5 * Math.sin(tMs * 0.0012)
    t.blend(mx + mw - 4, my + mh - 3, 1, 1, [255, 120, 80], 0.4 + 0.5 * ledPulse)
  }
  // keyboard
  t.fill(mx - 2, DESK.y - 2, 18, 2, [40, 42, 54])
}

function drawLamp(t: PixelTarget, s: SceneState) {
  const x = 164
  t.fill(x - 1, 74, 2, 36, [124, 112, 134])
  ellipse(t, x, 111, 6, 2, "fill", [90, 80, 104])
  if (s.lampOn) {
    // shade glows
    t.fill(x - 7, 64, 14, 2, [240, 200, 124])
    t.fill(x - 6, 66, 12, 2, [238, 196, 118])
    t.fill(x - 5, 68, 10, 4, [232, 188, 110])
    glow(t, x, 74, 30, 22, [255, 205, 110], 0.16)
    glow(t, x, 74, 14, 10, [255, 220, 140], 0.12)
  } else {
    t.fill(x - 7, 64, 14, 2, [150, 140, 160])
    t.fill(x - 6, 66, 12, 2, [144, 134, 154])
    t.fill(x - 5, 68, 10, 4, [138, 128, 148])
  }
}

function drawBed(t: PixelTarget) {
  // headboard
  t.fill(BED.x - 2, 74, 6, 38, [78, 52, 32])
  t.fill(BED.x - 2, 74, 6, 2, [98, 66, 40])
  // mattress
  t.fill(BED.x + 4, BED.y, BED.w - 4, 16, [218, 208, 188])
  t.fill(BED.x + 4, BED.y + 16, BED.w - 4, 2, [186, 176, 156])
  // pillow
  t.fill(BED.x + 8, BED.y - 2, 15, 8, [244, 240, 230])
  t.fill(BED.x + 8, BED.y - 2, 15, 1, [255, 252, 244])
  // blanket
  t.fill(BED.x + 26, BED.y - 1, BED.w - 30, 18, [108, 74, 158])
  t.fill(BED.x + 26, BED.y - 1, BED.w - 30, 2, [128, 92, 182])
  // bed skirt / shadow
  t.fill(BED.x + 4, 110, BED.w - 4, 3, [56, 46, 40])
  // footboard
  t.fill(BED.x + BED.w - 2, 84, 4, 28, [78, 52, 32])
  t.fill(BED.x + BED.w - 2, 84, 4, 2, [98, 66, 40])
}

function drawRug(t: PixelTarget) {
  ellipse(t, 126, 134, 42, 12, "fill", [76, 50, 112])
  ellipse(t, 126, 134, 36, 9, "fill", [104, 76, 146])
  ellipse(t, 126, 133, 27, 7, "fill", [130, 100, 172])
}

function drawCat(t: PixelTarget, tMs: number) {
  const x = 134, y = 126
  const body: RGB = [214, 176, 126] // ginger loaf
  const stripe: RGB = [176, 136, 88]
  const breathe = Math.sin(tMs * 0.0011) > -0.2 ? 1 : 0
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

function drawPlant(t: PixelTarget) {
  // pot in the corner left of the bed
  t.fill(3, 102, 11, 10, [156, 90, 58])
  t.fill(2, 100, 13, 3, [176, 106, 70])
  // leaves
  const g1: RGB = [92, 182, 98]
  const g2: RGB = [122, 206, 116]
  t.fill(5, 94, 3, 6, g1)
  t.fill(8, 90, 3, 10, g2)
  t.fill(11, 94, 2, 6, g1)
  t.fill(3, 96, 2, 4, g2)
}

/** tiny wall clock above the desk — shows REAL local time, 8-direction hands */
function drawWallClock(t: PixelTarget, now: Date) {
  const cx = 208, cy = 40
  ellipse(t, cx, cy, 6, 6, "fill", [30, 28, 44])
  ellipse(t, cx, cy, 5, 5, "fill", [236, 232, 220])
  // tick dots at 12/3/6/9
  t.fill(cx - 1, cy - 4, 1, 1, [70, 66, 60])
  t.fill(cx + 3, cy - 1, 1, 1, [70, 66, 60])
  t.fill(cx - 1, cy + 3, 1, 1, [70, 66, 60])
  t.fill(cx - 4, cy - 1, 1, 1, [70, 66, 60])

  const DIRS8: [number, number][] = [
    [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ]
  const minutes = now.getMinutes() + now.getSeconds() / 60
  const hours = (now.getHours() % 12) + minutes / 60
  const [hdx, hdy] = DIRS8[Math.round((hours / 12) * 8) % 8]
  const [mdx, mdy] = DIRS8[Math.round((minutes / 60) * 8) % 8]
  // hour hand (2px)
  t.fill(cx - 1 + hdx, cy - 1 + hdy, 1, 1, [40, 38, 36])
  // minute hand (3px)
  t.fill(cx - 1 + mdx, cy - 1 + mdy, 1, 1, [60, 58, 54])
  t.fill(cx - 1 + mdx * 2, cy - 1 + mdy * 2, 1, 1, [60, 58, 54])
  t.fill(cx - 1 + mdx * 3, cy - 1 + mdy * 3, 1, 1, [60, 58, 54])
  // hub
  t.fill(cx - 1, cy - 1, 1, 1, [150, 60, 60])
}

// ------------------------------ avatar -------------------------------------

function drawHead(t: PixelTarget, av: AvatarSpec, x: number, y: number, blink: boolean, yawning: boolean) {
  const hair = av.hairStyle === "beanie" ? av.hoodie : av.hair
  // face
  t.fill(x, y, 8, 8, av.skin)
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

function drawAvatarSitting(t: PixelTarget, av: AvatarSpec, tMs: number) {
  const x = SIT.x
  const blink = tMs % 3400 < 130
  const typePhase = Math.floor(tMs / 380) % 2 === 0

  // chair (behind avatar)
  t.fill(x - 3, 78, 3, 26, [88, 62, 130])
  t.fill(x - 3, 78, 9, 3, [100, 72, 146])
  t.fill(x - 2, 104, 2, 8, [60, 50, 70])
  ellipse(t, x, 111, 7, 2, "fill", [46, 40, 54])

  // legs + shoes tucked under the desk
  t.fill(x + 1, 96, 3, 12, scale(av.hoodie, 0.55))
  t.fill(x + 5, 96, 3, 12, scale(av.hoodie, 0.5))
  t.fill(x + 1, 108, 4, 2, [40, 36, 48])
  t.fill(x + 6, 108, 4, 2, [40, 36, 48])
  // knee pointing forward at the desk
  t.fill(x + 8, 96, 5, 7, scale(av.hoodie, 0.6))
  t.fill(x + 11, 103, 3, 6, scale(av.hoodie, 0.55))
  t.fill(x + 11, 109, 4, 2, [40, 36, 48])

  // torso (hoodie) — seated height
  t.fill(x, 80, 10, 16, av.hoodie)
  t.fill(x, 80, 10, 2, scale(av.hoodie, 1.18))
  // pocket
  t.fill(x + 3, 88, 4, 3, scale(av.hoodie, 0.85))

  // arms reaching right to keyboard — two-frame typing
  const armY = typePhase ? 84 : 85
  t.fill(x + 10, armY, 8, 3, av.hoodie)
  t.fill(x + 17, armY + 1, 3, 2, av.skin)

  drawHead(t, av, x + 1, 71, blink, false)
}

function drawAvatarStanding(t: PixelTarget, av: AvatarSpec, tMs: number, justWoke: boolean, yawning: boolean) {
  const x = STAND.x
  const blink = tMs % 3400 < 130

  // legs
  t.fill(x + 1, 96, 3, 14, scale(av.hoodie, 0.55))
  t.fill(x + 5, 96, 3, 14, scale(av.hoodie, 0.5))
  t.fill(x, 110, 4, 2, [40, 36, 48])
  t.fill(x + 5, 110, 4, 2, [40, 36, 48])

  // torso
  t.fill(x, 78, 9, 19, av.hoodie)
  t.fill(x, 78, 9, 2, scale(av.hoodie, 1.18))

  if (justWoke) {
    // stretch: both arms up
    const sway = Math.floor(tMs / 500) % 2 === 0 ? 1 : 0
    t.fill(x - 2, 74 - sway, 2, 8, av.hoodie)
    t.fill(x + 9, 74 - sway, 2, 8, av.hoodie)
    t.fill(x - 2, 73 - sway, 2, 2, av.skin)
    t.fill(x + 9, 73 - sway, 2, 2, av.skin)
  } else {
    // sleepy arms down / yawn arm
    t.fill(x - 1, 80, 2, 12, av.hoodie)
    t.fill(x + 8, 80, 2, 12, av.hoodie)
    if (yawning) {
      t.fill(x + 8, 78, 2, 3, av.hoodie)
      t.fill(x + 8, 76, 2, 2, av.skin)
    }
  }

  drawHead(t, av, x, 69, yawning ? false : blink, yawning)
}

function drawZ(t: PixelTarget, x: number, y: number, a: number) {
  const c: RGB = [200, 214, 255]
  t.blend(x, y, 3, 1, c, a)
  t.blend(x + 2, y + 1, 1, 1, c, a)
  t.blend(x + 1, y + 2, 1, 1, c, a)
  t.blend(x, y + 3, 3, 1, c, a)
}

function drawAvatarSleeping(t: PixelTarget, av: AvatarSpec, tMs: number) {
  // head on pillow
  const x = BED.x + 11
  const y = BED.y
  t.fill(x, y, 8, 6, av.skin)
  const hair = av.hairStyle === "beanie" ? av.hoodie : av.hair
  t.fill(x, y - 1, 8, 2, hair)
  if (av.hairStyle === "long") t.fill(x + 7, y, 1, 5, hair)
  // closed eye
  t.fill(x + 4, y + 3, 3, 1, [70, 55, 60])

  // blanket with breathing bump — rises over the sleeping body
  const breathe = Math.sin(tMs * 0.0012 * TAU) > -0.1 ? 1 : 0
  const bumpY = BED.y - 2 - breathe
  t.fill(BED.x + 26, bumpY, 54, 19 + (BED.y - 1 - bumpY), [108, 74, 158])
  t.fill(BED.x + 26, bumpY, 54, 2, [128, 92, 182])
  // blanket fold shadow near head
  t.fill(BED.x + 26, bumpY + 2, 3, 17, [92, 62, 138])

  // Z's drifting up from the head
  for (let i = 0; i < 3; i++) {
    const age = ((tMs + i * 1100) % 3300) / 3300
    const zx = x + 4 + Math.floor(age * 10)
    const zy = y - 6 - Math.floor(age * 14)
    const a = 0.75 * Math.sin(Math.PI * age)
    if (a > 0.08) drawZ(t, zx, zy, a)
  }
}

// ------------------------------ atmosphere ---------------------------------

function drawDust(t: PixelTarget, s: SceneState, tMs: number) {
  const vis = 0.16 + (0.4 - Math.min(0.4, s.mood.ambient)) * 0.5
  for (let i = 0; i < 12; i++) {
    const bx = hash(i * 11 + 3) * ROOM_W
    const by = 30 + hash(i * 17 + 6) * 100
    const x = Math.round(bx + Math.sin(tMs * 0.00021 + i * 2.1) * 14)
    const y = Math.round(by + Math.sin(tMs * 0.00013 + i * 1.3) * 8)
    const a = vis * (0.25 + 0.75 * Math.pow(Math.sin(tMs * 0.0009 + i * 1.9), 2))
    if (a > 0.04) t.add(x, y, 1, 1, [255, 246, 220], Math.min(0.5, a))
  }
}

function drawLighting(t: PixelTarget, s: SceneState) {
  const m = s.mood
  // world tint
  if (m.tintAmt > 0.01) t.mul(0, 0, ROOM_W, ROOM_H, m.tint, m.tintAmt)
  // darkness
  if (m.ambient > 0.005) t.mul(0, 0, ROOM_W, ROOM_H, [44, 50, 104], m.ambient)
  // vignette (stronger at night)
  const v = 0.1 + m.ambient * 0.3
  t.blend(0, 0, ROOM_W, 8, [10, 10, 26], v)
  t.blend(0, ROOM_H - 8, ROOM_W, 8, [8, 8, 22], v * 0.8)
  t.blend(0, 0, 6, ROOM_H, [10, 10, 26], v * 0.7)
  t.blend(ROOM_W - 6, 0, 6, ROOM_H, [10, 10, 26], v * 0.7)
}

// ------------------------------ main render --------------------------------

export function renderRoom(
  t: PixelTarget,
  now: Date,
  avatar: AvatarSpec = DEFAULT_AVATAR,
  prefs: AfkPrefs = DEFAULT_PREFS,
  tMs: number = Date.now()
) {
  const s = sceneStateAt(now, prefs)

  // walls + floor
  t.fill(0, 0, ROOM_W, ROOM_H, WALL)
  // subtle wall shading
  t.fill(0, 104, ROOM_W, 8, scale(WALL, 0.86))
  t.fill(0, 110, ROOM_W, 2, BASEBOARD)
  // floor
  t.fill(0, 112, ROOM_W, ROOM_H - 112, FLOOR)
  for (let y = 116; y < ROOM_H; y += 8) {
    t.fill(0, y, ROOM_W, 1, scale(FLOOR, 1.08))
    t.fill(0, y + 4, ROOM_W, 1, FLOOR_DARK)
  }
  // plank joints
  for (let x = 20; x < ROOM_W; x += 32) {
    t.fill(x, 112, 1, ROOM_H - 112, scale(FLOOR, 0.92))
  }

  drawWindow(t, s, tMs)
  drawWindowShaft(t, s)
  drawPoster(t, tMs)
  drawWallClock(t, now)
  drawShelf(t)
  drawDresserAndMicrowave(t, s, tMs)
  drawRug(t)
  drawPlant(t)
  drawBed(t)
  drawLamp(t, s)
  drawDesk(t, s, tMs)

  // the resident
  if (s.sleeping) drawAvatarSleeping(t, avatar, tMs)
  else if (s.standing) drawAvatarStanding(t, avatar, tMs, s.justWoke, s.yawning)
  else drawAvatarSitting(t, avatar, tMs)

  drawCat(t, tMs)
  drawDust(t, s, tMs)

  // final lighting pass
  drawLighting(t, s)
}
