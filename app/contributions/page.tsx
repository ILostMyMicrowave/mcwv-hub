"use client";

import Navbar from "@/components/Navbar";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

// Animated number counter component
function CountUp({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            const start = 0;
            const end = value;
            const duration = 1500;
            const startTime = performance.now();

            const updateValue = (currentTime: number) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeOutQuart = 1 - Math.pow(1 - progress, 4);
              setDisplayValue(Math.floor(start + (end - start) * easeOutQuart));

              if (progress < 1) {
                requestAnimationFrame(updateValue);
              }
            };

            requestAnimationFrame(updateValue);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{formatter(displayValue)}</span>;
}

function Panel({
  title,
  children,
  right,
  delay = "0ms",
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  delay?: string;
}) {
  return (
    <section
      className="rounded-3xl border p-4 backdrop-blur sm:p-6"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
        animation: "fadeInUp 0.5s ease-out forwards",
        animationDelay: delay,
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
  animate = false,
  numericValue,
  delay = "0ms",
}: {
  title: string;
  value: string | number;
  sub?: string;
  animate?: boolean;
  numericValue?: number;
  delay?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4 backdrop-blur transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
        animation: "fadeInUp 0.5s ease-out forwards",
        animationDelay: delay,
      }}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold text-white">
        {animate && numericValue !== undefined ? (
          <CountUp value={numericValue} formatter={formatNumber} />
        ) : (
          value
        )}
      </div>
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
        left: 120,
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
        data: data.topContributors.map((d) => d.username),
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
          <div className="space-y-6">
            {/* Header skeleton */}
            <div
              className="rounded-3xl border p-6 animate-pulse"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="mb-4 h-4 w-3/4 animate-pulse rounded bg-zinc-800/50" />
              <div className="h-8 w-1/2 animate-pulse rounded bg-zinc-800/50" />
              <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-zinc-800/50" />
            </div>

            {/* KPI cards skeleton */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl bg-zinc-800/50"
                />
              ))}
            </div>

            {/* Charts skeleton */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="h-96 animate-pulse rounded-3xl bg-zinc-800/50 lg:col-span-3" />
              <div className="h-96 animate-pulse rounded-3xl bg-zinc-800/50" />
              <div className="h-96 animate-pulse rounded-3xl bg-zinc-800/50" />
            </div>
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
            className="rounded-3xl border p-6 text-red-200 animate-fade-in"
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
              className="rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 hover:opacity-90 hover:scale-105"
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
            animate={true}
            numericValue={data.stats.pointsLastHour}
            delay="0.1s"
          />
          <KpiCard
            title="Points Today"
            value={formatNumber(data.stats.pointsToday)}
            sub="Current day total"
            animate={true}
            numericValue={data.stats.pointsToday}
            delay="0.2s"
          />
          <KpiCard
            title="Clan Total"
            value={formatNumber(data.stats.clanTotal)}
            sub="All tracked gains"
            animate={true}
            numericValue={data.stats.clanTotal}
            delay="0.3s"
          />
          <KpiCard
            title="Avg / Member"
            value={formatNumber(Math.round(data.stats.clanAverage))}
            sub={`${formatNumber(data.stats.trackedMembers)} tracked members`}
            animate={true}
            numericValue={Math.round(data.stats.clanAverage)}
            delay="0.4s"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <Panel
              title="Hourly activity"
              right={<span className="text-xs text-zinc-400">last 24 hours</span>}
              delay="0.2s"
            >
              {hourlyOption ? (
                <div className="transition-opacity duration-500">
                  <ReactECharts
                    option={hourlyOption}
                    style={{ height: 340, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              ) : (
                <div
                  className="flex h-[340px] items-center justify-center rounded-2xl border border-dashed"
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

          <div className="lg:col-span-3 lg:grid lg:grid-cols-2 gap-4">
            <Panel
              title="Daily trend"
              right={<span className="text-xs text-zinc-400">7 days</span>}
              delay="0.3s"
            >
              {dailyOption ? (
                <div className="transition-opacity duration-500">
                  <ReactECharts
                    option={dailyOption}
                    style={{ height: 320, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              ) : (
                <div
                  className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed"
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
              delay="0.4s"
            >
              {topOption ? (
                <div className="transition-opacity duration-500">
                  <ReactECharts
                    option={topOption}
                    style={{ height: 320, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              ) : (
                <div
                  className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed"
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
        </div>

        <div className="mt-6">
          <Panel title="Insights" delay="0.5s">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Peak Hour"
                value={data.insights.peakHour ?? "N/A"}
                sub="Highest hourly gain"
                delay="0.1s"
              />
              <KpiCard
                title="Peak Hour Points"
                value={formatNumber(data.insights.peakHourPoints)}
                sub="Best hour total"
                animate={true}
                numericValue={data.insights.peakHourPoints}
                delay="0.2s"
              />
              <KpiCard
                title="Growth vs Prev Hour"
                value={
                  data.stats.growthVsPreviousHour >= 0
                    ? `+${formatNumber(data.stats.growthVsPreviousHour)}`
                    : formatNumber(data.stats.growthVsPreviousHour)
                }
                sub="Net hourly change"
                delay="0.3s"
              />
              <KpiCard
                title="Tracked Members"
                value={formatNumber(data.stats.trackedMembers)}
                sub="Members with logs"
                animate={true}
                numericValue={data.stats.trackedMembers}
                delay="0.4s"
              />
            </div>
          </Panel>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
