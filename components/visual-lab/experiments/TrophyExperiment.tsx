"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
import { Float } from "@react-three/drei/core/Float";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { useState } from "react";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

function Trophy({ detailed, active, glow, onGlow }: { detailed: boolean; active: boolean; glow: boolean; onGlow: () => void }) {
  const segments = detailed ? 64 : 28;
  return (
    <Float speed={active ? 1.25 : 0} rotationIntensity={active ? 0.18 : 0} floatIntensity={active ? 0.24 : 0}>
      <group position={[0, 0.15, 0]} rotation={[0, -0.25, 0]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.72, 0.42, 0.92, segments, 1]} />
          <meshStandardMaterial color={glow ? "#f6c4ff" : "#c997ff"} metalness={0.82} roughness={0.2} emissive={glow ? "#6d2ea1" : "#1d0c30"} emissiveIntensity={glow ? 1.5 : 0.4} />
        </mesh>
        <mesh position={[0, 1.38, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.71, 0.075, 14, segments]} />
          <meshStandardMaterial color="#e5c7ff" metalness={0.9} roughness={0.18} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.68, 0.93, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.72, 1, 1]} castShadow>
            <torusGeometry args={[0.38, 0.075, 12, detailed ? 36 : 20]} />
            <meshStandardMaterial color="#b17ce5" metalness={0.78} roughness={0.24} />
          </mesh>
        ))}
        <mesh position={[0, 0.23, 0]} castShadow>
          <cylinderGeometry args={[0.115, 0.17, 0.5, 24]} />
          <meshStandardMaterial color="#c7a0eb" metalness={0.8} roughness={0.22} />
        </mesh>
        <mesh position={[0, -0.06, 0]} castShadow>
          <cylinderGeometry args={[0.48, 0.58, 0.18, detailed ? 48 : 24]} />
          <meshStandardMaterial color="#a66cd7" metalness={0.72} roughness={0.28} />
        </mesh>
        <mesh position={[0, -0.28, 0]} onClick={(event) => { event.stopPropagation(); onGlow(); }} castShadow>
          <boxGeometry args={[1.25, 0.34, 0.88]} />
          <meshStandardMaterial color="#1e1428" metalness={0.4} roughness={0.38} emissive={glow ? "#562183" : "#050208"} emissiveIntensity={glow ? 1.4 : 0.1} />
        </mesh>
        <mesh position={[0, -0.27, 0.446]}>
          <boxGeometry args={[0.82, 0.16, 0.015]} />
          <meshStandardMaterial color="#bd8cf0" metalness={0.65} roughness={0.25} emissive="#4d1f73" emissiveIntensity={0.6} />
        </mesh>
      </group>
    </Float>
  );
}

export default function TrophyExperiment({ active, quality, reducedMotion }: ExperimentProps) {
  const [glow, setGlow] = useState(false);
  const full = quality === "full";
  return (
    <div className={`${s.fill} ${s.trophyStage}`}>
      <Canvas
        shadows={quality !== "battery"}
        dpr={quality === "full" ? [1, 1.75] : [1, 1.2]}
        frameloop={active && !reducedMotion ? "always" : "demand"}
        camera={{ position: [3.25, 2.4, 4.1], fov: 39, near: 0.1, far: 100 }}
        gl={{ antialias: quality !== "battery", alpha: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#09070d"]} />
        <ambientLight intensity={0.82} />
        <directionalLight position={[3, 5, 4]} intensity={2.5} color="#ead7ff" castShadow={quality !== "battery"} />
        <pointLight position={[-3, 1.4, 2]} intensity={22} distance={8} color="#8b42ff" />
        <pointLight position={[2.5, 0.4, -2]} intensity={14} distance={7} color="#3cafff" />
        <Trophy detailed={full} active={active && !reducedMotion} glow={glow} onGlow={() => setGlow((value) => !value)} />
        <ContactShadows position={[0, -0.49, 0]} opacity={0.52} scale={7} blur={quality === "battery" ? 2 : 2.8} far={4} frames={active && full ? Infinity : 1} />
        <OrbitControls enablePan={false} minDistance={3.3} maxDistance={6.5} minPolarAngle={0.7} maxPolarAngle={1.75} autoRotate={active && !reducedMotion} autoRotateSpeed={0.65} />
      </Canvas>
      <div className={s.trophyCaption}><span>PROCEDURAL 3D GEOMETRY</span><span>DRAG · PINCH · TAP PLINTH</span></div>
    </div>
  );
}
