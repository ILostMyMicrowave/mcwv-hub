"use client";

export default function FallbackStage({
  symbol,
  label,
}: {
  symbol: string;
  label: string;
}) {
  return (
    <div className="vl-fallback" aria-label={label}>
      <span aria-hidden="true">{symbol}</span>
      <p>{label}</p>
    </div>
  );
}
