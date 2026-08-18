export type LabQuality = "battery" | "balanced" | "full";
export type LabQualityMode = "auto" | LabQuality;

export type ExperimentProps = {
  active: boolean;
  quality: LabQuality;
  reducedMotion: boolean;
};

export type ExperimentId =
  | "aurora"
  | "particles"
  | "rings"
  | "leaderboard"
  | "number-flow"
  | "liquid-fill"
  | "rive"
  | "trophy"
  | "pixi-pets"
  | "spotlight-cards";

export type ExperimentMeta = {
  id: ExperimentId;
  number: string;
  title: string;
  technology: string;
  source: string;
  summary: string;
  interaction: string;
  phone: string;
  performance: "Light" | "Moderate" | "Heavy";
  suitability: "Recommended" | "Targeted use" | "Prototype only";
  verdict: string;
};
