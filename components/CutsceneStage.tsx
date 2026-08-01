"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import "./cutscene.css";

/**
 * MCWV cutscene stage — the pure visual sequence (atmosphere, materialization,
 * slashes, tagline, terminal). Two modes:
 *  - "loader": boot intro overlay; fires onFinish shortly after the outro flash,
 *              timed from page birth so it lands right even if hydration is slow.
 *  - "demo":   showcase mode for /cutscene (skip + replay handled by the page).
 */
const BOOT_LINES = ["CONNECTING TO BATTLE HQ", "CHARGING NEON CORE", "SHARPENING SWORDS"];

const STREAK_ROTATIONS = [0, 60, 120, 180, 240, 300];

const SPARKS: { sx: number; sy: number; wave: 1 | 2 }[] = [
  { sx: -150, sy: -95, wave: 1 },
  { sx: 145, sy: -115, wave: 1 },
  { sx: -125, sy: 105, wave: 1 },
  { sx: 165, sy: 85, wave: 1 },
  { sx: -55, sy: -165, wave: 1 },
  { sx: 75, sy: 155, wave: 2 },
  { sx: -175, sy: -35, wave: 2 },
  { sx: 135, sy: -55, wave: 2 },
  { sx: -95, sy: 135, wave: 2 },
  { sx: 55, sy: -145, wave: 2 },
];

const LOADER_EXIT_AT_MS = 6150;

export function CutsceneLogoImage({ decorative = false }: { decorative?: boolean }) {
  return (
    <img
      src="/mcwv-logo.png"
      alt={decorative ? "" : "MCWV"}
      aria-hidden={decorative || undefined}
      draggable={false}
    />
  );
}

export default function CutsceneStage({
  mode,
  onSkip,
  onFinish,
  endOverlay = null,
}: {
  mode: "loader" | "demo";
  onSkip?: () => void;
  onFinish?: () => void;
  /** Rendered inside .cs-stage at the end (demo end frame). Null in loader mode. */
  endOverlay?: ReactNode;
}) {
  useEffect(() => {
    if (mode !== "loader" || !onFinish) return;
    const remaining = Math.max(900, LOADER_EXIT_AT_MS - performance.now());
    const timer = window.setTimeout(onFinish, remaining);
    return () => window.clearTimeout(timer);
  }, [mode, onFinish]);

  return (
    <div className="cs-stage">
      {/* Atmosphere */}
      <div className="cs-stars cs-stars-a" aria-hidden="true" />
      <div className="cs-stars cs-stars-b" aria-hidden="true" />
      <div className="cs-static" aria-hidden="true" />
      <div className="cs-sweepline" aria-hidden="true" />
      <div className="cs-vignette" aria-hidden="true" />
      <div className="cs-hueflash" aria-hidden="true" />
      <div className="cs-scanlines" aria-hidden="true" />
      <div className="cs-grain" aria-hidden="true" />

      {/* Cinematic letterbox */}
      <div className="cs-bar cs-bar-top" aria-hidden="true" />
      <div className="cs-bar cs-bar-bottom" aria-hidden="true" />

      {/* Converging energy streaks */}
      {STREAK_ROTATIONS.map((rotation, index) => (
        <div
          key={rotation}
          className="cs-fly"
          style={{ "--rot": `${rotation}deg`, "--fi": index } as CSSProperties}
          aria-hidden="true"
        />
      ))}

      {/* Materialization FX: collapse ring + implosion core + strobe */}
      <div className="cs-implode-ring" aria-hidden="true" />
      <div className="cs-implode-core" aria-hidden="true" />
      <div className="cs-strobe" aria-hidden="true" />

      {/* ONE centered column: emblem → tagline → terminal (can never overlap) */}
      <div className="cs-hero">
        <div className="cs-emblem">
          <div className="cs-reactor" aria-hidden="true" />
          <div className="cs-reactor cs-reactor-2" aria-hidden="true" />
          <div className="cs-emblem-jitter">
            <div className="cs-sigil cs-sigil-rgb cs-sigil-a">
              <CutsceneLogoImage decorative />
            </div>
            <div className="cs-sigil cs-sigil-rgb cs-sigil-b">
              <CutsceneLogoImage decorative />
            </div>
            <div className="cs-sigil cs-sigil-main">
              <CutsceneLogoImage />
            </div>
          </div>
          <div className="cs-shock cs-shock-1" aria-hidden="true" />
          <div className="cs-shock cs-shock-2" aria-hidden="true" />
        </div>

        <div className="cs-tagline">
          <span className="cs-typed">FORGED FOR WAR.</span>
          <span className="cs-caret">▍</span>
        </div>

        {/* Terminal boot panel — in normal flow, margin keeps it clear of the tagline */}
        <div className="cs-boot" aria-hidden="true">
          {BOOT_LINES.map((line, index) => (
            <div key={line} className="cs-boot-line" style={{ "--bi": index } as CSSProperties}>
              ▸ {line} <span className="cs-boot-ok">[OK]</span>
            </div>
          ))}
          <div className="cs-boot-line cs-boot-granted" style={{ "--bi": 3 } as CSSProperties}>
            ✦ CLEARANCE: MCWV OWNER <span className="cs-boot-ok">[GRANTED]</span>
          </div>
          <div className="cs-progress">
            <div className="cs-progress-fill" />
            <span className="cs-progress-head" />
          </div>
        </div>
      </div>

      {/* Energy slashes */}
      <div className="cs-slash cs-slash-1" aria-hidden="true" />
      <div className="cs-slash cs-slash-2" aria-hidden="true" />
      <div className="cs-afterglow" aria-hidden="true" />

      {/* Spark bursts, synced to the slashes */}
      {SPARKS.map((spark, index) => (
        <span
          key={index}
          className={`cs-spark cs-spark-w${spark.wave}`}
          style={{ "--sx": `${spark.sx}px`, "--sy": `${spark.sy}px` } as CSSProperties}
          aria-hidden="true"
        />
      ))}

      {/* Outro flash */}
      <div className="cs-flash" aria-hidden="true" />

      <button type="button" className="cs-skip" onClick={onSkip}>
        SKIP
      </button>

      {/* Demo end frame (loader mode renders nothing here) */}
      {endOverlay}
    </div>
  );
}
