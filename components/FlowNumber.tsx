"use client";

import { useEffect, useState } from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import { formatCompact } from "@/lib/numbers";

type FlowNumberProps = {
  value: number;
  className?: string;
  locales?: Intl.LocalesArgument;
  format?: Format;
  prefix?: string;
  suffix?: string;
};

// Battle-scale points are in the billions — full 13-digit strings overflow
// hero numbers, rows, and stat tiles, so anything >= 1M renders compact
// ("5,056,165,361" → "5.06B"). Smaller values keep their default rendering.
const COMPACT_THRESHOLD = 1_000_000;
// en-US so the compact suffixes read "B"/"M" (matches lib/numbers and the
// existing war-reports chips). en-GB would render "bn"/"m".
const compactFormat: Format = { notation: "compact", maximumFractionDigits: 2 };

/**
 * Number Flow does not animate its first render. After that it only moves when
 * the supplied value actually changes, and it honours reduced-motion settings.
 *
 * SSR: @number-flow/react renders a custom element that paints into a shadow
 * root — the server HTML would contain the element but NOT the number, so
 * server-rendered pages (landing) would show empty tiles until JS ran. Until
 * hydration completes we render the formatted value as a plain span (same
 * string the flow would show: compact >= 1M, en-GB grouping below), then swap
 * in the animated element. Server and first client render match, so there is
 * no hydration mismatch, and the number is visible in the first HTML frame.
 */
export default function FlowNumber({
  value,
  className,
  locales = "en-GB",
  format,
  prefix,
  suffix,
}: FlowNumberProps) {
  const v = Number.isFinite(value) ? value : 0;
  const useCompact = Math.abs(v) >= COMPACT_THRESHOLD;

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    // formatCompact mirrors the flow's own output (en-US compact w/ 2dp for
    // >= 1M, en-GB grouped full value below) so the swap is invisible.
    return (
      <span className={className}>
        {prefix}
        {formatCompact(v)}
        {suffix}
      </span>
    );
  }

  return (
    <NumberFlow
      className={className}
      value={v}
      locales={useCompact && !format ? "en-US" : locales}
      format={format ?? (useCompact ? compactFormat : undefined)}
      prefix={prefix}
      suffix={suffix}
      respectMotionPreference
    />
  );
}
