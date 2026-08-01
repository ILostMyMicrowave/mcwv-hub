"use client";

import Link from "next/link";
import { useCallback, useState, type CSSProperties } from "react";
import CutsceneStage, { CutsceneLogoImage } from "@/components/CutsceneStage";

const END_SUB_TEXT = "WAR MODE ENGAGED";

function EndFrame({ onReplay, instant = false }: { onReplay: () => void; instant?: boolean }) {
  return (
    <div className={`cs-end${instant ? " cs-end-instant" : ""}`}>
      <div className="cs-end-emblem-wrap">
        <div className="cs-end-reactor" aria-hidden="true" />
        <div className="cs-end-reactor cs-end-reactor-2" aria-hidden="true" />
        <div className="cs-end-logo">
          <CutsceneLogoImage />
        </div>
      </div>
      <div className="cs-end-sub" aria-label={END_SUB_TEXT}>
        {Array.from(END_SUB_TEXT).map((char, index) => (
          <span key={index} className="cs-end-letter" style={{ "--ei": index } as CSSProperties} aria-hidden="true">
            {char === " " ? " " : char}
          </span>
        ))}
      </div>
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
      <CutsceneStage
        key={runId}
        mode="demo"
        onSkip={() => setSkipped(true)}
        endOverlay={<EndFrame onReplay={replay} />}
      />
    </main>
  );
}
