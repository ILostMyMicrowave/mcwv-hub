"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

export default function MagicRingsExperiment({ active, quality, reducedMotion }: ExperimentProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [burst, setBurst] = useState(0);
  const ringCount = quality === "battery" ? 3 : quality === "balanced" ? 5 : 7;

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active || quality === "battery") return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 18,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 18,
    });
  };

  return (
    <div
      ref={stageRef}
      className={`${s.fill} ${s.centered} ${s.ringsStage}`}
      onPointerMove={move}
      onPointerLeave={() => setPointer({ x: 0, y: 0 })}
      onPointerDown={() => setBurst((value) => value + 1)}
    >
      <div className={s.ringsGlow} />
      <motion.svg
        className={s.ringsSvg}
        viewBox="0 0 400 400"
        aria-hidden="true"
        animate={{ x: pointer.x * 0.35, y: pointer.y * 0.35 }}
        transition={{ type: "spring", stiffness: 80, damping: 18 }}
      >
        <defs>
          <linearGradient id="mcwv-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#e6b8ff" />
            <stop offset=".52" stopColor="#8c4cff" />
            <stop offset="1" stopColor="#54d5ff" />
          </linearGradient>
          <filter id="mcwv-ring-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {Array.from({ length: ringCount }, (_, index) => {
          const radius = 62 + index * 21;
          return (
            <motion.circle
              key={`${index}-${burst}`}
              cx="200"
              cy="200"
              r={radius}
              fill="none"
              stroke="url(#mcwv-ring-gradient)"
              strokeWidth={index % 2 ? 1 : 1.8}
              strokeDasharray={`${18 + index * 5} ${9 + index * 3}`}
              opacity={0.75 - index * 0.065}
              filter="url(#mcwv-ring-glow)"
              initial={false}
              animate={active && !reducedMotion ? {
                rotate: (index % 2 ? -1 : 1) * 360,
                scale: [1, 1 + (burst ? 0.018 : 0.008), 1],
              } : { rotate: index * 17, scale: 1 }}
              transition={{
                rotate: { duration: 14 + index * 3, ease: "linear", repeat: Infinity },
                scale: { duration: 0.55, ease: "easeOut" },
              }}
              style={{ transformOrigin: "200px 200px" }}
            />
          );
        })}
      </motion.svg>
      <motion.div
        className={s.logoCore}
        animate={{ x: pointer.x * -0.2, y: pointer.y * -0.2, scale: burst ? [1, 1.08, 1] : 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
      >
        <Image src="/mcwv-logo.png" alt="MCWV logo surrounded by energy rings" width={150} height={150} draggable={false} />
      </motion.div>
      <span className={s.ringHint}>{active ? "MOVE / TAP TO DISTURB" : "RINGS PAUSED"}</span>
    </div>
  );
}
