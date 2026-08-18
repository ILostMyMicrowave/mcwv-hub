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
  return (
    <NumberFlow
      className={className}
      value={Number.isFinite(value) ? value : 0}
      locales={locales}
      format={format}
      prefix={prefix}
      suffix={suffix}
      respectMotionPreference
    />
  );
}
