"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type OnboardingApiResponse = {
  success?: boolean;
  user?: {
    id: number;
    username: string;
    role: string;
    isOfficer: boolean;
  };
  onboarding?: {
    completed: boolean;
    skipped: boolean;
    shouldStart: boolean;
    step: string;
    completedAt: string | null;
  };
  error?: string;
};

type TourStep = {
  id: string;
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  officerOnly?: boolean;
  finalProfileStep?: boolean;
};

const MEMBER_STEPS: TourStep[] = [
  {
    id: "welcome",
    href: "/",
    eyebrow: "Quick tour",
    title: "Welcome to MCWV Hub",
    body: "I’ll show you the main places you’ll use. It only takes a minute, and you can skip it whenever you want.",
  },
  {
    id: "leaderboard",
    href: "/leaderboard",
    eyebrow: "Leaderboard",
    title: "See who’s putting in work",
    body: "This is where you can check war points, ranks, live updates, and player profile cards.",
  },
  {
    id: "war-info",
    href: "/war-info",
    eyebrow: "War info",
    title: "Keep the war details simple",
    body: "Use this page when you just want the current war status, timing, progress, and MCWV’s total points.",
  },
  {
    id: "contributions",
    href: "/contributions",
    eyebrow: "Contributions",
    title: "Check performance properly",
    body: "This page helps you look deeper at contribution stats and see how members are performing over time.",
  },
  {
    id: "settings",
    href: "/settings",
    eyebrow: "Settings",
    title: "Your account lives here",
    body: "This is where you can manage your account, theme, and linked details when you need to change something.",
  },
  {
    id: "customise-profile",
    href: "/leaderboard?customise=1",
    eyebrow: "Final step",
    title: "Make your profile card yours",
    body: "Before you go, you can customise your leaderboard card with a background, frame, colours, font, and more. You can also finish without doing it right now.",
    finalProfileStep: true,
  },
];

const OFFICER_STEPS: TourStep[] = [
  {
    id: "admin-overview",
    href: "/admin",
    eyebrow: "Officer tools",
    title: "This is your control room",
    body: "The admin area is where officers can check bot status, manage tools, and handle the parts members do not need to touch.",
    officerOnly: true,
  },
  {
    id: "admin-players",
    href: "/admin",
    eyebrow: "Players and links",
    title: "Keep member records tidy",
    body: "Use the Players and Roblox Links sections to manage linked accounts, alts, and member records carefully.",
    officerOnly: true,
  },
  {
    id: "admin-broadcast",
    href: "/admin",
    eyebrow: "Broadcast",
    title: "Message the right people",
    body: "Broadcast lets you send targeted messages to members by DM or ticket, without bothering everyone unnecessarily.",
    officerOnly: true,
  },
  {
    id: "admin-logs",
    href: "/admin",
    eyebrow: "Logs",
    title: "Check what changed",
    body: "Logs help you see important admin actions and changes, which is useful when multiple officers are helping out.",
    officerOnly: true,
  },
];

function buildSteps(isOfficer: boolean) {
  if (!isOfficer) return MEMBER_STEPS;

  const profileStep = MEMBER_STEPS[MEMBER_STEPS.length - 1];
  return [...MEMBER_STEPS.slice(0, -1), ...OFFICER_STEPS, profileStep];
}

async function updateOnboarding(action: "complete" | "skip" | "reset" | "step", step?: string) {
  await fetch("/api/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, step }),
  }).catch(() => null);
}

export default function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<OnboardingApiResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [stepId, setStepId] = useState("welcome");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadStatus() {
      const res = await fetch("/api/onboarding", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;

      const json: OnboardingApiResponse = await res.json().catch(() => ({}));
      if (!alive) return;

      setStatus(json);
      if (json.onboarding?.shouldStart) {
        setStepId(json.onboarding.step || "welcome");
        setOpen(true);
      }
    }

    void loadStatus();

    return () => {
      alive = false;
    };
  }, []);

  const steps = useMemo(
    () => buildSteps(Boolean(status?.user?.isOfficer)),
    [status?.user?.isOfficer]
  );

  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === stepId));
  const currentStep = steps[currentIndex] ?? steps[0];
  const nextStep = steps[currentIndex + 1] ?? null;
  const previousStep = steps[currentIndex - 1] ?? null;
  const isOnStepPage = pathname === currentStep.href.split("?")[0];

  if (!open || !currentStep) return null;

  async function goToStep(step: TourStep) {
    setBusy(true);
    setStepId(step.id);
    await updateOnboarding("step", step.id);
    router.push(step.href);
    setBusy(false);
  }

  async function skipTour() {
    setBusy(true);
    await updateOnboarding("skip");
    setOpen(false);
    setBusy(false);
  }

  async function finishTour() {
    setBusy(true);
    await updateOnboarding("complete");
    setOpen(false);
    setBusy(false);
  }

  async function customiseAndFinish() {
    setBusy(true);
    await updateOnboarding("complete");
    setOpen(false);
    router.push(currentStep.href);
    setBusy(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] p-4 sm:bottom-5 sm:right-5 sm:left-auto sm:w-[420px]">
      <div
        className="overflow-hidden rounded-3xl border shadow-2xl shadow-black/40 backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--card) 94%, black)",
          borderColor: "var(--border)",
        }}
      >
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">
                {currentStep.eyebrow}
              </div>
              <h2 className="mt-1 text-lg font-bold text-white">{currentStep.title}</h2>
            </div>
            <button
              type="button"
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300 transition hover:bg-white/10"
              onClick={() => void skipTour()}
              disabled={busy}
            >
              Skip
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm leading-6 text-zinc-300">{currentStep.body}</p>

          {!isOnStepPage && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
              I’ll take you to the right page for this step.
            </div>
          )}

          <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
            <span>
              Step {currentIndex + 1} of {steps.length}
            </span>
            <span>{status?.user?.isOfficer ? "Officer tour" : "Member tour"}</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {previousStep && (
              <button
                type="button"
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                onClick={() => void goToStep(previousStep)}
                disabled={busy}
              >
                Back
              </button>
            )}

            {currentStep.finalProfileStep ? (
              <>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                  onClick={() => void finishTour()}
                  disabled={busy}
                >
                  Finish tour
                </button>
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:opacity-50"
                  style={{ background: "var(--primary)" }}
                  onClick={() => void customiseAndFinish()}
                  disabled={busy}
                >
                  Customise my card
                </button>
              </>
            ) : nextStep ? (
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:opacity-50"
                style={{ background: "var(--primary)" }}
                onClick={() => void goToStep(nextStep)}
                disabled={busy}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:opacity-50"
                style={{ background: "var(--primary)" }}
                onClick={() => void finishTour()}
                disabled={busy}
              >
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
