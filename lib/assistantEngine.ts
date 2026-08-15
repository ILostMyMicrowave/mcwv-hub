import type { AskerContext, MemberLine, SharedWarContext, StandingRow } from "@/lib/warContext"

// ---------------------------------------------------------------------------
// Assistant rule engine — answers the known questions instantly, for free.
// Feel-quality layer: bare-word shortcuts, number words, multi-part questions,
// topic follow-ups ("and top 20?"), single-char typo repair, did-you-mean names.
// If nothing matches, handled=false and the caller shows the playbook summary.
// ---------------------------------------------------------------------------

export type AssistantCardData =
  | {
      type: "bars"
      title: string
      rows: { label: string; value: number; sub?: string; medal?: string; highlight?: boolean }[]
    }
  | { type: "progress"; title: string; current: number; target: number; sub?: string }
  | { type: "tiers"; title: string; currentRank: number; rows: { best: number; worst: number; label: string }[]; headline?: string; sub?: string }

export type EngineResult = {
  handled: boolean
  text: string
  chips: string[]
  topic?: string
  card?: AssistantCardData
}

const DEFAULT_CHIPS = ["How are we doing?", "What do we win?", "Who's carrying?"]

const ok = (text: string, chips: string[], topic?: string): EngineResult => ({
  handled: true,
  text,
  chips,
  ...(topic ? { topic } : {}),
})

const withCard = (result: EngineResult, card?: AssistantCardData): EngineResult =>
  card ? { ...result, card } : result

const notHandled: EngineResult = { handled: false, text: "", chips: [] }

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "?" : Math.round(value).toLocaleString("en-GB")

function fmtDuration(ms: number | null) {
  if (ms === null || ms <= 0) return "?"
  const total = Math.round(ms / 60000)
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function usIndex(shared: SharedWarContext) {
  return shared.standings.findIndex((row) => row.name.toUpperCase() === "MCWV")
}

function standingAt(shared: SharedWarContext, rank: number): StandingRow | null {
  return shared.standings.find((row) => row.rank === rank) ?? null
}

function memberLookup(shared: SharedWarContext, name: string): MemberLine | null {
  const lower = name.toLowerCase()
  return (
    shared.members.find((row) => row.username.toLowerCase() === lower) ??
    shared.members.find((row) => row.username.toLowerCase().startsWith(lower)) ??
    shared.members.find((row) => row.username.toLowerCase().includes(lower)) ??
    null
  )
}

// --- did-you-mean: bounded Levenshtein over the roster ----------------------

function levenshteinUpTo(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  if (max <= 0) return a === b ? 0 : 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

function closestMember(shared: SharedWarContext, name: string): MemberLine | null {
  const lower = name.toLowerCase()
  const maxDist = Math.max(1, Math.min(3, Math.floor(name.length / 3)))
  let best: MemberLine | null = null
  let bestDist = maxDist + 1
  for (const row of shared.members) {
    const d = levenshteinUpTo(lower, row.username.toLowerCase(), Math.min(maxDist, bestDist - 1))
    if (d < bestDist) {
      best = row
      bestDist = d
    }
  }
  return best && bestDist <= maxDist ? best : null
}

// --- message prep: bare shortcuts, number words, typo repair -----------------

const BARE_WORDS: Record<string, string> = {
  rank: "our rank",
  place: "our rank",
  position: "our rank",
  points: "clan points",
  stats: "my stats",
  status: "status",
  rewards: "what do we win",
  prize: "what do we win",
  prizes: "what do we win",
  loot: "what do we win",
  recap: "recap",
  summary: "recap",
  news: "status",
  countdown: "time left",
  timer: "time left",
  leaderboard: "top scorers",
  scoreboard: "top scorers",
  zeros: "who's on zero",
  projection: "projection",
  forecast: "projection",
  top: "can we make top 10",
  mvp: "who's carrying",
  tips: "tips",
  members: "how many members",
  roster: "how many members",
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100,
}

// Words that must be right for the rules to hear you — repair target list (4+ letters).
const CORE_WORDS = [
  "battle", "points", "point", "rank", "ranked", "place", "rewards", "reward",
  "prizes", "winning", "losing", "status", "recap", "summary", "stats", "score",
  "scores", "scorers", "carrying", "start", "starts", "next", "last", "members",
  "member", "roster", "leaderboard", "tips", "projection", "projected", "predict",
  "forecast", "above", "below", "zero", "countdown", "time", "left", "help",
  "clan", "gaps", "pace", "movers", "surging", "hour", "daily", "grind",
  "doing", "going",
]

function editDistOne(a: string, b: string): boolean {
  const diff = a.length - b.length
  if (diff === 0) {
    let mismatches = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        // adjacent-letter swap counts as one typo
        if (
          mismatches === 0 &&
          i + 1 < a.length &&
          a[i] === b[i + 1] &&
          a[i + 1] === b[i] &&
          a.slice(i + 2) === b.slice(i + 2)
        ) {
          return true
        }
        mismatches++
        if (mismatches > 1) return false
      }
    }
    return mismatches === 1
  }
  if (Math.abs(diff) !== 1) return false
  const shorter = diff < 0 ? a : b
  const longer = diff < 0 ? b : a
  let i = 0
  let j = 0
  let skipped = false
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++
      j++
      continue
    }
    if (skipped) return false
    skipped = true
    j++
  }
  return true
}

function repairTypos(msg: string): string {
  // tiny words (<=3 chars) only repair toward this safe list; longer words use CORE_WORDS
  const SHORT_CORE = ["how", "are", "does", "can", "will", "when", "win", "war", "is", "do", "we"]
  return msg
    .split(/(\s+)/)
    .map((token) => {
      if (/[^a-z]/.test(token) || token.length < 2) return token
      if (token.length <= 3) {
        if (SHORT_CORE.includes(token)) return token
        return SHORT_CORE.find((word) => editDistOne(token, word)) ?? token
      }
      if (CORE_WORDS.includes(token)) return token
      return CORE_WORDS.find((word) => editDistOne(token, word)) ?? token
    })
    .join("")
}

function stripTail(msg: string) {
  return msg.replace(/[?!.\s…]+$/, "").trim()
}

function prepare(raw: string): string {
  let msg = stripTail(raw.toLowerCase().trim())
  // "top twenty five" → "top 25", "top ten" → "top 10" (scoped to "top" so names stay intact)
  msg = msg.replace(
    /\btop[ -]?(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/,
    (_, tens: string, ones: string) => `top ${NUMBER_WORDS[tens] + NUMBER_WORDS[ones]}`
  )
  msg = msg.replace(
    /\btop[ -]?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/,
    (_, word: string) => `top ${NUMBER_WORDS[word]}`
  )
  if (BARE_WORDS[msg]) msg = BARE_WORDS[msg]
  return msg
}

const STOP_WORDS = new Set([
  "we", "the", "our", "clan", "i", "me", "us", "war", "battle", "mcwv",
  "and", "what", "about", "how", "who", "are", "is", "do", "does", "did",
  ...Object.keys(BARE_WORDS),
])

// ---------------------------------------------------------------------------
// Shared answer builders
// ---------------------------------------------------------------------------

function noWarLine(shared: SharedWarContext) {
  if (shared.active) return ""
  return `No war on right now — we're between battles (next one drops with the next event). `
}

function rewardsAtRank(shared: SharedWarContext, rank: number): string[] {
  return shared.rewards
    .filter((tier) => rank >= tier.best && rank <= tier.worst)
    .map((tier) => tier.label)
}

function nextTierUp(shared: SharedWarContext, rank: number) {
  const groups = new Map<string, { best: number; worst: number }>()
  for (const tier of shared.rewards) {
    const key = `${tier.best}-${tier.worst}`
    groups.set(key, { best: tier.best, worst: tier.worst })
  }
  const sorted = [...groups.values()].sort((a, b) => a.best - b.best)
  const current = sorted.find((group) => rank >= group.best && rank <= group.worst)
  if (!current) return null
  const idx = sorted.findIndex((group) => group === current)
  return idx > 0 ? sorted[idx - 1] : null
}

function statusAnswer(shared: SharedWarContext): string {
  if (!shared.active) {
    const bits = [
      noWarLine(shared),
      shared.battleId ? `Last battle: **${shared.battleId}**.` : "",
      shared.contributors ? `We finished with **${shared.contributors} scorers**` : "",
      shared.clanPoints !== null ? ` on **${fmt(shared.clanPoints)}** pts.` : ".",
      "Rest while you can — when the next battle drops, we go again 😤",
    ]
    return bits.join("")
  }

  const parts = [
    `We're **${shared.clanRank !== null ? `#${shared.clanRank}` : "unranked"}**`,
    shared.clanPoints !== null ? ` with **${fmt(shared.clanPoints)}** pts` : "",
    shared.gainLastHour !== null ? ` — **+${fmt(shared.gainLastHour)}** in the last hour` : "",
    shared.gainLast24h !== null ? ` (**+${fmt(shared.gainLast24h)}** in 24h)` : "",
    `.`,
  ]
  let out = parts.join("")

  const idx = usIndex(shared)
  const ourRate = shared.hourlyRate
  if (idx > 0) {
    const above = shared.standings[idx - 1]
    out += `\n\nThe clan above us is **${above.name}**, ${fmt(above.points - (shared.clanPoints ?? 0))} pts ahead.`
    if (above.pph !== null && ourRate !== null) {
      const net = ourRate - above.pph
      if (net > 0) out += ` We're out-pacing them (~${fmt(net)}/h net) — closing the gap.`
      else if (net < 0) out += ` They're pulling away (~${fmt(-net)}/h net) — we need more pace.`
      else out += ` Dead even on pace (~${fmt(ourRate)}/h each).`
    } else if (above.pph !== null && above.pph > 0) {
      out += ` They're gaining ~${fmt(above.pph)}/h.`
    }
  }
  if (idx >= 0 && idx < shared.standings.length - 1) {
    const below = shared.standings[idx + 1]
    out += ` **${below.name}** is ${fmt((shared.clanPoints ?? 0) - below.points)} pts behind us.`
    if (below.pph !== null && ourRate !== null) {
      const net = below.pph - ourRate
      if (net > 0) out += ` They're gaining on us (~${fmt(net)}/h net) — watch our back.`
      else if (net < 0) out += ` We're pulling away (~${fmt(-net)}/h net).`
    } else if (below.pph !== null && below.pph > 0) {
      out += ` They're gaining ~${fmt(below.pph)}/h.`
    }
  }
  out += `\n\n⏳ **${fmtDuration(shared.timeLeftMs)}** left on the clock.`
  return out
}

function chaseAnswer(shared: SharedWarContext, target: number): string {
  if (!shared.active) return noWarLine(shared) + "Ask me again when the next war kicks off and I'll do the maths 🔥"
  if (shared.clanRank === null || shared.clanPoints === null) {
    return "I can't see our live placement right now — try again in a bit."
  }
  if (target <= 0) target = 10
  if (shared.clanRank <= target) {
    return `We're already **#${shared.clanRank}** — top ${target} is ours to lose 😤 Defend it: keep the hourly pace up and watch who's behind us.`
  }
  const targetRow = standingAt(shared, target)
  if (!targetRow) {
    return `I can only see the top ${shared.standings.length} clans and we're #${shared.clanRank} — top ${target} isn't in my data.`
  }
  const gap = targetRow.points - shared.clanPoints
  const ourRate = shared.hourlyRate
  const theirPph = targetRow.pph // null when we have no rival pace data yet
  const hoursLeft = shared.timeLeftMs !== null ? shared.timeLeftMs / 3_600_000 : null

  let out = `Top ${target} is **${targetRow.name}** on ${fmt(targetRow.points)} pts — we're **${fmt(gap)}** behind.`
  if (theirPph !== null && theirPph > 0) {
    out += ` They're gaining ~${fmt(theirPph)}/h.`
  }

  // True closing rate = our pace minus the rival's pace. When we have no rival
  // pace data, fall back to treating them as static (the old behaviour).
  const rivalPace = theirPph ?? 0
  const netRate = ourRate !== null ? ourRate - rivalPace : null
  const eta = netRate !== null && netRate > 0 ? gap / netRate : null

  if (ourRate === null) {
    out += `\n\nI don't have a solid pace reading yet — check back after the bot's next snapshots land.`
  } else if (netRate !== null && netRate <= 0) {
    const rivalLine = theirPph !== null && theirPph > 0
      ? `matching/beating that at ~${fmt(theirPph)}/h`
      : "holding steady"
    out += `\n\nWe're ~${fmt(ourRate)}/h but ${targetRow.name} is ${rivalLine} — we're **not closing the gap** at this pace. We need to step it up. 😤`
  } else if (eta !== null && hoursLeft !== null) {
    const paceDetail = theirPph !== null
      ? `Net pace ~${fmt(netRate)}/h (${fmt(ourRate)}/h vs their ${fmt(theirPph)}/h)`
      : `At our current pace (~${fmt(ourRate)}/h)`
    out += eta <= hoursLeft
      ? `\n\n${paceDetail} we'd catch them in **~${Math.ceil(eta)}h** with ${fmtDuration(shared.timeLeftMs)} to go — **yes, it's on.** 🔥`
      : `\n\n${paceDetail} that's **~${Math.ceil(eta)}h** of grinding with only ${fmtDuration(shared.timeLeftMs)} left — we need to speed up. Wake the zeros up 😅`
  } else {
    out += `\n\nI don't have a solid pace reading yet — check back after the bot's next snapshots land.`
  }
  return out
}

// Project final rank accounting for rival pace: rivals with a known PPH are
// extrapolated to the war's end (current + pph * hoursLeft), then we count how
// many finish ahead of our projected total. Rivals without PPH keep their
// current points. Falls back to the static projectedRankIfPaceHolds when no
// rival has pace data (same answer the old code gave).
function projectedRankRivalAware(shared: SharedWarContext): number | null {
  if (shared.projectedFinalPoints === null) return null
  if (shared.timeLeftMs === null) return shared.projectedRankIfPaceHolds
  const ourIdx = usIndex(shared)
  const hoursLeft = shared.timeLeftMs / 3_600_000
  const hasRivalPace = shared.standings.some(
    (row, i) => i !== ourIdx && row.pph !== null && row.pph > 0
  )
  if (!hasRivalPace) return shared.projectedRankIfPaceHolds
  const ourFinal = shared.projectedFinalPoints
  const ahead = shared.standings.filter((row, i) => {
    if (i === ourIdx) return false
    const rivalFinal = row.pph !== null && row.pph > 0
      ? row.points + row.pph * hoursLeft
      : row.points
    return rivalFinal > ourFinal
  })
  return 1 + ahead.length
}

function projectionAnswer(shared: SharedWarContext): string {
  if (!shared.active) return noWarLine(shared) + "Once a war starts I'll project our final placement."
  if (shared.projectedFinalPoints === null) {
    return "Too early to call — I need a bit more pace data. Ask me after the next hourly snapshot."
  }
  const projRank = projectedRankRivalAware(shared)
  const hasRivalPace = shared.standings.some((row) => row.pph !== null && row.pph > 0)
  let out = `If everyone holds pace: we finish on roughly **${fmt(shared.projectedFinalPoints)}** pts`
  if (projRank !== null) {
    out += `, good for about **${ordinal(projRank)} place**`
  }
  out += `.\n\n`
  out += hasRivalPace
    ? `_That accounts for rival pace too — clans charging hard are extrapolated to the war's end. Still a vibe-check, not a prophecy 🔮_`
    : `_Caveat: pace isn't destiny — other clans push hard in the final hours too. Treat it as a vibe-check, not a prophecy 🔮_`

  const rewards = projRank ? rewardsAtRank(shared, projRank) : []
  if (rewards.length) out += `\n\n💎 That placement currently means: **${rewards.join(" + ")}**.`
  return out
}

function rewardsAnswer(shared: SharedWarContext): string {
  const hasRewards =
    shared.rewards.length > 0 ||
    Boolean(shared.headlineReward) ||
    shared.contributorRewards.length > 0
  if (!hasRewards) {
    return "The game hasn't exposed this war's reward table to me — usually it's huge/titanic pets for the top ranks and a clan gift for the top 500."
  }

  const parts: string[] = []
  if (shared.headlineReward) {
    parts.push(`🏆 **Headline prize:** ${shared.headlineReward} — goes to the winning clan's top contributor.`)
  }

  const rank = projectedRankRivalAware(shared) ?? shared.clanRank
  if (rank === null) {
    parts.push("I can't see our placement yet, so I can't say which tier we're in. Ask me once the war's underway.")
    return parts.join("\n\n")
  }

  const current = rewardsAtRank(shared, rank)
  parts.push(`At **#${rank}** we'd take home: **${current.join(" + ") || "nothing 😅"}** 💎`)
  const better = nextTierUp(shared, rank)
  if (better) {
    const boundaryRow = standingAt(shared, better.worst)
    const gap = boundaryRow && shared.clanPoints !== null ? boundaryRow.points - shared.clanPoints : null
    parts.push(`One tier up (${ordinal(better.best)}–${ordinal(better.worst)}): **${rewardsAtRank(shared, better.best).join(" + ")}**${gap !== null && gap > 0 ? ` — that's ${fmt(gap)} pts away 👀` : "."}`)
  }

  if (shared.contributorRewards.length) {
    const bands = shared.contributorRewards
      .map((band) => `**${band.best === band.worst ? `rank ${band.best}` : `top ${band.worst}`} → ${band.label}**`)
      .join(" · ")
    parts.push(`Members also earn by contributor rank: ${bands}.`)
  }
  return parts.join("\n\n")
}

function carryingAnswer(shared: SharedWarContext): string {
  if (!shared.topScorers.length) {
    return "No score data yet — once the war starts I'll name and shame the carries 💪"
  }
  const lines = shared.topScorers
    .slice(0, 5)
    .map((row, i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} **${row.username}** — ${fmt(row.points)} pts`)
  const totalPoints = shared.clanPoints
  const top5Total = shared.topScorers.slice(0, 5).reduce((sum, row) => sum + row.points, 0)
  let out = `Top of the war right now:\n${lines.join("\n")}`
  if (totalPoints && totalPoints > 0) {
    out += `\n\nBetween them: ${fmt(top5Total)} pts — **${Math.round((top5Total / totalPoints) * 100)}% of the clan**. Heavy lifters 🏋️`
  }
  return out
}

function moversAnswer(shared: SharedWarContext): string {
  if (!shared.movers.length) {
    return "Nobody's put up notable gains in the last 24h (or I don't have the data yet). War on? 😴"
  }
  const lines = shared.movers
    .slice(0, 5)
    .map((row, i) => `${i + 1}. **${row.username}** — +${fmt(row.gain24h)} pts (now on ${fmt(row.points)})`)
  return `Biggest climbers in the last 24h 📈\n${lines.join("\n")}\n\nMomentum merchants.`
}

function zerosAnswer(shared: SharedWarContext, officer: boolean): string {
  if (!shared.active) return noWarLine(shared) + "Zeros only matter mid-war — I'll keep the receipts for next time 🧾"
  if (shared.zeroCount === 0) {
    return "Literally **zero zeros** — everyone linked has scored. Beautiful sight 🥹"
  }
  if (!officer) {
    return `There are **${shared.zeroCount} members on 0 points** 👀 Names are officer business, but if YOU'RE one of them... you know what to do 😅`
  }
  return `Officer eyes only 🤫 Currently on **0 pts**: ${shared.zeroNames.join(", ")}${shared.zeroCount > shared.zeroNames.length ? ` and ${shared.zeroCount - shared.zeroNames.length} more` : ""}.\n\nGentle nudge via /broadcast? That's literally what the zero-pointer audience is for 🎯`
}

// --- card builders: data-drawn visuals attached to answers -----------------

const MEDALS = ["🥇", "🥈", "🥉"]

function scorerBarsCard(shared: SharedWarContext, title: string): AssistantCardData | undefined {
  const rows = shared.topScorers.slice(0, 5).map((row, index) => ({
    label: row.username,
    value: row.points,
    medal: MEDALS[index] ?? `#${index + 1}`,
    ...(row.gain24h !== null && row.gain24h > 0 ? { sub: `+${fmt(row.gain24h)} last 24h` } : {}),
  }))
  return rows.length ? { type: "bars" as const, title, rows } : undefined
}

function standingsCard(shared: SharedWarContext): AssistantCardData | undefined {
  const idx = usIndex(shared)
  if (!shared.active || shared.clanRank === null || idx < 0) return undefined
  const picks = [shared.standings[idx - 1], shared.standings[idx], shared.standings[idx + 1]].filter(
    (row): row is StandingRow => Boolean(row)
  )
  if (picks.length < 2) return undefined
  return {
    type: "bars" as const,
    title: "Standings around us",
    rows: picks.map((row) => ({
      label: `#${row.rank} ${row.name}${row.pph ? ` · ${fmt(row.pph)}/h` : ""}`,
      value: row.points,
      highlight: row.name.toUpperCase() === "MCWV",
    })),
  }
}

function tiersCard(shared: SharedWarContext): AssistantCardData | undefined {
  const rank = projectedRankRivalAware(shared) ?? shared.clanRank
  if (!shared.rewards.length || rank === null) return undefined
  const better = nextTierUp(shared, rank)
  const boundaryRow = better ? standingAt(shared, better.worst) : null
  const gap = boundaryRow && shared.clanPoints !== null ? boundaryRow.points - shared.clanPoints : null
  const contributorNote = shared.contributorRewards.length
    ? shared.contributorRewards
        .map((band) => `top ${band.worst} → ${band.label}`)
        .join(" · ")
    : null
  const subParts = [
    gap !== null && gap > 0 ? `${fmt(gap)} pts to the next tier 👀` : null,
    contributorNote,
  ].filter((p): p is string => Boolean(p))
  return {
    type: "tiers" as const,
    title: "Reward tiers",
    currentRank: rank,
    rows: shared.rewards.slice(0, 6).map((tier) => ({ best: tier.best, worst: tier.worst, label: tier.label })),
    ...(shared.headlineReward ? { headline: `🏆 ${shared.headlineReward}` } : {}),
    ...(subParts.length ? { sub: subParts.join(" · ") } : {}),
  }
}

function raceCard(shared: SharedWarContext, target: number): AssistantCardData | undefined {
  if (!shared.active || shared.clanRank === null || shared.clanPoints === null) return undefined
  if (shared.clanRank <= target) return undefined
  const targetRow = standingAt(shared, target)
  if (!targetRow) return undefined
  const gap = targetRow.points - shared.clanPoints
  return {
    type: "progress" as const,
    title: `Race to top ${target}`,
    current: shared.clanPoints,
    target: targetRow.points,
    sub: `${fmt(gap)} pts behind${shared.hourlyRate ? ` · pace ~${fmt(shared.hourlyRate)}/h` : ""}`,
  }
}

// Person race card: the runner above, the person, the runner behind — bars.
function personRaceCard(
  shared: SharedWarContext,
  targetRobloxId: string,
  self: boolean
): AssistantCardData | undefined {
  const scored = shared.members.filter((row) => row.points > 0)
  const index = scored.findIndex((row) => row.robloxId === targetRobloxId)
  if (index < 0) return undefined
  const picks = [scored[index - 1], scored[index], scored[index + 1]].filter(
    (row): row is MemberLine => Boolean(row)
  )
  if (picks.length < 2) return undefined
  return {
    type: "bars" as const,
    title: self ? "Your race" : `${scored[index].username}'s race`,
    rows: picks.map((row) => ({
      label: self && row.robloxId === targetRobloxId ? `${row.username} (you)` : row.username,
      value: row.points,
      ...(row.gain24h !== null && row.gain24h > 0 ? { sub: `+${fmt(row.gain24h)} last 24h` } : {}),
      highlight: row.robloxId === targetRobloxId,
    })),
  }
}

function momentumCard(shared: SharedWarContext): AssistantCardData | undefined {
  if (!shared.active || !shared.movers.length) return undefined
  return {
    type: "bars" as const,
    title: "Biggest movers · last 24h",
    rows: shared.movers.slice(0, 5).map((row) => ({
      label: row.username,
      value: row.gain24h ?? 0,
      sub: `now on ${fmt(row.points)} pts`,
    })),
  }
}

function projectionCard(shared: SharedWarContext): AssistantCardData | undefined {
  if (!shared.active || shared.projectedFinalPoints === null || shared.clanPoints === null) return undefined
  return {
    type: "progress" as const,
    title: "Pace vs projection",
    current: shared.clanPoints,
    target: shared.projectedFinalPoints,
    sub: `${fmt(shared.projectedFinalPoints - shared.clanPoints)} pts to go${shared.projectedRankIfPaceHolds !== null ? ` · on pace for ≈ #${shared.projectedRankIfPaceHolds}` : ""}`,
  }
}

// --- history brain helpers --------------------------------------------------

type WarBookEntry = { title: string; clanPoints: number; scorers: number; live: boolean }

function warBook(shared: SharedWarContext): WarBookEntry[] {
  const book: WarBookEntry[] = []
  if (shared.active && shared.battleId) {
    const title = shared.battleId.replace(/battle\s*\d*/gi, "").trim() || shared.battleId
    book.push({ title, clanPoints: shared.clanPoints ?? 0, scorers: shared.contributors ?? 0, live: true })
  }
  for (const entry of shared.history) {
    book.push({ title: entry.title, clanPoints: entry.clanPoints, scorers: entry.scorers, live: false })
  }
  return book
}

function warBarsCard(book: WarBookEntry[], title: string): AssistantCardData | undefined {
  if (!book.length) return undefined
  return {
    type: "bars" as const,
    title,
    rows: book.slice(0, 6).map((entry) => ({
      label: `${entry.title}${entry.live ? " 🔴" : ""}`,
      value: entry.clanPoints,
      sub: `${entry.scorers} scorers${entry.live ? " · live" : ""}`,
      highlight: entry.live,
    })),
  }
}

function recordsAnswer(shared: SharedWarContext): EngineResult {
  const book = warBook(shared)
  if (!book.length) return ok("No war history on record yet — fight one and I'll start the record book 📖", DEFAULT_CHIPS)
  const bestHaul = [...book].sort((a, b) => b.clanPoints - a.clanPoints)[0]
  const mostScorers = [...book].sort((a, b) => b.scorers - a.scorers)[0]
  const recordCarry = shared.history.reduce<{ username: string; points: number; title: string } | null>(
    (best, entry) =>
      entry.topUsername && entry.topPoints !== null && (!best || entry.topPoints > best.points)
        ? { username: entry.topUsername, points: entry.topPoints, title: entry.title }
        : best,
    null
  )
  const bits = [
    `**All-time record book** 📖`,
    ``,
    `💥 Best haul: **${bestHaul.title}** — **${fmt(bestHaul.clanPoints)} pts**${bestHaul.live ? " 🔴 and still counting" : ""}`,
    `👥 Most scorers: **${mostScorers.title}** — **${mostScorers.scorers} people** on the board`,
  ]
  if (recordCarry) {
    bits.push(`🥇 Biggest single-war carry: **${recordCarry.username}** — **${fmt(recordCarry.points)} pts** in ${recordCarry.title}`)
  }
  return withCard(ok(bits.join("\n"), ["Compare wars", "My best war", "War history"]), warBarsCard(book, "Clan points per war"))
}

function compareAnswer(shared: SharedWarContext): EngineResult {
  const book = warBook(shared)
  if (book.length < 2) {
    return ok("I need at least two wars on the books to compare — go make history first ⚔️", ["War history", "How are we doing?"])
  }
  const [a, b] = book
  const ptsDelta = a.clanPoints - b.clanPoints
  const scorerDelta = a.scorers - b.scorers
  const ptsPct = b.clanPoints > 0 ? Math.round((ptsDelta / b.clanPoints) * 100) : null
  const verdict =
    ptsDelta > 0
      ? `${a.live ? "We're already past last war's FINAL total" : "That war beat the one before"}${ptsPct !== null ? ` — **+${ptsPct}%**` : ""} 🔥`
      : ptsDelta < 0
        ? `${a.live ? "Still" : "It finished"} **${fmt(Math.abs(ptsDelta))} pts** behind the previous mark${a.live ? " — chase it down before the clock dies 😤" : ""}`
        : "Dead level with the previous war — spooky 👻"
  const lines = [
    `⚖️ **${a.title}${a.live ? " 🔴 so far" : ""}** vs **${b.title}**`,
    ``,
    `Points: **${fmt(a.clanPoints)}** vs ${fmt(b.clanPoints)} (${ptsDelta >= 0 ? "+" : "−"}${fmt(Math.abs(ptsDelta))})`,
    `Scorers: **${a.scorers}** vs ${b.scorers} (${scorerDelta >= 0 ? "+" : "−"}${Math.abs(scorerDelta)})`,
    ``,
    verdict,
  ]
  return withCard(ok(lines.join("\n"), ["Record book", "How are we doing?", "War history"]), warBarsCard([a, b], "War vs war"))
}

function myHistoryAnswer(shared: SharedWarContext, asker: AskerContext): EngineResult {
  const rows: { title: string; points: number; live: boolean }[] = []
  if (shared.active && asker.inRoster && asker.points !== null) {
    const title = (shared.battleId ?? "This war").replace(/battle\s*\d*/gi, "").trim() || "This war"
    rows.push({ title, points: asker.points, live: true })
  }
  for (const war of asker.wars) rows.push({ title: war.title, points: war.points, live: false })
  if (!rows.length) {
    return ok(
      `No finished wars on your record yet, ${asker.username} — fight one and I'll chart your arc 📈`,
      DEFAULT_CHIPS
    )
  }
  const best = [...rows].sort((a, b) => b.points - a.points)[0]
  const trend = rows.length >= 2 ? rows[0].points - rows[1].points : null
  const bits = [
    `Your personal war arc, ${asker.username} 📈`,
    ``,
    ...rows.slice(0, 5).map((row) => `• **${row.title}**${row.live ? " 🔴 so far" : ""} — **${fmt(row.points)} pts**`),
  ]
  bits.push(
    ``,
    `🏆 Personal best: **${best.title}** with **${fmt(best.points)} pts**${best.live ? " — and you're still writing it!" : ""}`
  )
  if (trend !== null) {
    bits.push(
      trend >= 0
        ? `📈 Trend: **+${fmt(trend)} pts** up on last war — levelling up!`
        : `📉 Trend: ${fmt(Math.abs(trend))} pts below last war — revenge arc loading...`
    )
  }
  return withCard(ok(bits.join("\n"), ["Record book", "My stats", "Compare wars"]), {
    type: "bars" as const,
    title: "Your points per war",
    rows: rows.slice(0, 6).map((row) => ({ label: `${row.title}${row.live ? " 🔴" : ""}`, value: row.points, highlight: row.live })),
  })
}

function historyListAnswer(shared: SharedWarContext): EngineResult {
  if (!shared.history.length) {
    return ok("The history book is blank so far — wars we fight get written in automatically 📖", DEFAULT_CHIPS)
  }
  const lines = shared.history.slice(0, 5).map(
    (entry, index) =>
      `${index + 1}. **${entry.title}** — **${fmt(entry.clanPoints)} pts** · ${entry.scorers} scorers${entry.topUsername ? ` · 🥇 ${entry.topUsername}` : ""}`
  )
  return withCard(
    ok(`The MCWV history book, newest first:\n\n${lines.join("\n")}`, ["Record book", "Compare wars", "My best war"]),
    warBarsCard(warBook(shared), "Clan points per war")
  )
}

function playerAnswer(shared: SharedWarContext, member: MemberLine): string {
  const scored = shared.members.filter((row) => row.points > 0)
  const index = scored.findIndex((row) => row.robloxId === member.robloxId)
  const rank = index >= 0 ? index + 1 : null
  let out = `**${member.username}**: **${fmt(member.points)}** pts this war`
  if (rank !== null) {
    out += ` — **${ordinal(rank)}** in the clan`
    if (index > 0) {
      const above = scored[index - 1]
      out += `, ${fmt(above.points - member.points)} pts behind ${above.username}`
    }
  } else if (member.points <= 0) {
    out += ` — hasn't scored yet 💀`
  }
  if (member.gain24h !== null && member.gain24h > 0) out += `\nGained **+${fmt(member.gain24h)}** in the last 24h 📈`
  return out
}

function myStatsAnswer(shared: SharedWarContext, asker: AskerContext): string {
  if (!asker.inRoster || asker.points === null) {
    return `I couldn't find you in this war's data, ${asker.username} — not linked yet or the game hasn't logged your first points. If you're linked, score 1 point and I'll see you 👀`
  }
  let out = `You, ${asker.username}: **${fmt(asker.points)}** pts`
  if (asker.rank !== null) out += `, **${ordinal(asker.rank)}** in the clan`
  out += `.`
  if (asker.nextPlayer && asker.gapToNext !== null) {
    out += `\n\nYou're **${fmt(asker.gapToNext)}** pts behind **${asker.nextPlayer}** — catchable? Very 😏`
  } else if (asker.rank === 1) {
    out += `\n\nYou're **top of the clan** 👑 — everyone behind you is chasing YOUR shadow`
  }
  if (asker.gain24h !== null && asker.gain24h > 0) out += `\n\n📈 +${fmt(asker.gain24h)} in the last 24h — keep that pace`
  return out
}

// Player lookup shared by name intents + follow-ups, with did-you-mean.
function playerResponse(shared: SharedWarContext, name: string, chips: string[]): EngineResult {
  const member = memberLookup(shared, name)
  if (member) {
    return withCard(
      ok(playerAnswer(shared, member), chips, `player:${member.username}`),
      personRaceCard(shared, member.robloxId, false)
    )
  }
  const suggestion = closestMember(shared, name)
  if (suggestion) {
    return withCard(
      ok(
        `Can't find anyone called **"${name}"** — did you mean **${suggestion.username}**? 👀\n\n${playerAnswer(shared, suggestion)}`,
        chips,
        `player:${suggestion.username}`
      ),
      personRaceCard(shared, suggestion.robloxId, false)
    )
  }
  return ok(
    `Can't find anyone called **"${name}"** in this war's data — check the spelling, or they haven't scored yet 👻`,
    chips
  )
}

// ---------------------------------------------------------------------------
// The matcher — one message part in, one answer out (or handled=false).
// ---------------------------------------------------------------------------

function matchOne(
  msg: string,
  shared: SharedWarContext,
  asker: AskerContext,
  officer: boolean,
  topic?: string
): EngineResult {
  // Greeting (also used for the panel's opening message)
  if (msg === "__hello__" || /^(hi|hey|hello|yo|hiya|sup|wag1|morning|afternoon|evening)\b/.test(msg)) {
    const warBit = shared.active
      ? `War's LIVE — we're ${shared.clanRank !== null ? `#${shared.clanRank}` : "unranked"} with **${fmtDuration(shared.timeLeftMs)}** left ⚔️`
      : `No war on right now — calm before the storm 😌`
    return ok(
      `Yo ${asker.username}! 💜 ${warBit}\n\nAsk me anything about the war — placements, gaps, rewards, who's carrying, who's slacking (officers see names 👀).`,
      ["How are we doing?", "Can we make top 10?", "What do we win?", "My stats"]
    )
  }

  if (/help|what can (i|you)|how do you work|what do you know|commands/.test(msg)) {
    return ok(
      `I live inside the war data. Things I answer instantly:
- "How are we doing?" - rank, gaps, pace
- "Can we make top 10?" - chase maths with rival pace
- "What do we win?" - rewards by placement
- "Who's carrying?" / "Top scorers" / "Who's surging?"
- "How is <name> doing?" / "My stats" - then ask "their rank?"
- "How is <clan> doing?" / "Biggest threat?" - rival intel
- "When does the war end?" / "When's the next war?"
- "Record book" / "Compare wars" / "My best war" - history
- "Tips to score more" - personalised to your pace
- "Who's on zero?" (officers get names)

You can stack questions ("rank + my stats"), follow up ("and top 5?"), and typos are totally fine`,
      ["How are we doing?", "Who's surging?", "When does the war end?"]
    )
  }

  // "can we make top X" — before generic status so it doesn't get swallowed
  const topMatch = msg.match(/top ?(\d{1,3})/)
  if (
    topMatch &&
    (/(can|will|could|make|get|reach|hit|still|doable|possible|realistic|chance)/.test(msg) ||
      /^top ?\d{1,3}$/.test(msg) ||
      msg.startsWith("and ") ||
      (topic ? topic.startsWith("chase:") : false))
  ) {
    return withCard(
      ok(
        chaseAnswer(shared, Number(topMatch[1])),
        ["What's the projection?", "Who's above us?", "What do we win?"],
        `chase:${Number(topMatch[1])}`
      ),
      raceCard(shared, Number(topMatch[1]))
    )
  }

  // Follow-up: bare name after a player/carrying/movers/topscorers conversation ("and sarah?")
  if (topic && /^(player:|carrying|movers|topscorers|zeros)/.test(topic)) {
    const followUp = msg.match(/^(?:and |what about |how about |and what about )?([a-z0-9_.]{3,20})$/)
    if (followUp && !STOP_WORDS.has(followUp[1])) {
      return playerResponse(shared, followUp[1], ["Who's carrying?", "My stats", "How are we doing?"])
    }
  }

  // Conversation memory: resolve pronouns to the last-mentioned player.
  // Topic format: "player:Username" — set by playerResponse / myStatsAnswer.
  if (topic && topic.startsWith("player:")) {
    const lastName = topic.slice("player:".length).toLowerCase()
    const member = shared.members.find(
      (m) => m.username.toLowerCase() === lastName || m.robloxId === lastName
    )
    if (member) {
      // "their rank", "their points", "how are they", "what about them", "and them"
      if (/\b(their|them|they|he|she|his|her|that guy|that girl)\b/.test(msg)) {
        const resolved = `how is ${member.username.toLowerCase()} doing`
        const result = matchOne(resolved, shared, asker, officer, `player:${member.username}`)
        if (result.handled) return result
      }
    }
  }

  // When's the next war / when does a battle start?
  if (/next (war|battle|clan battle)|another war|new (war|battle)|when.*(war|battle).*(start|begin|drop|come)/.test(msg)) {
    if (shared.active) {
      return ok(
        `This war's still live — ⏳ **${fmtDuration(shared.timeLeftMs)}** left. The next battle usually drops with the next in-game event, basically right after this one. Finish strong first 😤`,
        ["When does the war end?", "How are we doing?", "Can we make top 10?"]
      )
    }
    return ok(
      `${noWarLine(shared)}${shared.battleId ? `Last one was **${shared.battleId}**. ` : ""}Big Games fires the starting gun with the next in-game event, and I'll know the second it goes live 📯\n\nPrep now: dream team ready, best enchants on, clear your schedule for day one — early points snowball.`,
      ["How did we do last war?", "What do we win?", "How are we doing?"]
    )
  }

  // Tips / how to help the clan score (personalised if we know the asker's stats)
  if (/how (can|do) i (help|score|contribute|grind|get points)|tips|advice|score (more|faster|quickly)|grind (faster|more|harder)|how do (clan )?wars? work|what should i (do|grind|focus)/.test(msg)) {
    // Personalised: if we know the asker's PPH, give them a concrete target.
    const selfRow = shared.members.find(
      (row) =>
        (asker.robloxId !== null && row.robloxId === String(asker.robloxId)) ||
        row.username.toLowerCase() === asker.username.toLowerCase()
    )
    const myPph = selfRow?.gain24h !== null && selfRow?.gain24h !== undefined ? Math.round(selfRow.gain24h / 24) : null
    const myPoints = selfRow?.points ?? null
    const topPph = shared.topScorers[0]?.gain24h ? Math.round(shared.topScorers[0].gain24h / 24) : null
    const clanPph = shared.hourlyRate ?? null

    let personal = ""
    if (selfRow && myPph !== null) {
      if (myPph === 0) {
        personal = `\n\n**You're on 0 PPH right now** — even a few hundred pts/hour helps. Find your fastest zone and lock in.`
      } else if (topPph && myPph < topPph * 0.3) {
        personal = `\n\n**Your pace: ~${fmt(myPph)}/h** — top grinders are doing ~${fmt(topPph)}/h. You've got room to push. Check your team/enchants and find a faster zone.`
      } else if (topPph && myPph < topPph * 0.7) {
        personal = `\n\n**Your pace: ~${fmt(myPph)}/h** — decent, but top is ~${fmt(topPph)}/h. Tighten the rotation and you'll close the gap.`
      } else {
        personal = `\n\n**Your pace: ~${fmt(myPph)}/h** — you're carrying. Keep it up and push others to match your pace.`
      }
    } else if (selfRow && myPoints !== null && myPoints === 0) {
      personal = `\n\n**You haven't scored yet this war** — get in there and start grinding. Every point counts.`
    }

    return ok(
      `Every clan battle scores on its **own gimmick** — the in-game Clan Battle page shows exactly what counts this time. Universal cheat codes:\n\n• **Highest zone you melt fast** — speed beats ego\n• **Best team + enchants on**, always\n• **Day-one points snowball** — start early\n• **Final 24h is when ranks flip** — that's push time${personal}\n\n${shared.active ? `Clock check: **${fmtDuration(shared.timeLeftMs)}** left — go go go` : "Between wars right now, so stock the prep: potions, upgrades, dream team."}`,
      ["How are we doing?", "My stats", "Top scorers"]
    )
  }

  // Top scorers table
  if (/top ?(3|5|10|scorers|players|members|grinders)|clan leaderboard|score ?board|best (members|players|scorers|grinders)/.test(msg)) {
    if (shared.topScorers.length === 0) return ok("No scorers on the board yet 🐣", DEFAULT_CHIPS)
    const lines = shared.topScorers.slice(0, 5).map((row, index) => {
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`
      const gain = row.gain24h !== null && row.gain24h > 0 ? ` *(+${fmt(row.gain24h)} last 24h)*` : ""
      return `${medal} **${row.username}** — ${fmt(row.points)} pts${gain}`
    })
    return withCard(
      ok(
        `Top grinders on the board:\n\n${lines.join("\n")}\n\nThe full table lives on the leaderboard page 🏆`,
        ["Who's carrying?", "My stats", "How are we doing?"],
        "topscorers"
      ),
      scorerBarsCard(shared, "Top scorers")
    )
  }

  // Record book / all-time bests
  if (/best war ever|our best war|all.?time (best|record)|record (book|war|points|haul)|most points (we|the clan)|biggest (war|haul)|hall of fame|records\b/.test(msg)) {
    return recordsAnswer(shared)
  }

  // War vs war comparison
  if (/compare|compared|vs last|versus|better than last|worse than last|are we (doing )?(better|worse)/.test(msg)) {
    return compareAnswer(shared)
  }

  // Personal war arc
  if (/my (best|record|history|improvement|wars|arc|journey|progress|pb)|am i improving|getting better|personal best/.test(msg)) {
    return myHistoryAnswer(shared, asker)
  }

  // Full war history list
  if (/war history|past wars|previous wars|list (the )?wars|history book|our history|wars so far/.test(msg)) {
    return historyListAnswer(shared)
  }

  // Last war recap / our record
  if (/last (war|battle)|previous (war|battle)|how did we (do|finish)|our (record|best) (finish|war)|best (finish|war)|war recap|recap (of )?(the )?(last |previous )?(war|battle)/.test(msg)) {
    if (shared.active) {
      return ok(
        `We're mid-**${shared.battleId ?? "battle"}** — recap when the dust settles! Right now: **${shared.clanRank !== null ? `#${shared.clanRank}` : "unranked"}** with ⏳ **${fmtDuration(shared.timeLeftMs)}** left 📖`,
        ["How are we doing?", "When's the next war?", "Who's carrying?"]
      )
    }
    const bits = [
      `Last battle: **${shared.battleId ?? "unknown"}** — `,
      shared.contributors ? `**${shared.contributors} scorers** piled up ` : "",
      shared.clanPoints !== null ? `**${fmt(shared.clanPoints)} pts**` : "a pile of pts",
      ".",
      shared.clanRank !== null ? ` That run has us sitting **#${shared.clanRank}** on the clan leaderboard.` : "",
    ]
    if (shared.history.length >= 2) {
      const [last, prev] = shared.history
      const delta = last.clanPoints - prev.clanPoints
      if (delta !== 0) {
        bits.push(
          ` ${delta > 0 ? "📈" : "📉"} That's ${delta > 0 ? "**+" : "**−"}${fmt(Math.abs(delta))} pts** vs ${prev.title}.`
        )
      }
    }
    bits.push(`\n\nHistory book says: beat it next war 😤 Ask me "compare wars" anytime 📖`)
    return ok(bits.join(""), ["When's the next war?", "What do we win?", "Top scorers"])
  }

  // Roster / member count
  if (/how many (members|players|people|scorers)|clan size|roster( size)?|member count/.test(msg)) {
    let out = shared.memberCount !== null ? `The clan has **${shared.memberCount}** members.` : ""
    if (shared.contributors) {
      out += `${out ? " " : ""}**${shared.contributors}** ${shared.active ? "have scored so far this war" : "scored in the last battle"}.`
    }
    if (!out) return ok("Can't see the roster count right now 😴", DEFAULT_CHIPS)
    if (shared.active && shared.zeroCount > 0) out += ` (${shared.zeroCount} still on zero 👀)`
    return ok(out, ["Who's carrying?", "Top scorers", "How are we doing?"])
  }

  if (/(what|which|any).*(reward|prize)|what (do|will|would|did) we (win|get|earn)|win if|loot/.test(msg)) {
    return withCard(
      ok(rewardsAnswer(shared), ["Can we make top 10?", "What's the projection?", "How are we doing?"], "rewards"),
      tiersCard(shared)
    )
  }

  if (/who.*(carrying|carry|mvp|best player)|top scorer|highest point/.test(msg)) {
    return withCard(
      ok(carryingAnswer(shared), ["Who's surging?", "My stats", "How are we doing?"], "carrying"),
      scorerBarsCard(shared, "Top scorers")
    )
  }

  if (/surging|mover|climb|ris(e|ing)|most improved|gained most/.test(msg)) {
    return withCard(
      ok(moversAnswer(shared), ["Who's carrying?", "My stats", "How are we doing?"], "movers"),
      momentumCard(shared)
    )
  }

  if (/zero|slacking|deadweight|not scoring|freeload|inactive|asleep/.test(msg)) {
    return ok(zerosAnswer(shared, officer), ["Who's carrying?", "How are we doing?"], "zeros")
  }

  if (/(my|me) (points|rank|stats|score)|how am i doing|how many points (do i|i have)/.test(msg)) {
    const selfRow = shared.members.find(
      (row) =>
        (asker.robloxId !== null && row.robloxId === String(asker.robloxId)) ||
        row.username.toLowerCase() === asker.username.toLowerCase()
    )
    return withCard(
      ok(myStatsAnswer(shared, asker), ["Who's above us?", "How are we doing?", "Who's carrying?"], "status"),
      selfRow ? personRaceCard(shared, selfRow.robloxId, true) : undefined
    )
  }

  // Player lookup: "how is X doing", "stats for X", "X points", "check X"
  const whoMatch =
    msg.match(/how(?:'s| is| are) ([a-z0-9_.]{3,20})(?: doing)?/) ??
    msg.match(/stats for ([a-z0-9_.]{3,20})/) ??
    msg.match(/how many points (?:does|did|has) ([a-z0-9_.]{3,20})/) ??
    msg.match(/^(?:check|lookup|find) ([a-z0-9_.]{3,20})$/) ??
    msg.match(/([a-z0-9_.]{3,20}) (?:points|rank|score)\b/)
  if (whoMatch) {
    const name = whoMatch[1]
    if (!STOP_WORDS.has(name)) {
      return playerResponse(shared, name, ["Who's carrying?", "My stats", "How are we doing?"])
    }
  }

  // Rival clan lookup: "how is XYZ clan doing?", "XYZ clan points"
  const clanMatch = msg.match(/(?:how is|how's|what about|check|lookup)\s+(?:clan\s+)?([a-z0-9]{2,8})(?:\s+clan)?\s*(?:doing|going|points|rank)?/i)
  if (clanMatch && !STOP_WORDS.has(clanMatch[1])) {
    const clanName = clanMatch[1].toUpperCase()
    const rival = shared.standings.find(
      (s) => s.name.toUpperCase().replace(/[^A-Z0-9]/g, "") === clanName.replace(/[^A-Z0-9]/g, "")
    )
    if (rival) {
      const usIdx = usIndex(shared)
      const ourPoints = shared.clanPoints ?? 0
      const gap = rival.points - ourPoints
      const pphBit = rival.pph !== null ? `, gaining ~${fmt(rival.pph)}/h` : ""
      const gapBit = gap > 0 ? ` - ${fmt(gap)} pts ahead of us` : gap < 0 ? ` - ${fmt(-gap)} pts behind us` : " - level with us"
      const positionBit = usIdx >= 0 && rival.rank < usIdx + 1 ? " (above us)" : usIdx >= 0 && rival.rank > usIdx + 1 ? " (below us)" : ""
      return ok(
        `**${rival.name}** is #${rival.rank} on **${fmt(rival.points)}** pts${pphBit}${gapBit}${positionBit}.`,
        ["Who's above us?", "Can we make top 10?", "How are we doing?"],
        `clan:${rival.name}`
      )
    }
  }

  // Biggest threat: which clan behind us is gaining fastest
  if (/biggest threat|who.*chasing us|who.*gaining on us|fastest.*clan|most dangerous|biggest rival/.test(msg)) {
    const usIdx = usIndex(shared)
    if (usIdx < 0) return ok("I can't see us in the live standings right now - probably between wars", DEFAULT_CHIPS)
    const below = shared.standings.slice(usIdx + 1).filter((s) => s.pph !== null && s.pph > 0)
    if (below.length === 0) return ok("Nobody below us has pace data yet - check back after the next hourly snapshot.", DEFAULT_CHIPS)
    below.sort((a, b) => (b.pph ?? 0) - (a.pph ?? 0))
    const threat = below[0]
    const ourPph = shared.hourlyRate ?? 0
    const theirPph = threat.pph ?? 0
    const net = theirPph - ourPph
    const gap = (shared.clanPoints ?? 0) - threat.points
    const eta = net > 0 && gap > 0 ? Math.ceil(gap / net) : null
    let out = `**${threat.name}** (#${threat.rank}) is our biggest threat - gaining ~${fmt(theirPph)}/h`
    if (net > 0) out += ` vs our ~${fmt(ourPph)}/h. They're closing the gap at ~${fmt(net)}/h net`
    else out += ` vs our ~${fmt(ourPph)}/h. We're out-pacing them`
    if (eta !== null) out += ` - they'd overtake us in ~${eta}h if pace holds`
    out += `.`
    return ok(out, ["How are we doing?", "Can we make top 10?", "Who's above us?"])
  }

  // Fastest gaining clans overall
  if (/fastest.*gaining|top.*pph|which.*gaining.*most|fastest clans|biggest gainers/.test(msg)) {
    const withPace = shared.standings.filter((s) => s.pph !== null && s.pph > 0)
    if (withPace.length === 0) return ok("No clan pace data yet - check back after the next hourly snapshot.", DEFAULT_CHIPS)
    withPace.sort((a, b) => (b.pph ?? 0) - (a.pph ?? 0))
    const top5 = withPace.slice(0, 5)
    const lines = top5.map((s, i) => `${i + 1}. **${s.name}** - ${fmt(s.pph ?? 0)}/h (#${s.rank}, ${fmt(s.points)} pts)`)
    return ok(
      `Fastest-gaining clans right now:\n\n${lines.join("\n")}`,
      ["How are we doing?", "Biggest threat?", "Can we make top 10?"]
    )
  }

  if (/who.*(winning|first|leading|#?1\b)|who('s| is) (first|top|leading)|leader of|best clan/.test(msg)) {
    const top = standingAt(shared, 1)
    if (!top) return ok("I can't see the live standings right now — try again shortly.", DEFAULT_CHIPS)
    const gap = shared.clanPoints !== null && top.points > shared.clanPoints ? top.points - shared.clanPoints : null
    return ok(
      `**${top.name}** leads on **${fmt(top.points)}** pts${gap !== null && gap > 0 ? ` — we're ${fmt(gap)} behind them` : ""}${top.name.toUpperCase() === "MCWV" ? " — WAIT THAT'S US 👑" : "."}`,
      ["Can we make top 10?", "How are we doing?", "What's the projection?"]
    )
  }

  if (/predict|project|forecast|where will we (finish|end)|final (rank|place|points|score)|end up/.test(msg)) {
    return withCard(
      ok(projectionAnswer(shared), ["What do we win?", "Can we make top 10?", "How are we doing?"], "projection"),
      projectionCard(shared)
    )
  }

  if (/when does (the )?(war|battle|it) end|time (left|remaining)|how long (left|until)|ends when|countdown/.test(msg)) {
    if (!shared.active) return ok(noWarLine(shared) + "Wars run about a week once they start — you'll know when I know ⏰", DEFAULT_CHIPS)
    return ok(
      `⏳ **${fmtDuration(shared.timeLeftMs)}** left${shared.endsAt ? ` — ends ${new Date(shared.endsAt).toLocaleString("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit" })}` : ""}. Final-hours push planning starts... now 😤`,
      ["How are we doing?", "Can we make top 10?", "Who's on zero?"]
    )
  }

  if (/(our|current|clan|'s) (rank|place|position)|where are we|what place|what('s| is)( our| the)? (clan )?rank/.test(msg)) {
    if (shared.clanRank === null) return ok("No live placement on record yet — once the war starts I'll track our rank hourly 📡", DEFAULT_CHIPS)
    const idx = usIndex(shared)
    const above = idx > 0 ? shared.standings[idx - 1] : null
    return ok(
      `We're **#${shared.clanRank}**${shared.clanPoints !== null ? ` on **${fmt(shared.clanPoints)}** pts` : ""}${above ? ` — ${fmt(above.points - (shared.clanPoints ?? 0))} pts behind ${above.name} (#${above.rank})` : ""}.`,
      ["Can we make top 10?", "How are we doing?", "Who's above us?"],
      "rank"
    )
  }

  if (/how many points (do we|we have|does (the )?clan)|clan points|total points/.test(msg)) {
    if (shared.clanPoints === null) return ok("No points on the board yet — war hasn't started or hasn't ticked over 🐣", DEFAULT_CHIPS)
    return ok(
      `The clan's on **${fmt(shared.clanPoints)}** pts${shared.gainLastHour !== null ? `, +${fmt(shared.gainLastHour)} in the last hour` : ""}${shared.contributors ? ` from **${shared.contributors} scorers**` : ""}.`,
      ["How are we doing?", "Who's carrying?", "What's the projection?"]
    )
  }

  if (/how (are|r) (we|u) doing|status|update|report|recap|summary|news|winning|losing|how('s| is) (the war|it going|it)/.test(msg)) {
    return withCard(
      ok(statusAnswer(shared), ["Can we make top 10?", "What do we win?", "Who's carrying?"], "status"),
      standingsCard(shared)
    )
  }

  if (/who('s| is) above us|who.*above us|chase|behind us|gap/.test(msg)) {
    const idx = usIndex(shared)
    if (idx < 0) return ok("I can't see us in the live standings right now — probably between wars 😴", DEFAULT_CHIPS)
    const above = idx > 0 ? shared.standings[idx - 1] : null
    const below = idx < shared.standings.length - 1 ? shared.standings[idx + 1] : null
    let out = ""
    if (above) out += `⬆️ **${above.name}** (#${above.rank}) — ${fmt(above.points - (shared.clanPoints ?? 0))} pts ahead of us`
    else out += `⬆️ Nobody above us. We ARE the above 👑`
    if (below) out += `\n⬇️ **${below.name}** (#${below.rank}) — ${fmt((shared.clanPoints ?? 0) - below.points)} pts behind us`
    return ok(out, ["Can we make top 10?", "How are we doing?", "What's the projection?"])
  }

  if (/thank|thx|ty\b|nice|love (you|this)|sick|goat/.test(msg)) {
    return ok(`Anytime 💜 Now go get some points — ${shared.active ? `${fmtDuration(shared.timeLeftMs)} on the clock` : "war's coming"} 😤`, DEFAULT_CHIPS)
  }

  return notHandled
}

// ---------------------------------------------------------------------------
// Entry point — prep → multi-part → single → typo-repair retry.
// ---------------------------------------------------------------------------

export function answerWithEngine(
  rawMessage: string,
  shared: SharedWarContext,
  asker: AskerContext,
  officer: boolean,
  topic?: string
): EngineResult {
  const base = prepare(rawMessage)

  // Multi-part: "rank + my stats", "how are we doing and can we make top 10?"
  const parts = base
    .split(/\s*(?:, and | and then |; | & | \+ | and )\s*/)
    .map((part) => stripTail(part.trim()))
    .filter((part) => part.length >= 3)
  const uniqueParts = [...new Set(parts)]
  if (uniqueParts.length > 1) {
    const answers = uniqueParts.slice(0, 3).map((part) => matchOne(prepare(part), shared, asker, officer, topic))
    const hits = answers.filter((answer) => answer.handled)
    if (hits.length >= 2) {
      const chips: string[] = []
      for (const hit of hits) {
        for (const chip of hit.chips) {
          if (!chips.includes(chip)) chips.push(chip)
        }
      }
      const lastTopic = [...hits].reverse().find((hit) => hit.topic)?.topic
      return withCard(
        ok(
          hits.map((hit) => hit.text).join("\n\n— — —\n\n"),
          chips.slice(0, 4),
          lastTopic
        ),
        hits.find((hit) => hit.card)?.card
      )
    }
  }

  const single = matchOne(base, shared, asker, officer, topic)
  if (single.handled) return single

  // Typo pass: only reached when nothing matched, so corrections can't hijack a valid question.
  const repaired = repairTypos(base)
  if (repaired !== base) {
    const retry = matchOne(repaired, shared, asker, officer, topic)
    if (retry.handled) {
      return { ...retry, text: `*(read that as “${repaired}”)*\n\n${retry.text}` }
    }
  }

  return notHandled
}

// ---------------------------------------------------------------------------
// Fallback when nothing matched — always useful, never leaks internals.
// ---------------------------------------------------------------------------

export function fallbackAnswer(shared: SharedWarContext, asker: AskerContext): EngineResult {
  return {
    handled: true,
    text: `Not sure I caught that one — but here's where things stand:\n\n${statusAnswer(shared)}\n\nI can also answer:\n• "How is <clan> doing?" — rival check\n• "Biggest threat?" — who's chasing us\n• "Tips to score more" — personalised advice\n• "How is <player> doing?" — member lookup`,
    chips: ["How are we doing?", "Can we make top 10?", "Biggest threat?", "Who's carrying?"],
  }
}
