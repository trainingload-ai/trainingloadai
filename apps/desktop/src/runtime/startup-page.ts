import { readFileSync } from "node:fs";

const assets = JSON.parse(
  readFileSync(new URL("../assets/startup.json", import.meta.url), "utf8"),
) as {
  light: Record<string, string>;
  dark: Record<string, string>;
  spinner: string;
};
export type Appearance = "light" | "dark" | "system";
export const APPEARANCE_COOKIE = "trainingload-desktop-theme";

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );

export function startupBackground(dark: boolean): string {
  return assets[dark ? "dark" : "light"]["desktop-chrome"];
}

export function renderStartupPage(options: {
  dark: boolean;
  locale: string;
  macOS: boolean;
  title: string;
  detail: string;
  appName: string;
  navigation: string;
  back: string;
  forward: string;
}): string {
  const tokens = Object.entries(assets[options.dark ? "dark" : "light"])
    .map(([key, value]) => `--${key}:${value}`)
    .join(";");
  const arrow = (path: string) =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  const header = options.macOS
    ? `<header class="titlebar" aria-label="${escapeHtml(options.navigation)}"><nav aria-label="${escapeHtml(options.navigation)}"><button disabled aria-label="${escapeHtml(options.back)}">${arrow("m12 19-7-7 7-7M5 12h14")}</button><button disabled aria-label="${escapeHtml(options.forward)}">${arrow("m12 5 7 7-7 7M5 12h14")}</button></nav><span>${escapeHtml(options.appName)}</span></header>`
    : "";
  return `<!doctype html>
<html lang="${escapeHtml(options.locale)}" style="${escapeHtml(tokens)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="${options.dark ? "dark" : "light"}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Trainingload.ai</title>
<style>
*{box-sizing:border-box}body{margin:0;background:var(--desktop-chrome);color:var(--foreground);font:14px/1.5 var(--tl-font-ui);-webkit-font-smoothing:antialiased}
.window{height:100dvh;display:flex;flex-direction:column}.titlebar{height:40px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:0 16px 0 88px;-webkit-app-region:drag;user-select:none}.titlebar nav{display:flex;gap:4px;-webkit-app-region:no-drag}.titlebar button{width:28px;height:28px;border:0;padding:0;display:grid;place-items:center;background:transparent;color:var(--muted-foreground);opacity:.5}.titlebar span{min-width:0;border-left:1px solid var(--border);padding-left:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
main{flex:1;min-height:0;display:grid;place-items:center;background:var(--background)}.mac main{margin-left:52px;border-top:1px solid var(--border);border-left:1px solid var(--border);border-top-left-radius:var(--desktop-workspace-radius)}
.status{width:min(100%,420px);padding:32px;text-align:center}.spinner{display:block;width:24px;height:24px;margin:0 auto 20px;animation:spin 1s linear infinite}h1{margin:0;font-size:14px;line-height:20px;font-weight:500;text-wrap:balance}p{margin:8px 0 0;font-size:13px;line-height:20px;color:var(--muted-foreground);text-wrap:pretty}
@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}@media(max-width:600px){.mac main{margin-left:0;border-left:0;border-radius:0}.status{padding:24px}}
</style></head><body><div class="window${options.macOS ? " mac" : ""}">${header}<main><section class="status" role="status" aria-live="polite" aria-busy="true"><svg class="spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${escapeHtml(assets.spinner)}"/></svg><h1>${escapeHtml(options.title)}</h1><p>${escapeHtml(options.detail)}</p></section></main></div></body></html>`;
}
