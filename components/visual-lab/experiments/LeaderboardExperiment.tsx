"use client";

import { LayoutGroup, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

type DemoMember = { id: number; name: string; role: string; score: number; delta: number; color: string };
const INITIAL: DemoMember[] = [
  { id: 1, name: "NovaByte", role: "Demo officer", score: 14820, delta: 240, color: "#7b49c8" },
  { id: 2, name: "PixelWarden", role: "Demo member", score: 14560, delta: 610, color: "#b04d9e" },
  { id: 3, name: "ArcRunner", role: "Demo member", score: 13910, delta: 180, color: "#3d78b6" },
  { id: 4, name: "VoidScout", role: "Demo member", score: 13240, delta: 95, color: "#4c9a87" },
];

export default function LeaderboardExperiment({ active, quality, reducedMotion }: ExperimentProps) {
  const [members, setMembers] = useState(INITIAL);
  const [round, setRound] = useState(0);

  const simulate = () => {
    setRound((value) => value + 1);
    setMembers((current) => {
      const boosted = current.map((member) => member.id === 3
        ? { ...member, score: member.score + (member.score < 14500 ? 1250 : 360), delta: 1250 }
        : { ...member, delta: Math.max(35, Math.round(member.delta * 0.42)) });
      return [...boosted].sort((a, b) => b.score - a.score);
    });
  };

  useEffect(() => {
    if (!active || reducedMotion) return;
    const timer = window.setTimeout(simulate, 900);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion]);

  return (
    <div className={`${s.fill} ${s.centered} ${s.leaderboard}`}>
      <div className={s.boardShell}>
        <div className={s.boardTop}>
          <p>DEMO WAR · LIVE ORDER</p>
          <button type="button" className={s.demoButton} onClick={simulate}>Simulate result</button>
        </div>
        <LayoutGroup>
          {members.map((member, index) => (
            <motion.div
              layout
              key={member.id}
              className={s.rankRow}
              transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: quality === "battery" ? 260 : 420, damping: 32 }}
            >
              <motion.span className={s.rankNumber} layout>{String(index + 1).padStart(2, "0")}</motion.span>
              <span className={s.avatar} style={{ "--member-color": member.color } as React.CSSProperties}>{member.name.slice(0, 2).toUpperCase()}</span>
              <span className={s.memberName}><strong>{member.name}</strong><small>{member.role}</small></span>
              <span className={s.memberScore}><strong>{member.score.toLocaleString()}</strong><small>+{member.delta}</small></span>
            </motion.div>
          ))}
        </LayoutGroup>
        <span className={s.stageCaption}>{`SIMULATION ${round.toString().padStart(2, "0")} // NO REAL MEMBER DATA`}</span>
      </div>
    </div>
  );
}
