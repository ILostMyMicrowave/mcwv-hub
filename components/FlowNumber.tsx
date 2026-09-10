"use client";

import NumberFlow, { type Format } from "@number-flow/react";

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
