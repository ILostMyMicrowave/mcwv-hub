"use client";

import Navbar from "@/components/Navbar";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";

type AnalyticsResponse = {
  success: boolean;
  updatedAt: string;
  stats: {
    pointsLastHour: number;
    pointsToday: number;
    clanTotal: number;
    clanAverage: number;
    trackedMembers: number;
    growthVsPreviousHour: number;
  };
  hourlyPoints: { hour: string; points: number }[];
  dailyPoints: { day: string; points: number }[];
  topContributors: { user_id: number; points: number }[];
  insights: {
    peakHour: string | null;
    peakHourPoints: number;
  };
  error?: string;
};

type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  border: string;
  primary: string;
  accent: string;
  muted: string;
};

const FALLBACK_THEME: ThemeColors = {
  background: "#0a0a0a",
  foreground: "#ededed",
  card: "rgba(255,255,255,0.05)",
  border: "rgba(255,255,255,0.10)",
  primary: "#34d399",
  accent: "#60a5fa",
  muted: "#94a3b8",
};

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-GB").format(n);
}

function formatAgo(timestamp: string | null, nowMs: number) {
  if (!timestamp) return "—";
  const diff = Math.max(0, nowMs - new Date(timestamp).getTime());

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAnalytics(payload: any): AnalyticsResponse {
  const stats = payload?.stats ?? {};
  const insights = payload?.insights ?? {};

  return {
    success: Boolean(payload?.success),
    updatedAt: String(payload?.updatedAt ?? new Date().toISOString()),
    stats: {
      pointsLastHour: toNumber(stats.pointsLastHour),
      pointsToday: toNumber(stats.pointsToday),
      clanTotal: toNumber(stats.clanTotal),
      clanAverage: toNumber(stats.clanAverage),
      trackedMembers: toNumber(stats.trackedMembers),
      growthVsPreviousHour: toNumber(stats.growthVsPreviousHour),
    },
    hourlyPoints: Array.isArray(payload?.hourlyPoints)
      ? payload.hourlyPoints.map((item: any) => ({
          hour: String(item?.hour ?? ""),
          points: toNumber(item?.points),
        }))
      : [],
    dailyPoints: Array.isArray(payload?.dailyPoints)
      ? payload.dailyPoints.map((item: any) => ({
          day: String(item?.day ?? ""),
          points: toNumber(item?.points),
        }))
      : [],
    topContributors: Array.isArray(payload?.topContributors)
      ? payload.topContributors.map((item: any) => ({
          user_id: toNumber(item?.user_id),
          points: toNumber(item?.points),
        }))
      : [],
    insights: {
      peakHour:
        typeof insights?.peakHour === "string" && insights.peakHour.trim()
          ? insights.peakHour
          : null,
      peakHourPoints: toNumber(insights?.peakHourPoints),
    },
    error: typeof payload?.error === "string" ? payload.error : undefined,
  };
}

function useThemeColors() {
  const [theme, setTheme] = useState<ThemeColors>(FALLBACK_THEME);

  useEffect(() => {
    const readTheme = () => {
      const styles = getComputedStyle(document.documentElement);

      const nextTheme: ThemeColors = {
        background: styles.getPropertyValue("--background").trim() || FALLBACK_THEME.background,
        foreground: styles.getPropertyValue("--foreground").trim() || FALLBACK_THEME.foreground,
        card: styles.getPropertyValue("--card").trim() || FALLBACK_THEME.card,
        border: styles.getPropertyValue("--border").trim() || FALLBACK_THEME.border,
        primary: styles.getPropertyValue("--primary").trim() || FALLBACK_THEME.primary,
        accent: styles.getPropertyValue("--accent").trim() || FALLBACK_THEME.accent,
        muted: styles.getPropertyValue("--foreground").trim() || FALLBACK_THEME.muted,
      };

      setTheme(nextTheme);
    };

    readTheme();

    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style", "class"],
    });

    window.addEventListener("resize", readTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", readTheme);
    };
  }, []);

  return theme;
}

function Panel({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section
      className="rounded-3xl border p-4 backdrop-blur sm:p-6"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4 backdrop-blur"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

export default function ContributionsPage() {
  const theme = useThemeColors();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  async function load(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/contributions/analytics", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load analytics");
      }

      const normalized = normalizeAnalytics(json);
      setData(normalized);
      setError(null);
      setLastUpdated(normalized.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load();

    const refresh = setInterval(() => load({ silent: true }), 15000);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, []);

  const hourlyOption = useMemo(() => {
    if (!data?.hourlyPoints?.length) return null;

    return {
      backgroundColor: "transparent",
      color: [theme.primary],
      animationDuration: 700,
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.card,
        borderColor: theme.border,
        textStyle: { color: theme.foreground },
        axisPointer: {
          type: "line",
          lineStyle: { color: theme.border },
        },
      },
      grid: {
        left: 24,
        right: 18,
        top: 28,
        bottom: 26,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: data.hourlyPoints.map((d) => d.hour),
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.muted, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: theme.muted },
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
      },
      series: [
        {
          data: data.hourlyPoints.map((d) => d.points),
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 3,
            color: theme.primary,
          },
          itemStyle: { color: theme.primary },
          areaStyle: {
            color: theme.primary,
            opacity: 0.15,
          },
        },
      ],
    };
  }, [data, theme]);

  const dailyOption = useMemo(() => {
    if (!data?.dailyPoints?.length) return null;

    return {
      backgroundColor: "transparent",
      color: [theme.accent],
      animationDuration: 700,
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.card,
        borderColor: theme.border,
        textStyle: { color: theme.foreground },
      },
      grid: {
        left: 24,
        right: 18,
        top: 28,
        bottom: 26,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: data.dailyPoints.map((d) => d.day),
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.muted, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: theme.muted },
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
      },
      series: [
        {
          data: data.dailyPoints.map((d) => d.points),
          type: "line",
          smooth: true,
          showSymbol: true,
          symbolSize: 7,
          lineStyle: {
            width: 3,
            color: theme.accent,
          },
          itemStyle: { color: theme.accent },
          areaStyle: {
            color: theme.accent,
            opacity: 0.12,
          },
        },
      ],
    };
  }, [data, theme]);

  const topOption = useMemo(() => {
    if (!data?.topContributors?.length) return null;

    return {
      backgroundColor: "transparent",
      animationDuration: 700,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: theme.card,
        borderColor: theme.border,
        textStyle: { color: theme.foreground },
      },
      grid: {
        left: 92,
        right: 18,
        top: 20,
        bottom: 18,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: theme.muted },
        splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: data.topContributors.map((d) => `#${d.user_id}`),
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.muted },
      },
      series: [
        {
          data: data.topContributors.map((d) => d.points),
          type: "bar",
          barMaxWidth: 18,
          itemStyle: {
            color: theme.accent,
            borderRadius: [8, 8, 8, 8],
          },
        },
      ],
    };
  }, [data, theme]);

  const updatedLabel = formatAgo(lastUpdated, now);

  if (loading) {
    return (
      <main
        className="min-h-screen text-white"
        style={{ background: "var(--background)" }}
      >
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
          <div
            className="rounded-3xl border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            Loading analytics...
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main
        className="min-h-screen text-white"
        style={{ background: "var(--background)" }}
      >
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
          <div
            className="rounded-3xl border p-6 text-red-200"
            style={{
              background: "rgba(239,68,68,0.10)",
              borderColor: "rgba(239,68,68,0.30)",
            }}
          >
            {error ?? "Failed to load analytics"}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen text-white"
      style={{ background: "var(--background)" }}
    >
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div
              className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
              style={{
                background: "var(--card)",
                border: `1px solid var(--border)`,
                color: theme.primary,
              }}
            >
              <span
                className="h-2 w-2 animate-pulse rounded-full"
                style={{ background: theme.primary }}
              />
              Live analytics
            </div>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Contributions Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Clan activity analytics with hourly gains, daily trends, and top contributors.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-zinc-400">
              updated {updatedLabel}
            </div>

            <button
              type="button"
              onClick={() => load({ silent: false })}
              className="rounded-full px-4 py-2 text-xs font-medium transition hover:opacity-90"
              style={{
                background: "var(--card)",
                border: `1px solid var(--border)`,
                color: "var(--foreground)",
              }}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="mb-6 rounded-2xl border px-4 py-3 text-sm text-red-200"
            style={{
              background: "rgba(239,68,68,0.10)",
              borderColor: "rgba(239,68,68,0.30)",
            }}
          >
            {error}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Points Last Hour"
            value={formatNumber(data.stats.pointsLastHour)}
            sub={data.stats.growthVsPreviousHour >= 0 ? `+${formatNumber(data.stats.growthVsPreviousHour)} vs previous hour` : `${formatNumber(data.stats.growthVsPreviousHour)} vs previous hour`}
          />
          <KpiCard
            title="Points Today"
            value={formatNumber(data.stats.pointsToday)}
            sub="Current day total"
          />
          <KpiCard
            title="Clan Total"
            value={formatNumber(data.stats.clanTotal)}
            sub="All tracked gains"
          />
          <KpiCard
            title="Avg / Member"
            value={formatNumber(Math.round(data.stats.clanAverage))}
            sub={`${formatNumber(data.stats.trackedMembers)} tracked members`}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <Panel
              title="Hourly activity"
              right={<span className="text-xs text-zinc-400">last 24 hours</span>}
            >
              {hourlyOption ? (
                <ReactECharts
                  option={hourlyOption}
                  style={{ height: 340, width: "100%" }}
                  notMerge
                  lazyUpdate
                />
              ) : (
                <div className="flex h-[340px] items-center justify-center rounded-2xl border border-dashed"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                    opacity: 0.6,
                  }}
                >
                  No hourly data yet
                </div>
              )}
            </Panel>
          </div>

          <Panel
            title="Daily trend"
            right={<span className="text-xs text-zinc-400">7 days</span>}
          >
            {dailyOption ? (
              <ReactECharts
                option={dailyOption}
                style={{ height: 320, width: "100%" }}
                notMerge
                lazyUpdate
              />
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  opacity: 0.6,
                }}
              >
                No daily data yet
              </div>
            )}
          </Panel>

          <Panel
            title="Top contributors"
            right={<span className="text-xs text-zinc-400">top 10</span>}
          >
            {topOption ? (
              <ReactECharts
                option={topOption}
                style={{ height: 320, width: "100%" }}
                notMerge
                lazyUpdate
              />
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  opacity: 0.6,
                }}
              >
                No contributor data yet
              </div>
            )}
          </Panel>
        </div>

        <div className="mt-6">
          <Panel title="Insights">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Peak Hour"
                value={data.insights.peakHour ?? "N/A"}
                sub="Highest hourly gain"
              />
              <KpiCard
                title="Peak Hour Points"
                value={formatNumber(data.insights.peakHourPoints)}
                sub="Best hour total"
              />
              <KpiCard
                title="Growth vs Prev Hour"
                value={
                  data.stats.growthVsPreviousHour >= 0
                    ? `+${formatNumber(data.stats.growthVsPreviousHour)}`
                    : formatNumber(data.stats.growthVsPreviousHour)
                }
                sub="Net hourly change"
              />
              <KpiCard
                title="Tracked Members"
                value={formatNumber(data.stats.trackedMembers)}
                sub="Members with logs"
              />
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
          }
