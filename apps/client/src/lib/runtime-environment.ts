export type DeploymentEdition = "cloud" | "self-host";
export type RuntimePlatform = "web" | "desktop";

export type DesktopNavigationState = {
  canGoBack: boolean;
  canGoForward: boolean;
  title: string;
  isFullScreen: boolean;
};

export type DesktopRuntimeBridge = {
  schemaVersion: 1;
  runtimePlatform: "desktop";
  platform: string;
  openExternalLink?: (url: string) => Promise<void>;
  windowChrome?: {
    getState: () => Promise<DesktopNavigationState>;
    navigate: (direction: "back" | "forward") => Promise<void>;
    zoom: () => Promise<void>;
    subscribe: (
      listener: (state: DesktopNavigationState) => void,
    ) => () => void;
  };
};

declare global {
  interface Window {
    trainingloadDesktop?: DesktopRuntimeBridge;
  }
}

export function getDesktopRuntime(): DesktopRuntimeBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.trainingloadDesktop;
  return bridge?.schemaVersion === 1 && bridge.runtimePlatform === "desktop"
    ? bridge
    : null;
}

export function getRuntimePlatform(): RuntimePlatform {
  return getDesktopRuntime() ? "desktop" : "web";
}

/** Presentation context only; feature access remains owned by the server. */
export function resolveRuntimeEnvironment(
  edition: DeploymentEdition,
  platform: RuntimePlatform,
) {
  return {
    edition,
    platform,
    isCloud: edition === "cloud",
    isSelfHost: edition === "self-host",
    isDesktopSelfHost: edition === "self-host" && platform === "desktop",
  } as const;
}
