import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "MCWV — Cutscene",
  description: "5-second cinematic intro concept for MCWV Hub",
};

export default function CutsceneLayout({ children }: { children: ReactNode }) {
  return children;
}
