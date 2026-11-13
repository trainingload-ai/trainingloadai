import { contextBridge, ipcRenderer } from "electron";

// The local port changes between launches. Seed a new origin before the Core
// theme script runs so a saved dark preference does not briefly render light.
if (location.protocol === "http:" && location.hostname === "localhost") {
  const initialTheme = process.argv
    .find((value) => value.startsWith("--trainingload-theme="))
    ?.split("=")[1];
  if (initialTheme && ["light", "dark", "system"].includes(initialTheme)) {
    try {
      if (localStorage.getItem("theme") === null)
        localStorage.setItem("theme", initialTheme);
    } catch {
      /* A blocked preference store must not prevent startup. */
    }
  }
}

const desktopApi = Object.freeze({
  schemaVersion: 1,
  runtimePlatform: "desktop",
  platform: process.platform,
  openExternalLink: (url: string): Promise<void> =>
    ipcRenderer.invoke("desktop:external-link:open", url),
  windowChrome:
    process.platform === "darwin"
      ? Object.freeze({
          getState: () => ipcRenderer.invoke("desktop:window:state"),
          navigate: (direction: "back" | "forward") =>
            ipcRenderer.invoke("desktop:window:navigate", direction),
          zoom: () => ipcRenderer.invoke("desktop:window:zoom"),
          subscribe: (
            listener: (state: {
              canGoBack: boolean;
              canGoForward: boolean;
              title: string;
              isFullScreen: boolean;
            }) => void,
          ) => {
            const handler = (
              _event: Electron.IpcRendererEvent,
              state: Parameters<typeof listener>[0],
            ) => listener(state);
            ipcRenderer.on("desktop:window:changed", handler);
            return () =>
              ipcRenderer.removeListener("desktop:window:changed", handler);
          },
        })
      : undefined,
  configuration: () => ipcRenderer.invoke("desktop:configuration:get"),
  chooseDataRoot: () => ipcRenderer.invoke("desktop:data-root:choose"),
  backupData: () => ipcRenderer.invoke("desktop:backup:create"),
  restoreData: () => ipcRenderer.invoke("desktop:backup:restore"),
});

contextBridge.exposeInMainWorld("trainingloadDesktop", desktopApi);

// Cache the existing next-themes preference for the pre-server window. This is
// internal to preload; it does not add another theme setting or public bridge.
function syncAppearance() {
  if (location.protocol !== "http:" || location.hostname !== "localhost")
    return;
  const root = document.documentElement;
  if (!root.classList.contains("dark") && !root.classList.contains("light"))
    return;
  let theme: string;
  try {
    theme = localStorage.getItem("theme") ?? "system";
  } catch {
    return;
  }
  if (!["light", "dark", "system"].includes(theme)) return;
  void ipcRenderer.invoke("desktop:appearance:sync", theme).catch(() => {});
}
window.addEventListener("DOMContentLoaded", () => {
  syncAppearance();
  new MutationObserver(syncAppearance).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});
ipcRenderer.on("desktop:appearance:request", syncAppearance);
