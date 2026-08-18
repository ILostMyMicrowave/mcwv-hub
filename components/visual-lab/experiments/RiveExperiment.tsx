"use client";

import { Alignment, Fit, Layout, useRive } from "@rive-app/react-canvas";
import { useState } from "react";
import type { ExperimentProps } from "../types";
import FallbackStage from "./FallbackStage";
import s from "./Experiments.module.css";

function LiveRive({ quality }: Pick<ExperimentProps, "quality">) {
  const [playing, setPlaying] = useState(true);
  const { rive, RiveComponent } = useRive({
    src: "/visual-lab/vehicles.riv",
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  }, {
    useDevicePixelRatio: true,
    customDevicePixelRatio: quality === "full" ? Math.min(devicePixelRatio, 1.75) : 1,
    shouldResizeCanvasToContainer: true,
  });

  const toggle = () => {
    if (!rive) return;
    if (playing) rive.pause();
    else rive.play();
    setPlaying((current) => !current);
  };

  return (
    <div className={`${s.fill} ${s.riveStage}`}>
      <RiveComponent className={s.riveCanvas} onPointerDown={toggle} aria-label="Rive vehicles vector animation" />
      <div className={s.riveOverlay}>
        <span>LOCAL .RIV ASSET</span>
        <button className={s.demoButton} type="button" onClick={toggle}>{playing ? "Pause vector" : "Resume vector"}</button>
      </div>
    </div>
  );
}

export default function RiveExperiment({ active, quality }: ExperimentProps) {
  if (!active) return <FallbackStage symbol="◆" label="Rive runtime paused — local vector asset retained" />;
  return <LiveRive quality={quality} />;
}
