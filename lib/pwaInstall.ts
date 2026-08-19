export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __mcwvDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __mcwvInstallCaptureReady?: boolean;
    __mcwvAppInstalled?: boolean;
  }
}

export const INSTALL_READY_EVENT = "mcwv-install-ready";
export const APP_INSTALLED_EVENT = "mcwv-app-installed";

export function getDeferredInstallPrompt() {
  return window.__mcwvDeferredInstallPrompt ?? null;
}

export function clearDeferredInstallPrompt(prompt?: BeforeInstallPromptEvent | null) {
  if (!prompt || window.__mcwvDeferredInstallPrompt === prompt) {
    window.__mcwvDeferredInstallPrompt = null;
  }
}
