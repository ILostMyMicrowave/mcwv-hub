"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  type ComponentType,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ExperimentId,
  ExperimentMeta,
  ExperimentProps,
  LabQuality,
  LabQualityMode,
} from "./types";
import styles from "./VisualLab.module.css";

const loading = () => (
  <div className="vl-fallback" role="status">
    <span aria-hidden="true">◇</span>
    <p>Loading isolated experiment…</p>
  </div>
);

const EXPERIMENT_COMPONENTS: Record<ExperimentId, ComponentType<ExperimentProps>> = {
  aurora: dynamic(() => import("./experiments/AuroraExperiment"), { loading }),
  particles: dynamic(() => import("./experiments/ParticlesExperiment"), { loading }),
  rings: dynamic(() => import("./experiments/MagicRingsExperiment"), { loading }),
  leaderboard: dynamic(() => import("./experiments/LeaderboardExperiment"), { loading }),
  "number-flow": dynamic(() => import("./experiments/NumberFlowExperiment"), { loading }),
  "liquid-fill": dynamic(() => import("./experiments/LiquidFillExperiment"), { loading }),
  rive: dynamic(() => import("./experiments/RiveExperiment"), { loading }),
  trophy: dynamic(() => import("./experiments/TrophyExperiment"), { loading }),
  "pixi-pets": dynamic(() => import("./experiments/PixiPetsExperiment"), { loading }),
  "spotlight-cards": dynamic(() => import("./experiments/SpotlightCardsExperiment"), { loading }),
};

const EXPERIMENTS: ExperimentMeta[] = [
  {
    id: "aurora",
    number: "01",
    title: "Aurora command field",
    technology: "OGL · WebGL shader",
    source: "React Bits Aurora adaptation",
    summary: "A GPU-rendered purple aurora designed as a premium hero or page-atmosphere layer.",
    interaction: "Move or drag across the field to bend its glow.",
    phone: "Good with capped pixel density; a static gradient is used while stopped.",
    performance: "Moderate",
    suitability: "Recommended",
    verdict: "Best reserved for one important hero rather than every page.",
  },
  {
    id: "particles",
    number: "02",
    title: "Tactical dot field",
    technology: "@tsparticles/react · slim engine",
    source: "tsParticles",
    summary: "Responsive network particles that react to pointer and touch without blocking page controls.",
    interaction: "Hover, drag, or tap to disturb and add points.",
    phone: "Excellent in balanced mode; particle count and frame limit scale automatically.",
    performance: "Moderate",
    suitability: "Targeted use",
    verdict: "Useful behind empty states, event pages, and compact headers.",
  },
  {
    id: "rings",
    number: "03",
    title: "MCWV magic rings",
    technology: "Motion · responsive SVG",
    source: "React Bits Magic Rings concept",
    summary: "Layered energy rings frame the real MCWV mark without replacing the logo itself.",
    interaction: "Move to steer the parallax; tap the emblem for a pulse.",
    phone: "Strong; SVG remains crisp and ring count drops in Battery Saver.",
    performance: "Light",
    suitability: "Recommended",
    verdict: "A strong candidate for rare victories, launches, or the boot sequence.",
  },
  {
    id: "leaderboard",
    number: "04",
    title: "Live rank movement",
    technology: "Motion · layout springs",
    source: "motion/react",
    summary: "Demonstration members swap places with spatial continuity instead of abrupt table refreshes.",
    interaction: "Use Simulate result to replay a rank change.",
    phone: "Excellent; DOM-based and keyboard/touch safe.",
    performance: "Light",
    suitability: "Recommended",
    verdict: "The clearest production win for the existing leaderboard.",
  },
  {
    id: "number-flow",
    number: "05",
    title: "Living contribution totals",
    technology: "@number-flow/react",
    source: "NumberFlow",
    summary: "Odometer-grade score changes preserve digit position and make stat updates readable.",
    interaction: "Tap Add demo war to animate a realistic batch of sample totals.",
    phone: "Excellent; tiny runtime footprint and native reduced-motion handling.",
    performance: "Light",
    suitability: "Recommended",
    verdict: "Ideal for scores, streaks, contribution totals, and summary counters.",
  },
  {
    id: "liquid-fill",
    number: "06",
    title: "War target liquid orb",
    technology: "ECharts 5 · echarts-liquidfill",
    source: "Apache ECharts extension",
    summary: "A liquid progress gauge turns a plain percentage into a high-salience campaign target.",
    interaction: "Use + progress to watch the wave and label advance.",
    phone: "Good when limited to one orb; canvas is resized with its card.",
    performance: "Moderate",
    suitability: "Targeted use",
    verdict: "Good for one featured target, but too visually heavy for dense dashboards.",
  },
  {
    id: "rive",
    number: "07",
    title: "Rive vector runtime",
    technology: "@rive-app/react-canvas",
    source: "Rive public vehicles sample",
    summary: "A production vector runtime test using a local .riv asset rather than an external embed.",
    interaction: "Tap the animation or its control to pause and resume.",
    phone: "Good; local asset, responsive canvas, and runtime pauses outside the viewport.",
    performance: "Moderate",
    suitability: "Prototype only",
    verdict: "Promising for a future custom mascot once bespoke MCWV artwork exists.",
  },
  {
    id: "trophy",
    number: "08",
    title: "Genuine 3D trophy",
    technology: "React Three Fiber · Drei · Three.js",
    source: "Procedural MCWV lab scene",
    summary: "A real lit 3D trophy scene—not a video, GIF, or CSS illusion—with orbit controls.",
    interaction: "Drag to orbit, pinch or wheel to zoom, tap the plinth for a glow shift.",
    phone: "Usable in balanced mode with lower DPR and fewer geometry segments.",
    performance: "Heavy",
    suitability: "Targeted use",
    verdict: "Keep for a trophy room or major win reveal, loaded only on demand.",
  },
  {
    id: "pixi-pets",
    number: "09",
    title: "Pixi pet swarm",
    technology: "PixiJS 8",
    source: "Procedural demonstration sprites",
    summary: "A high-volume 2D canvas swarm tests playful pet motion without using real game data.",
    interaction: "Tap or click to attract the swarm; move to lead it.",
    phone: "Balanced mode reduces agents; canvas DPR and frame work are capped.",
    performance: "Heavy",
    suitability: "Prototype only",
    verdict: "Fun for a temporary game event, not a persistent dashboard background.",
  },
  {
    id: "spotlight-cards",
    number: "10",
    title: "Spotlight member cards",
    technology: "Motion · pointer gradients",
    source: "React Bits Spotlight/Tilt concepts",
    summary: "Depth, spotlight, and responsive pointer treatment make member cards feel collectible.",
    interaction: "Move, drag, or tap a card to focus it.",
    phone: "Good; touch focuses cards while tilt is softened on coarse pointers.",
    performance: "Light",
    suitability: "Recommended",
    verdict: "Suitable for member profiles, awards, and compact MVP features.",
  },
];

function Icon({ name }: { name: "star" | "play" | "stop" | "expand" }) {
  if (name === "star") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 2.8Z" /></svg>;
  }
  if (name === "expand") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3H3v5.5M15.5 3H21v5.5M21 15.5V21h-5.5M3 15.5V21h5.5" /></svg>;
  }
  if (name === "stop") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>;
}

function useViewportState(target: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "180px 0px", threshold: 0.01 },
    );
    observer.observe(element);
    const onVisibility = () => setPageVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [target]);

  return { inView, pageVisible };
}

function useFps(active: boolean) {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let frameId = 0;
    let started = performance.now();
    const sample = (now: number) => {
      frame += 1;
      if (now - started >= 1000) {
        setFps(Math.round((frame * 1000) / (now - started)));
        frame = 0;
        started = now;
      }
      frameId = requestAnimationFrame(sample);
    };
    frameId = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frameId);
  }, [active]);

  return active ? fps : null;
}

function ExperimentCard({
  experiment,
  quality,
  reducedMotion,
  favourite,
  onFavourite,
}: {
  experiment: ExperimentMeta;
  quality: LabQuality;
  reducedMotion: boolean;
  favourite: boolean;
  onFavourite: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [launched, setLaunched] = useState(false);
  const [everLaunched, setEverLaunched] = useState(false);
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(false);
  const { inView, pageVisible } = useViewportState(cardRef);
  const effectiveActive = launched && inView && pageVisible;
  const fps = useFps(effectiveActive);
  const Experiment = EXPERIMENT_COMPONENTS[experiment.id];

  const toggleLaunch = () => {
    setEverLaunched(true);
    setLaunched((current) => !current);
  };

  const enterFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage?.requestFullscreen) {
      setFullscreenUnavailable(true);
      return;
    }
    try {
      await stage.requestFullscreen();
      setFullscreenUnavailable(false);
    } catch {
      // A browser can refuse fullscreen even with a direct user gesture.
      setFullscreenUnavailable(true);
    }
  };

  const state = launched
    ? effectiveActive
      ? "running"
      : pageVisible
        ? "paused offscreen"
        : "paused in background"
    : "stopped";

  return (
    <article ref={cardRef} className={styles.card} id={`experiment-${experiment.number}`}>
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.cardKicker}>EXPERIMENT {experiment.number}</p>
          <h2>{experiment.title}</h2>
        </div>
        <button
          className={`${styles.iconButton} ${favourite ? styles.isFavourite : ""}`}
          type="button"
          onClick={onFavourite}
          aria-pressed={favourite}
          aria-label={favourite ? `Remove ${experiment.title} from favourites` : `Favourite ${experiment.title}`}
          title={favourite ? "Remove favourite" : "Save favourite in this browser"}
        >
          <Icon name="star" />
        </button>
      </header>

      <p className={styles.summary}>{experiment.summary}</p>

      <div ref={stageRef} className={styles.stage} data-experiment={experiment.id}>
        <div className={styles.stageHud}>
          <span className={styles.liveState} data-state={effectiveActive ? "live" : "idle"}>
            <i /> {state}
          </span>
          <span>{effectiveActive && fps ? `${fps} FPS` : quality.toUpperCase()}</span>
        </div>
        {everLaunched ? (
          <Experiment active={effectiveActive} quality={quality} reducedMotion={reducedMotion} />
        ) : (
          <button className={styles.stageLaunch} type="button" onClick={toggleLaunch}>
            <span aria-hidden="true">{experiment.number}</span>
            <strong>Launch isolated demo</strong>
            <small>{experiment.interaction}</small>
          </button>
        )}
      </div>

      <div className={styles.controls}>
        <button className={styles.primaryControl} type="button" onClick={toggleLaunch}>
          <Icon name={launched ? "stop" : "play"} />
          {launched ? "Stop" : everLaunched ? "Launch" : "Launch demo"}
        </button>
        <button className={styles.secondaryControl} type="button" onClick={enterFullscreen}>
          <Icon name="expand" /> {fullscreenUnavailable ? "Unavailable here" : "Fullscreen"}
        </button>
      </div>

      <dl className={styles.factGrid}>
        <div><dt>Package / source</dt><dd>{experiment.technology}<small>{experiment.source}</small></dd></div>
        <div><dt>Phone check</dt><dd>{experiment.phone}</dd></div>
        <div><dt>Rendering cost</dt><dd><span data-cost={experiment.performance}>{experiment.performance}</span></dd></div>
        <div><dt>Hub suitability</dt><dd><b>{experiment.suitability}</b><small>{experiment.verdict}</small></dd></div>
      </dl>
    </article>
  );
}

export default function VisualLab() {
  const [mode, setMode] = useState<LabQualityMode>("auto");
  const [favourites, setFavourites] = useState<Set<ExperimentId>>(new Set());
  const [environment, setEnvironment] = useState({
    mobile: false,
    reducedMotion: false,
    saveData: false,
    cores: 8,
  });

  useEffect(() => {
    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => {
      setEnvironment({
        mobile: coarseQuery.matches || window.innerWidth < 760,
        reducedMotion: reduceQuery.matches,
        saveData: Boolean(connection?.saveData),
        cores: navigator.hardwareConcurrency || 4,
      });
    };
    update();
    reduceQuery.addEventListener("change", update);
    coarseQuery.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      reduceQuery.removeEventListener("change", update);
      coarseQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("mcwv-visual-lab-favourites-v1") ?? "[]") as string[];
      const valid = stored.filter((id): id is ExperimentId => EXPERIMENTS.some((item) => item.id === id));
      const timer = window.setTimeout(() => setFavourites(new Set(valid)), 0);
      return () => window.clearTimeout(timer);
    } catch {
      // Browser storage can be disabled; favourites then remain session-only.
    }
  }, []);

  const quality = useMemo<LabQuality>(() => {
    if (mode !== "auto") return mode;
    if (environment.reducedMotion || environment.saveData || environment.cores <= 2) return "battery";
    if (environment.mobile || environment.cores <= 4) return "balanced";
    return "full";
  }, [environment, mode]);

  const automaticReason = environment.reducedMotion
    ? "reduced-motion preference"
    : environment.saveData
      ? "data saver"
      : environment.mobile
        ? "mobile / touch device"
        : `${environment.cores}-thread device`;

  const toggleFavourite = (id: ExperimentId) => {
    setFavourites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("mcwv-visual-lab-favourites-v1", JSON.stringify([...next]));
      } catch {
        // Keep the in-memory favourite if storage is unavailable.
      }
      return next;
    });
  };

  return (
    <main className={styles.lab} id="top">
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.hero}>
        <div className={styles.heroMark}>
          <Image src="/mcwv-logo.png" alt="MCWV" width={88} height={88} priority />
          <span>PRIVATE / OWNER</span>
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.overline}>MCWV R&amp;D // VISUAL SYSTEMS</p>
          <h1>Visual <em>Laboratory</em></h1>
          <p>Ten isolated technology trials. Launch them one at a time, stress them on your phone, and favourite only what deserves a production home.</p>
        </div>
        <div className={styles.demoNotice}>
          <strong>DEMONSTRATION DATA ONLY</strong>
          <span>No member, war, economy, or game records are read by these experiments.</span>
        </div>
      </header>

      <section className={styles.qualityPanel} aria-labelledby="quality-heading">
        <div>
          <p className={styles.panelLabel}>RENDER PROFILE</p>
          <h2 id="quality-heading">Choose how hard the lab runs</h2>
          <p>Auto currently selects <b>{quality}</b> from your {automaticReason}. Hidden tabs and offscreen cards pause independently.</p>
        </div>
        <div className={styles.modeSelector} role="group" aria-label="Visual quality">
          {(["auto", "battery", "balanced", "full"] as LabQualityMode[]).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setMode(item)}
              aria-pressed={mode === item}
              data-active={mode === item}
            >
              {item === "battery" ? "Battery Saver" : item === "full" ? "Full Effects" : item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <div className={styles.profileStats}>
          <span><i data-tone="purple" /> Effective: {quality}</span>
          <span><i data-tone="green" /> DPR capped</span>
          <span><i data-tone="blue" /> Offscreen pause</span>
          <span><i data-tone={environment.reducedMotion ? "amber" : "green"} /> Reduced motion {environment.reducedMotion ? "on" : "off"}</span>
        </div>
      </section>

      <div className={styles.indexBar}>
        <div><span>10</span><small>experiments</small></div>
        <div><span>{EXPERIMENTS.filter((item) => item.suitability === "Recommended").length}</span><small>recommended</small></div>
        <div><span>{favourites.size}</span><small>favourites here</small></div>
        <p>Favourites stay in this browser only.</p>
      </div>

      <section className={styles.experimentGrid} aria-label="Visual experiments">
        {EXPERIMENTS.map((experiment) => (
          <ExperimentCard
            key={experiment.id}
            experiment={experiment}
            quality={quality}
            reducedMotion={environment.reducedMotion}
            favourite={favourites.has(experiment.id)}
            onFavourite={() => toggleFavourite(experiment.id)}
          />
        ))}
      </section>

      <footer className={styles.footer}>
        <Image src="/mcwv-logo.png" alt="" width={36} height={36} />
        <div><strong>END OF PRIVATE LAB</strong><span>Nothing here is linked in desktop or mobile navigation.</span></div>
        <a href="#top" onClick={() => window.scrollTo({ top: 0, behavior: environment.reducedMotion ? "auto" : "smooth" })}>Return to top ↑</a>
      </footer>
    </main>
  );
}
