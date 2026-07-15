"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Navbar from "@/components/Navbar";
import AnimatedBackground from "@/components/AnimatedBackground";

type WarAnalysisResponse = {
  success: boolean;
  active: boolean;
  battleId: string | null;
  warName: string | null;
  current: {
    clanName: string;
    rank: number | null;
    points: number;
    participants: number;
    totalClans: number;
    totalPoints: number;
    timeElapsedMs: number | null;
    timeRemainingMs: number | null;
    progressPct: number | null;
    foundInSample: boolean;
    sampleSource: string | null;
    lastSeenAt: string | null;
  };
  targets: {
    top30: {
      status: "safe" | "reachable" | "unlikely" | "unknown";
      message: string;
    };
    top50: {
      status: "safe" | "reachable" | "unlikely" | "unknown";
      message: string;
    };
  };
  projection: {
    placement: number | null;
    confidence: "low" | "medium" | "high";
    message: string;
  };
  nearbyClans: Array<{
    rank: number | null;
    name: string;
    points: number;
    gapFromUs: number | null;
    relation: "ahead" | "us" | "behind";
  }>;
  topContributor: null | {
    rank: number | null;
    userId: number;
    displayName: string;
    points: number;
    share?: number | null;
    clan: {
      name: string;
      icon: string | null;
      countryCode: string | null;
      place: number | null;
    };
  };
  analysis: {
    overview: string;
    pace: string;
    threat: string;
    summary: string;
  };
  memberActivity: {
    available: boolean;
    note: string;
    inactiveMembers: never[];
    fallingBehind: never[];
  };
  uiTone: "success" | "warning" | "danger" | "info";
  diagnostics?: {
    clanFoundInSample: boolean;
    sampleSource: string | null;
    candidateSources: string[];
    usedFallbackHistory: boolean;
  };
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";

  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return `${d}d ${h}h ${m}m ${s}s`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toneStyles(tone: WarAnalysisResponse["uiTone"]) {
  switch (tone) {
    case "success":
      return {
        border: "color-mix(in srgb, var(--primary) 28%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 10%, transparent)",
        text: "var(--primary)",
      };
    case "warning":
      return {
        border: "color-mix(in srgb, var(--primary) 22%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 8%, transparent)",
        text: "var(--primary)",
      };
    case "danger":
      return {
        border: "color-mix(in srgb, var(--primary) 18%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 7%, transparent)",
        text: "var(--primary)",
      };
    default:
      return {
        border: "color-mix(in srgb, var(--primary) 20%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 8%, transparent)",
        text: "var(--primary)",
      };
  }
}

function targetTone(status: WarAnalysisResponse["targets"]["top30"]["status"]) {
  switch (status) {
    case "safe":
      return {
        border: "color-mix(in srgb, var(--primary) 28%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 10%, transparent)",
      };
    case "reachable":
      return {
        border: "color-mix(in srgb, var(--primary) 22%, transparent)",
        soft: "color-mix(in srgb, var(--primary) 8%, transparent)",
      };
    case "unlikely":
      return {
        border: "color-mix(in srgb, var(--border) 90%, transparent)",
        soft: "rgba(0,0,0,0.18)",
      };
    default:
      return {
        border: "color-mix(in srgb, var(--border) 90%, transparent)",
        soft: "rgba(0,0,0,0.18)",
      };
  }
}

function StatusChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-3"
      style={{
        borderColor: "color-mix(in srgb, var(--border) 85%, transparent)",
        background: "color-mix(in srgb, var(--card) 88%, transparent)",
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/55">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-[2rem] border p-5 sm:p-6 backdrop-blur"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--card) 90%, transparent)",
      }}
    >
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]/55">
          {title}
        </p>
        {subtitle ? <p className="mt-1 text-sm text-[var(--foreground)]/65">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: "var(--border)",
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--foreground)]/50">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function statusText(status: WarAnalysisResponse["targets"]["top30"]["status"]) {
  switch (status) {
    case "safe":
      return "On pace";
    case "reachable":
      return "Reachable";
    case "unlikely":
      return "Unlikely";
    default:
      return "Unknown";
  }
}

export default function WarAnalystPage() {
  const [data, setData] = useState<WarAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/war-analyst", { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (json?.success) {
          setData(json);
        } else {
          setData(null);
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const styles = useMemo(() => toneStyles(data?.uiTone ?? "info"), [data?.uiTone]);
  const clanFoundInSample = data?.current.foundInSample ?? false;
  const sampleSource = data?.current.sampleSource ?? null;
  const usedFallbackHistory = data?.diagnostics?.usedFallbackHistory ?? false;
  const projectionKnown = data?.projection.placement !== null;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AnimatedBackground />
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {loading ? (
          <div
            className="rounded-[2rem] border p-6 text-sm text-[var(--foreground)]/70"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 90%, transparent)",
            }}
          >
            Loading war analyst...
          </div>
        ) : !data ? (
          <div
            className="rounded-[2rem] border p-6 text-sm text-[var(--foreground)]/70"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 90%, transparent)",
            }}
          >
            No war data available right now.
          </div>
        ) : (
          <div className="space-y-6">
            {!clanFoundInSample ? (
              <section
                className="rounded-[2rem] border p-5 sm:p-6"
                style={{
                  borderColor: styles.border,
                  background: "color-mix(in srgb, var(--card) 92%, transparent)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-[0.24em]"
                  style={{ color: styles.text }}
                >
                  Sample notice
                </p>
                <p className="mt-2 text-sm leading-6 text-white">
                  {usedFallbackHistory
                    ? `${data.current.clanName} is not present in the current public sample, but the latest stored snapshot is being used instead.`
                    : `${data.current.clanName} is not present in the current public sample, so live rank and nearby clan data cannot be resolved from this response yet.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--foreground)]/60">
                  {sampleSource ? <span>Source used: {sampleSource}</span> : null}
                  {data.current.lastSeenAt ? <span>Last seen: {formatDateTime(data.current.lastSeenAt)}</span> : null}
                </div>
              </section>
            ) : null}

            <section
              className="rounded-[2rem] border p-6 sm:p-7 backdrop-blur"
              style={{
                borderColor: styles.border,
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, transparent), color-mix(in srgb, var(--card) 86%, transparent))",
              }}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-semibold uppercase tracking-[0.24em]"
                    style={{ color: styles.text }}
                  >
                    War Analyst
                  </p>
                  <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">
                    {data.warName ?? "No Active War"}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--foreground)]/70">
                    {data.analysis.summary}
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatusChip
                      label="Current status"
                      value={data.active ? "Live" : "Inactive"}
                    />
                    <StatusChip
                      label="Current rank"
                      value={
                        data.current.rank !== null
                          ? `#${data.current.rank}`
                          : clanFoundInSample
                            ? "Unresolved"
                            : usedFallbackHistory
                              ? "From history"
                              : "Not in sample"
                      }
                    />
                    <StatusChip
                      label="Projected finish"
                      value={projectionKnown ? `#${data.projection.placement}` : "—"}
                    />
                    <StatusChip label="Confidence" value={data.projection.confidence.toUpperCase()} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
                  <StatusChip
                    label="Time remaining"
                    value={formatDuration(data.current.timeRemainingMs)}
                  />
                  <StatusChip label="Clan" value={data.current.clanName} />
                  <StatusChip label="Participants" value={formatNumber(data.current.participants)} />
                  <StatusChip
                    label="Battle points"
                    value={
                      clanFoundInSample || usedFallbackHistory
                        ? formatNumber(data.current.points)
                        : "Not in sample"
                    }
                  />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <MiniStat
                  label="Progress"
                  value={
                    data.current.progressPct !== null
                      ? `${data.current.progressPct.toFixed(1)}%`
                      : "—"
                  }
                />
                <MiniStat label="Total clans" value={formatNumber(data.current.totalClans)} />
                <MiniStat label="Total points" value={formatNumber(data.current.totalPoints)} />
              </div>

              <div className="mt-6 h-3 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${data.current.progressPct ?? 0}%`,
                    background:
                      "linear-gradient(90deg, var(--primary), var(--accent), var(--primary))",
                    boxShadow: "0 0 20px var(--glow)",
                    backgroundSize: "300% 100%",
                  }}
                />
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-6">
                <Section
                  title="Current assessment"
                  subtitle="Officer-friendly analysis of the live war."
                >
                  <div className="space-y-4">
                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        borderColor: "var(--border)",
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Overview
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white">
                        {data.analysis.overview}
                      </p>
                    </div>

                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        borderColor: "var(--border)",
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Pace
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white">{data.analysis.pace}</p>
                    </div>

                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        borderColor: "var(--border)",
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                        Threat
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white">{data.analysis.threat}</p>
                    </div>
                  </div>
                </Section>

                <Section
                  title="Target pressure"
                  subtitle="How the current snapshot reads against common finish goals."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: "Top 30", target: data.targets.top30 },
                      { label: "Top 50", target: data.targets.top50 },
                    ].map(({ label, target }) => {
                      const tone = targetTone(target.status);

                      return (
                        <div
                          key={label}
                          className="rounded-2xl border p-4"
                          style={{
                            borderColor: tone.border,
                            background: tone.soft,
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                              {label}
                            </p>
                            <p
                              className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white"
                              style={{
                                borderColor: tone.border,
                                background: "rgba(0,0,0,0.16)",
                              }}
                            >
                              {statusText(target.status)}
                            </p>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-[var(--foreground)]/80">
                            {target.message}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section
                  title="Nearby clans"
                  subtitle="The closest clans around MCWV’s current position."
                >
                  {data.nearbyClans.length === 0 ? (
                    <p className="text-sm text-[var(--foreground)]/65">
                      Nearby clan data is not available yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {data.nearbyClans.map((clan) => {
                        const isUs = clan.relation === "us";
                        return (
                          <div
                            key={`${clan.name}-${String(clan.rank ?? "x")}`}
                            className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3"
                            style={{
                              borderColor: isUs ? styles.border : "var(--border)",
                              background: isUs ? styles.soft : "rgba(0,0,0,0.16)",
                            }}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {clan.rank !== null ? `#${clan.rank}` : "—"} · {clan.name}
                              </p>
                              <p className="mt-1 text-xs text-[var(--foreground)]/55">
                                {clan.relation === "us"
                                  ? "MCWV"
                                  : clan.relation === "ahead"
                                    ? "Ahead of MCWV"
                                    : "Behind MCWV"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">
                                {formatNumber(clan.points)}
                              </p>
                              <p className="text-xs text-[var(--foreground)]/55">
                                {clan.gapFromUs === null
                                  ? "Gap unknown"
                                  : clan.gapFromUs === 0
                                    ? "Current position"
                                    : clan.relation === "ahead"
                                      ? `${formatNumber(clan.gapFromUs)} ahead`
                                      : `${formatNumber(clan.gapFromUs)} behind`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section>
              </div>

              <div className="space-y-6">
                <Section
                  title="Projection"
                  subtitle="A simple finish estimate from the live snapshot."
                >
                  <div
                    className="rounded-2xl border p-5"
                    style={{
                      borderColor: styles.border,
                      background: "rgba(0,0,0,0.18)",
                    }}
                  >
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                      Confidence
                    </p>
                    <p className="mt-2 text-3xl font-black text-white">
                      {data.projection.confidence.toUpperCase()}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[var(--foreground)]/70">
                      {data.projection.message}
                    </p>
                  </div>
                </Section>

                <Section
                  title="Top contributor"
                  subtitle="The current leader inside the battle snapshot."
                >
                  {data.topContributor ? (
                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        borderColor: styles.border,
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-bold text-white">
                            👑 {data.topContributor.displayName}
                          </p>
                          <p className="mt-1 text-sm text-[var(--foreground)]/65">
                            Leading the war
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-black text-white">
                            {formatNumber(data.topContributor.points)}
                          </p>
                          <p className="text-xs uppercase tracking-[0.22em] text-[var(--foreground)]/50">
                            points
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--foreground)]/65">
                      No top contributor data yet.
                    </p>
                  )}
                </Section>

                <Section
                  title="Member activity"
                  subtitle="Public PS99 battle data does not expose full internal inactivity history."
                >
                  <div
                    className="rounded-2xl border p-4"
                    style={{
                      borderColor: "var(--border)",
                      background: "rgba(0,0,0,0.18)",
                    }}
                  >
                    <p className="text-sm leading-6 text-white">{data.memberActivity.note}</p>
                  </div>
                </Section>

                <Section
                  title="Diagnostics"
                  subtitle="Helpful while the public sample is still incomplete."
                >
                  <div className="space-y-3">
                    <MiniStat
                      label="Sample source"
                      value={data.current.sampleSource ?? "—"}
                    />
                    <MiniStat
                      label="Last seen"
                      value={formatDateTime(data.current.lastSeenAt)}
                    />
                    <MiniStat
                      label="Fallback history"
                      value={usedFallbackHistory ? "Yes" : "No"}
                    />
                  </div>
                </Section>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
