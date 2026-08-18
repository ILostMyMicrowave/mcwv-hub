"use client";

import { motion } from "motion/react";
import { useState } from "react";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

const MEMBERS = [
  { name: "NovaByte", initials: "NB", role: "Demo officer", score: "14.8K", wins: 31, color: "#7c48bd" },
  { name: "ArcRunner", initials: "AR", role: "Demo MVP", score: "13.9K", wins: 28, color: "#3d75b5" },
  { name: "VoidScout", initials: "VS", role: "Demo member", score: "13.2K", wins: 24, color: "#a04782" },
];

function MemberCard({
  member,
  active,
  subtle,
  reducedMotion,
}: {
  member: (typeof MEMBERS)[number];
  active: boolean;
  subtle: boolean;
  reducedMotion: boolean;
}) {
  const [position, setPosition] = useState({ x: 50, y: 32 });
  const [selected, setSelected] = useState(false);
  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (!active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
  };
  const rotateY = subtle || reducedMotion ? 0 : (position.x - 50) * 0.12;
  const rotateX = subtle || reducedMotion ? 0 : (position.y - 50) * -0.1;

  return (
    <motion.article
      className={s.memberCard}
      style={{ "--card-color": member.color } as React.CSSProperties}
      data-selected={selected}
      onPointerMove={move}
      onPointerLeave={() => setPosition({ x: 50, y: 32 })}
      onPointerDown={() => setSelected((value) => !value)}
      animate={{ rotateX, rotateY, y: selected ? -5 : 0, scale: selected ? 1.025 : 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 24 }}
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected((value) => !value); }}
      aria-label={`${member.name}, ${member.role}. Press to focus card.`}
    >
      <span className={s.cardSpot} style={{ background: `radial-gradient(circle at ${position.x}% ${position.y}%, rgba(211, 175, 255, .32), transparent 54%)` }} />
      <div className={s.memberBadge}>{member.initials}</div>
      <h3>{member.name}</h3>
      <p>{member.role}</p>
      <div className={s.cardStats}>
        <span>{member.score}<small>points</small></span>
        <span>{member.wins}<small>wins</small></span>
      </div>
    </motion.article>
  );
}

export default function SpotlightCardsExperiment({ active, quality, reducedMotion }: ExperimentProps) {
  return (
    <div className={`${s.fill} ${s.centered} ${s.spotlightStage}`}>
      <div className={s.memberCards}>
        {MEMBERS.map((member) => (
          <MemberCard key={member.name} member={member} active={active} subtle={quality === "battery"} reducedMotion={reducedMotion} />
        ))}
      </div>
      <span className={s.stageCaption}>{active ? "MOVE / TAP / PRESS ENTER" : "CARD LIGHTING PAUSED"} · DEMO IDENTITIES</span>
    </div>
  );
}
