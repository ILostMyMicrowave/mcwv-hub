"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

type Agent = { view: Container; vx: number; vy: number; phase: number };
const EMOJI = ["🐉", "🦊", "🐸", "🐼", "🐯", "🐙", "🦄", "🐲"];
const COLORS = [0x8d52db, 0x3c92cc, 0xc651a4, 0x45a888, 0xc28743];

export default function PixiPetsExperiment({ active, quality, reducedMotion }: ExperimentProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !active) return;
    const app = new Application();
    let cancelled = false;
    let pointerActive = false;
    const pointer = { x: 0, y: 0 };
    const count = quality === "battery" ? 15 : quality === "balanced" ? 30 : 52;
    const agents: Agent[] = [];

    const setup = async () => {
      await app.init({
        resizeTo: mount,
        backgroundAlpha: 0,
        antialias: quality === "full",
        autoDensity: true,
        resolution: quality === "full" ? Math.min(devicePixelRatio, 1.6) : 1,
        powerPreference: "high-performance",
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      mount.appendChild(app.canvas);

      for (let index = 0; index < count; index += 1) {
        const view = new Container();
        const disk = new Graphics().circle(0, 0, quality === "battery" ? 14 : 17).fill({ color: COLORS[index % COLORS.length], alpha: 0.24 });
        disk.stroke({ color: 0xd9b9ff, width: 1, alpha: 0.32 });
        const pet = new Text({ text: EMOJI[index % EMOJI.length], style: { fontSize: quality === "battery" ? 18 : 22 } });
        pet.anchor.set(0.5);
        view.addChild(disk, pet);
        view.position.set(Math.random() * app.screen.width, Math.random() * app.screen.height);
        view.scale.set(0.75 + Math.random() * 0.45);
        app.stage.addChild(view);
        agents.push({ view, vx: (Math.random() - 0.5) * 1.4, vy: (Math.random() - 0.5) * 1.4, phase: Math.random() * Math.PI * 2 });
      }

      const locate = (event: PointerEvent) => {
        const rect = app.canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * app.screen.width;
        pointer.y = ((event.clientY - rect.top) / rect.height) * app.screen.height;
        pointerActive = true;
      };
      const release = () => { pointerActive = false; };
      app.canvas.addEventListener("pointermove", locate);
      app.canvas.addEventListener("pointerdown", locate);
      app.canvas.addEventListener("pointerleave", release);

      if (reducedMotion) {
        app.ticker.stop();
      } else {
        app.ticker.maxFPS = quality === "battery" ? 30 : quality === "balanced" ? 45 : 60;
        app.ticker.add((ticker) => {
          const dt = Math.min(ticker.deltaTime, 2);
          const width = app.screen.width;
          const height = app.screen.height;
          for (let index = 0; index < agents.length; index += 1) {
            const agent = agents[index];
            agent.phase += 0.012 * dt;
            if (pointerActive) {
              const dx = pointer.x - agent.view.x;
              const dy = pointer.y - agent.view.y;
              const distance = Math.max(Math.hypot(dx, dy), 35);
              agent.vx += (dx / distance) * 0.018 * dt;
              agent.vy += (dy / distance) * 0.018 * dt;
            }
            agent.vx += Math.cos(agent.phase + index) * 0.003;
            agent.vy += Math.sin(agent.phase * 0.8 + index) * 0.003;
            agent.vx *= 0.993;
            agent.vy *= 0.993;
            agent.view.x += agent.vx * dt;
            agent.view.y += agent.vy * dt;
            if (agent.view.x < -24) agent.view.x = width + 24;
            if (agent.view.x > width + 24) agent.view.x = -24;
            if (agent.view.y < -24) agent.view.y = height + 24;
            if (agent.view.y > height + 24) agent.view.y = -24;
          }
        });
      }

      app.canvas.dataset.listenersAttached = "true";
      return () => {
        app.canvas.removeEventListener("pointermove", locate);
        app.canvas.removeEventListener("pointerdown", locate);
        app.canvas.removeEventListener("pointerleave", release);
      };
    };

    let removeListeners: (() => void) | undefined;
    setup().then((cleanup) => { removeListeners = cleanup; }).catch(() => undefined);
    return () => {
      cancelled = true;
      removeListeners?.();
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, [active, quality, reducedMotion]);

  if (!active) {
    return (
      <div className={`${s.fill} ${s.pixiStage} ${s.pixiFallback}`} aria-label="Paused Pixi pet swarm">
        {EMOJI.slice(0, 5).map((pet) => <span key={pet}>{pet}</span>)}
        <span className={s.stageCaption}>PIXIJ SUSPENDED // SPRITES RETIRED</span>
      </div>
    );
  }

  return <div ref={mountRef} className={`${s.fill} ${s.pixiStage}`}><span className={s.stageCaption}>MOVE OR TAP TO LEAD THE DEMO SWARM</span></div>;
}
