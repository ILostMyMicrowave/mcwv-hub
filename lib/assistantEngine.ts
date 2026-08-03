import type { AskerContext, MemberLine, SharedWarContext, StandingRow } from "@/lib/warContext"

// ---------------------------------------------------------------------------
// Assistant rule engine — answers the known questions instantly, for free.
// If no intent matches, handled=false and the caller escalates to Groq.
// ---------------------------------------------------------------------------

export type EngineResult = {
  handled: boolean
  text: string
  chips: string[]
}

const DEFAULT_CHIPS = ["How are we doing?", "What do we win?", "Who's carrying?"]

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en-GB").format(Math.round(value))

function fmtDuration(ms: number | null) {
  if (ms === null || ms < 0) return "—"
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
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
  if (idx > 0) {
    const above = shared.standings[idx - 1]
    out += `\n\nThe clan above us is **${above.name}**, ${fmt(above.points - (shared.clanPoints ?? 0))} pts ahead.`
  }
  if (idx >= 0 && idx < shared.standings.length - 1) {
    const below = shared.standings[idx + 1]
    out += ` **${below.name}** is ${fmt((shared.clanPoints ?? 0) - below.points)} pts behind us.`
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
  const rate = shared.hourlyRate
  const eta = rate && rate > 0 ? gap / rate : null
  const hoursLeft = shared.timeLeftMs !== null ? shared.timeLeftMs / 3_600_000 : null

  let out = `Top ${target} is **${targetRow.name}** on ${fmt(targetRow.points)} pts — we're **${fmt(gap)}** behind.`
  if (eta !== null && hoursLeft !== null) {
    out += eta <= hoursLeft
      ? `\n\nAt our current pace (~${fmt(rate)}/h) we'd catch them in **~${Math.ceil(eta)}h** with ${fmtDuration(shared.timeLeftMs)} to go — **yes, it's on.** 🔥`
      : `\n\nAt our current pace (~${fmt(rate)}/h) that's **~${Math.ceil(eta)}h** of grinding with only ${fmtDuration(shared.timeLeftMs)} left — we need to speed up. Wake the zeros up 😅`
  } else {
    out += `\n\nI don't have a solid pace reading yet — check back after the bot's next snapshots land.`
  }
  return out
}

function projectionAnswer(shared: SharedWarContext): string {
  if (!shared.active) return noWarLine(shared) + "Once a war starts I'll project our final placement."
  if (shared.projectedFinalPoints === null) {
    return "Too early to call — I need a bit more pace data. Ask me after the next hourly snapshot."
  }
  let out = `If everyone holds pace: we finish on roughly **${fmt(shared.projectedFinalPoints)}** pts`
  if (shared.projectedRankIfPaceHolds !== null) {
    out += `, good for about **${ordinal(shared.projectedRankIfPaceHolds)} place**`
  }
  out += `.\n\n_Caveat: pace isn't destiny — other clans push hard in the final hours too. Treat it as a vibe-check, not a prophecy 🔮_`

  const rewards = shared.projectedRankIfPaceHolds
    ? rewardsAtRank(shared, shared.projectedRankIfPaceHolds)
    : []
  if (rewards.length) out += `\n\n💎 That placement currently means: **${rewards.join(" + ")}**.`
  return out
}

function rewardsAnswer(shared: SharedWarContext): string {
  if (!shared.rewards.length) {
    return "The game hasn't exposed this war's reward table to me — usually it's huge/titanic pets for the top ranks and a clan gift for the top 500."
  }
  const rank = shared.projectedRankIfPaceHolds ?? shared.clanRank
  if (rank === null) {
    return "I can't see our placement yet, so I can't say which tier we're in. Ask me once the war's underway."
  }
  const current = rewardsAtRank(shared, rank)
  let out = `At **#${rank}**${shared.projectedRankIfPaceHolds && !shared.active ? "" : ""} we'd take home: **${current.join(" + ") || "nothing 😅"}** 💎`
  const better = nextTierUp(shared, rank)
  if (better) {
    const boundaryRow = standingAt(shared, better.worst)
    const gap = boundaryRow && shared.clanPoints !== null ? boundaryRow.points - shared.clanPoints : null
    out += `\n\nOne tier up (${ordinal(better.best)}–${ordinal(better.worst)}): **${rewardsAtRank(shared, better.best).join(" + ")}**`
    if (gap !== null && gap > 0) out += ` — that's ${fmt(gap)} pts away 👀`
    else out += `.`
  }
  return out
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

// ---------------------------------------------------------------------------

export function answerWithEngine(
  rawMessage: string,
  shared: SharedWarContext,
  asker: AskerContext,
  officer: boolean
): EngineResult {
  const msg = rawMessage.trim().toLowerCase()
  const ok = (text: string, chips: string[]): EngineResult => ({ handled: true, text, chips })

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

  if (/help|what can (i|you)|how do you work|what do you know/.test(msg)) {
    return ok(
      `I live inside the war data 📊 Things I answer instantly:\n• "How are we doing?" — rank, gaps, pace\n• "Can we make top 10?" — chase maths\n• "What do we win?" — rewards by placement 💎\n• "Who's carrying?" / "Who's surging?"\n• "How is <name> doing?" / "My stats"\n• "When does the war end?"\n• "Who's on zero?" (officers get names)\n\nAnything worded weirdly, I pass to my AI brain ⚡`,
      ["How are we doing?", "Who's surging?", "When does the war end?"]
    )
  }

  // "can we make top X" — before generic status so it doesn't get swallowed
  const topMatch = msg.match(/top ?(\d{1,3})/)
  if (topMatch && /(can|will|could|make|get|reach|hit|still)/.test(msg)) {
    return ok(chaseAnswer(shared, Number(topMatch[1])), ["What's the projection?", "Who's above us?", "What do we win?"])
  }

  if (/(what|which|any).*(reward|prize)|what (do|will|would|did) we (win|get|earn)|win if|loot/.test(msg)) {
    return ok(rewardsAnswer(shared), ["Can we make top 10?", "What's the projection?", "How are we doing?"])
  }

  if (/who.*(carrying|carry|mvp|best player)|top scorer|highest point/.test(msg)) {
    return ok(carryingAnswer(shared), ["Who's surging?", "My stats", "How are we doing?"])
  }

  if (/surging|mover|climb|ris(e|ing)|most improved|gained most/.test(msg)) {
    return ok(moversAnswer(shared), ["Who's carrying?", "My stats", "How are we doing?"])
  }

  if (/zero|slacking|deadweight|not scoring|freeload|inactive|asleep/.test(msg)) {
    return ok(zerosAnswer(shared, officer), ["Who's carrying?", "How are we doing?"])
  }

  if (/(my|me) (points|rank|stats|score)|how am i doing|how many points (do i|i have)/.test(msg)) {
    return ok(myStatsAnswer(shared, asker), ["Who's above me?" , "How are we doing?", "Who's carrying?"])
  }

  // Player lookup: "how is X doing", "stats for X", "X points"
  const whoMatch =
    msg.match(/how(?:'s| is| are) ([a-z0-9_.]{3,20})(?: doing)?/) ??
    msg.match(/stats for ([a-z0-9_.]{3,20})/) ??
    msg.match(/([a-z0-9_.]{3,20}) (?:points|rank|score)\b/)
  if (whoMatch) {
    const name = whoMatch[1]
    if (!["we", "the", "our", "clan", "i", "me", "war", "battle"].includes(name)) {
      const member = memberLookup(shared, name)
      if (member) return ok(playerAnswer(shared, member), ["Who's carrying?", "My stats", "How are we doing?"])
      return ok(
        `Can't find anyone called "${name}" in this war's data — check the spelling, or they haven't scored yet 👻`,
        ["Who's carrying?", "My stats"]
      )
    }
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
    return ok(projectionAnswer(shared), ["What do we win?", "Can we make top 10?", "How are we doing?"])
  }

  if (/when does (the )?(war|battle|it) end|time (left|remaining)|how long (left|until)|ends when|countdown/.test(msg)) {
    if (!shared.active) return ok(noWarLine(shared) + "Wars run about a week once they start — you'll know when I know ⏰", DEFAULT_CHIPS)
    return ok(
      `⏳ **${fmtDuration(shared.timeLeftMs)}** left${shared.endsAt ? ` — ends ${new Date(shared.endsAt).toLocaleString("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit" })}` : ""}. Final-hours push planning starts... now 😤`,
      ["How are we doing?", "Can we make top 10?", "Who's on zero?"]
    )
  }

  if (/(our|current|clan|'s) (rank|place|position)|where are we|what place/.test(msg)) {
    if (shared.clanRank === null) return ok("No live placement on record yet — once the war starts I'll track our rank hourly 📡", DEFAULT_CHIPS)
    const idx = usIndex(shared)
    const above = idx > 0 ? shared.standings[idx - 1] : null
    return ok(
      `We're **#${shared.clanRank}**${shared.clanPoints !== null ? ` on **${fmt(shared.clanPoints)}** pts` : ""}${above ? ` — ${fmt(above.points - (shared.clanPoints ?? 0))} pts behind ${above.name} (#${above.rank})` : ""}.`,
      ["Can we make top 10?", "How are we doing?", "Who's above us?"]
    )
  }

  if (/how many points (do we|we have|does (the )?clan)|clan points|total points/.test(msg)) {
    if (shared.clanPoints === null) return ok("No points on the board yet — war hasn't started or hasn't ticked over 🐣", DEFAULT_CHIPS)
    return ok(
      `The clan's on **${fmt(shared.clanPoints)}** pts${shared.gainLastHour !== null ? `, +${fmt(shared.gainLastHour)} in the last hour` : ""}${shared.contributors ? ` from **${shared.contributors} scorers**` : ""}.`,
      ["How are we doing?", "Who's carrying?", "What's the projection?"]
    )
  }

  if (/how (are|r) (we|u) doing|status|update|report|how('s| is) (the war|it going|it)/.test(msg)) {
    return ok(statusAnswer(shared), ["Can we make top 10?", "What do we win?", "Who's carrying?"])
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

  return { handled: false, text: "", chips: [] }
}

// ---------------------------------------------------------------------------
// Fallback when no AI is available (or quota spent) — still useful.
// ---------------------------------------------------------------------------

export function fallbackAnswer(shared: SharedWarContext, asker: AskerContext, reason: string): EngineResult {
  return {
    handled: true,
    text: `Hmm, that one's outside my playbook${reason ? ` (${reason})` : ""} — but here's the current state:\n\n${statusAnswer(shared)}\n\nOr try one of these 👇`,
    chips: ["How are we doing?", "Can we make top 10?", "What do we win?", "Who's carrying?"],
  }
}
