import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chrome = readFileSync(
  new URL("../components/ProductBrowserChrome.tsx", import.meta.url),
  "utf8",
);

const surfaces = [
  "../app/[lang]/(home)/_components/HomeHeroDemoPreview.tsx",
  "../app/[lang]/(home)/_components/HomeProductShowcase.tsx",
  "../app/[lang]/(home)/_components/McpTerminalDemo.tsx",
  "../app/[lang]/(home)/_components/PmcProductPreview.tsx",
  "../app/[lang]/(home)/features/page.tsx",
  "../app/[lang]/(home)/5k-training-plan/_components/FiveKProductPreview.tsx",
  "../components/DocsScreenshot.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

const docsScreenshot = readFileSync(
  new URL("../components/DocsScreenshot.tsx", import.meta.url),
  "utf8",
);

describe("shared product browser chrome", () => {
  it("keeps one accessible, theme-aware window treatment", () => {
    expect(chrome).toContain("grid-cols-[1fr_auto_1fr]");
    expect(chrome).toContain("title={address}");
    expect(chrome).toContain("href={addressHref}");
    expect(chrome).toContain("noopener noreferrer");
    expect(chrome).toContain('variant?: "adaptive" | "dark"');
    expect(chrome).toContain("group-hover/lights:opacity-100");
  });

  it("is reused by product visuals instead of being copied per page", () => {
    for (const surface of surfaces) {
      expect(surface).toMatch(/ProductBrowser(?:Chrome|Window)/);
    }
  });

  it("uses real manifest assets and honest Demo links for pending captures", () => {
    expect(docsScreenshot).toContain("screenshotManifest.captures");
    expect(docsScreenshot).toContain('capture?.status === "ready"');
    expect(docsScreenshot).toContain('useTranslations("docsScreenshot")');
    expect(docsScreenshot).toContain("stableCaptureRoute(capture?.route)");
    expect(docsScreenshot).toContain("href={destination.href}");
  });
});
