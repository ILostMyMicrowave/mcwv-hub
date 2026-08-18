"use client";

import NumberFlow, { NumberFlowGroup } from "@number-flow/react";
import { useEffect, useState } from "react";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

const BASE = { total: 128450, war: 36840, streak: 17, members: 42 };

export default function NumberFlowExperiment({ active, reducedMotion }: ExperimentProps) {
  const [values, setValues] = useState(BASE);

  const addWar = () => setValues((current) => ({
    total: current.total + 2840,
    war: current.war + 2840,
    streak: current.streak + 1,
    members: current.members,
  }));

  useEffect(() => {
    if (!active || reducedMotion) return;
    const timer = window.setTimeout(addWar, 750);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion]);

  return (
    <div className={`${s.fill} ${s.centered} ${s.numberStage}`}>
      <NumberFlowGroup>
        <div className={s.numberShell}>
          <span className={s.totalLabel}>DEMO CLAN CONTRIBUTION</span>
          <NumberFlow className={s.bigNumber} value={values.total} format={{ useGrouping: true }} respectMotionPreference />
          <div className={s.numberMetrics}>
            <div><small>War points</small><NumberFlow value={values.war} format={{ useGrouping: true }} respectMotionPreference /></div>
            <div><small>Win streak</small><NumberFlow value={values.streak} suffix="×" respectMotionPreference /></div>
            <div><small>Contributors</small><NumberFlow value={values.members} respectMotionPreference /></div>
          </div>
          <div className={s.numberActions}>
            <span>+2,840 SAMPLE POINTS</span>
            <button type="button" className={s.demoButton} onClick={addWar}>Add demo war</button>
          </div>
        </div>
      </NumberFlowGroup>
    </div>
  );
}
