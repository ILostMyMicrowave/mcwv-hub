"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import "echarts-liquidfill";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

export default function LiquidFillExperiment({ active, quality, reducedMotion }: ExperimentProps) {
  const [progress, setProgress] = useState(0.72);
  const advance = () => setProgress((current) => current >= 0.96 ? 0.61 : Math.min(0.99, current + 0.07));

  useEffect(() => {
    if (!active || reducedMotion) return;
    const timer = window.setTimeout(advance, 850);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion]);

  const option = useMemo(() => ({
    animation: !reducedMotion,
    series: [{
      type: "liquidFill",
      radius: quality === "battery" ? "61%" : "68%",
      center: ["50%", "51%"],
      data: [progress, Math.max(0, progress - 0.055), Math.max(0, progress - 0.11)],
      amplitude: quality === "battery" ? 2 : 5,
      waveAnimation: active && !reducedMotion,
      animationDuration: reducedMotion ? 0 : 850,
      animationDurationUpdate: reducedMotion ? 0 : 900,
      color: ["#b56cff", "#8148d2", "#4c2a8c"],
      backgroundStyle: { color: "rgba(39, 23, 57, .82)", borderColor: "rgba(205, 169, 255, .2)", borderWidth: 1 },
      outline: {
        show: true,
        borderDistance: 7,
        itemStyle: { borderColor: "#a76bef", borderWidth: 2, shadowBlur: 24, shadowColor: "rgba(153, 86, 238, .55)" },
      },
      label: {
        show: true,
        color: "#f8f2ff",
        insideColor: "#ffffff",
        fontFamily: "monospace",
        fontSize: quality === "battery" ? 26 : 34,
        fontWeight: 700,
        formatter: `${Math.round(progress * 100)}%`,
      },
    }],
  }), [active, progress, quality, reducedMotion]);

  return (
    <div className={`${s.fill} ${s.centered} ${s.liquidStage}`}>
      {active ? (
        <ReactECharts
          className={s.chart}
          option={option}
          notMerge
          lazyUpdate
          opts={{ renderer: "canvas", devicePixelRatio: quality === "full" ? Math.min(devicePixelRatio, 1.75) : 1 }}
        />
      ) : (
        <div className={s.liquidFallback}><i /></div>
      )}
      <div className={s.chartNote}>
        <span>DEMO WAR TARGET</span>
        <button type="button" className={s.demoButton} onClick={advance}>+ progress</button>
      </div>
    </div>
  );
}
