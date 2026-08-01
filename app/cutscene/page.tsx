"use client";

import Link from "next/link";
import { useCallback, useState, type CSSProperties } from "react";
import "./cutscene.css";

const BOOT_LINES = ["CONNECTING TO BATTLE HQ", "SYNCING CLAN DATA", "SHARPENING SWORDS"];
const WORDMARK = ["M", "C", "W", "V"];

/**
 * ⚔️ MCWV sigil — crossed swords + ring, drawn stroke-by-stroke.
 * PLACEHOLDER: once the real logo lands, drop it in /public (e.g. /mcwv-logo.png)
 * and replace <Sigil /> below with:
 *   <img src="/mcwv-logo.png" alt="MCWV" className="cs-logo" />
 * (keep the same .cs-sigil wrappers so the glitch/entrance timing still works)
 */
function Sigil() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle className="cs-draw-path" style={{ "--pi": 0 } as CSSProperties} pathLength={1} cx="60" cy="60" r="52" />
      {/* Sword A — bottom-left to top-right */}
      <path className="cs-draw-path" style={{ "--pi": 1 } as CSSProperties} pathLength={1} d="M86 32 L56 62" />
      <path className="cs-draw-path" style={{ "--pi": 2 } as CSSProperties} pathLength={1} d="M48 54 L64 70" />
      <path className="cs-draw-path" style={{ "--pi": 3 } as CSSProperties} pathLength={1} d="M56 62 L41 77" />
      <circle className="cs-draw-path" style={{ "--pi": 4 } as CSSProperties} pathLength={1} cx="38" cy="80" r="3.5" />
      {/* Sword B — bottom-right to top-left */}
      <path className="cs-draw-path" style={{ "--pi": 5 } as CSSProperties} pathLength={1} d="M34 32 L64 62" />
      <path className="cs-draw-path" style={{ "--pi": 6 } as CSSProperties} pathLength={1} d="M72 54 L56 70" />
      <path className="cs-draw-path" style={{ "--pi": 7 } as CSSProperties} pathLength={1} d="M64 62 L79 77" />
      <circle className="cs-draw-path" style={{ "--pi": 8 } as CSSProperties} pathLength={1} cx="82" cy="80" r="3.5" />
    </svg>
  );
}

function EndFrame({ onReplay, instant = false }: { onReplay: () => void; instant?: boolean }) {
  return (
    <div className={`cs-end${instant ? " cs-end-instant" : ""}`}>
      <div className="cs-end-emblem">⚔️</div>
      <div className="cs-end-title">MCWV</div>
      <div className="cs-end-sub">CUTSCENE CONCEPT — 5.0S — PURE CSS</div>
      <div className="cs-end-actions">
        <Link href="/" className="cs-btn cs-btn-primary">
          ENTER HUB
        </Link>
        <button type="button" onClick={onReplay} className="cs-btn">
          ↻ REPLAY
        </button>
      </div>
    </div>
  );
}

export default function CutscenePage() {
  const [runId, setRunId] = useState(0);
  const [skipped, setSkipped] = useState(false);

  const replay = useCallback(() => {
    setSkipped(false);
    setRunId((value) => value + 1);
  }, []);

  if (skipped) {
    return (
      <main className="cs-root">
        <EndFrame onReplay={replay} instant />
      </main>
    );
  }

  return (
    <main className="cs-root">
      {/* key = full remount on replay so every CSS animation restarts */}
      <div key={runId} className="cs-stage">
        {/* Atmosphere */}
        <div className="cs-stars cs-stars-a" aria-hidden="true" />
        <div className="cs-stars cs-stars-b" aria-hidden="true" />
        <div className="cs-sweepline" aria-hidden="true" />
        <div className="cs-vignette" aria-hidden="true" />
        <div className="cs-scanlines" aria-hidden="true" />
        <div className="cs-grain" aria-hidden="true" />

        {/* Cinematic letterbox */}
        <div className="cs-bar cs-bar-top" aria-hidden="true" />
        <div className="cs-bar cs-bar-bottom" aria-hidden="true" />

        {/* Hero */}
        <div className="cs-hero">
          <div className="cs-emblem">
            <div className="cs-emblem-jitter">
              <div className="cs-sigil cs-sigil-rgb cs-sigil-a" aria-hidden="true">
                <Sigil />
              </div>
              <div className="cs-sigil cs-sigil-rgb cs-sigil-b" aria-hidden="true">
                <Sigil />
              </div>
              <div className="cs-sigil cs-sigil-main">
                <Sigil />
              </div>
            </div>
          </div>

          <div className="cs-word" aria-label="MCWV">
            {WORDMARK.map((letter, index) => (
              <span key={letter} className="cs-letter" style={{ "--li": index } as CSSProperties}>
                {letter}
              </span>
            ))}
          </div>

          <div className="cs-tagline">
            <span className="cs-typed">FORGED FOR WAR.</span>
            <span className="cs-caret">▍</span>
          </div>
        </div>

        {/* Energy slashes */}
        <div className="cs-slash cs-slash-1" aria-hidden="true" />
        <div className="cs-slash cs-slash-2" aria-hidden="true" />

        {/* Fake boot sequence */}
        <div className="cs-boot" aria-hidden="true">
          {BOOT_LINES.map((line, index) => (
            <div key={line} className="cs-boot-line" style={{ "--bi": index } as CSSProperties}>
              ▸ {line} <span className="cs-boot-ok">[OK]</span>
            </div>
          ))}
          <div className="cs-progress">
            <div className="cs-progress-fill" />
          </div>
        </div>

        {/* Outro flash */}
        <div className="cs-flash" aria-hidden="true" />

        <button type="button" className="cs-skip" onClick={() => setSkipped(true)}>
          SKIP ⏵
        </button>

        {/* End frame — fades in at ~4.95s */}
        <EndFrame onReplay={replay} />
      </div>
    </main>
  );
}
