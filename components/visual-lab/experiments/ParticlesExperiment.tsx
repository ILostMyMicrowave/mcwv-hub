"use client";

import Particles, { ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine, ISourceOptions } from "@tsparticles/engine";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

const registerSlimEngine = async (engine: Engine) => loadSlim(engine);

export default function ParticlesExperiment({ active, quality, reducedMotion }: ExperimentProps) {
  const count = quality === "battery" ? 24 : quality === "balanced" ? 46 : 78;
  const options: ISourceOptions = {
    fullScreen: { enable: false },
    background: { color: { value: "transparent" } },
    // Keep canvas density predictable on 3×/4× phone screens; visual detail
    // comes from the profile's particle count instead of uncapped retina DPR.
    detectRetina: false,
    fpsLimit: quality === "battery" ? 30 : quality === "balanced" ? 45 : 60,
    pauseOnBlur: true,
    pauseOnOutsideViewport: true,
    interactivity: {
      detectsOn: "window",
      events: {
        onHover: { enable: !reducedMotion, mode: "repulse" },
        onClick: { enable: true, mode: "push" },
        resize: { enable: true },
      },
      modes: {
        push: { quantity: quality === "battery" ? 1 : 3 },
        repulse: { distance: 95, duration: 0.35 },
      },
    },
    particles: {
      color: { value: ["#b27cff", "#7449d7", "#e7d7ff", "#66d6ff"] },
      links: {
        color: "#9867dc",
        distance: quality === "battery" ? 95 : 125,
        enable: true,
        opacity: 0.2,
        width: 1,
      },
      move: {
        enable: !reducedMotion,
        speed: quality === "battery" ? 0.35 : 0.7,
        outModes: { default: "bounce" },
      },
      number: { value: count, density: { enable: true, width: 800, height: 500 } },
      opacity: { value: { min: 0.3, max: 0.8 } },
      shape: { type: "circle" },
      size: { value: { min: 1, max: quality === "full" ? 3.5 : 2.5 } },
    },
  };

  if (!active) {
    return (
      <div className={`${s.fill} ${s.particleStatic}`} aria-label="Paused particle field">
        {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
        <span className={s.stageCaption}>PARTICLE ENGINE PAUSED</span>
      </div>
    );
  }

  return (
    <div className={`${s.fill} ${s.particleBackdrop}`}>
      <ParticlesProvider init={registerSlimEngine}>
        <Particles id={`mcwv-lab-particles-${quality}`} options={options} />
      </ParticlesProvider>
      <span className={s.stageCaption}>TAP TO ADD // MOVE TO REPEL</span>
    </div>
  );
}
