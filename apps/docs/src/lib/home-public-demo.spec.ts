import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../app/[lang]/(home)/page.tsx", import.meta.url),
  "utf8",
);
const preview = readFileSync(
  new URL(
    "../app/[lang]/(home)/_components/HomeHeroDemoPreview.tsx",
    import.meta.url,
  ),
  "utf8",
);
const provider = readFileSync(
  new URL(
    "../../../client/src/public-demo/public-demo-provider.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("homepage public Demo handoff", () => {
  it("makes the real Demo the first product proof in the hero", () => {
    expect(page).toContain("<HomeHeroDemoPreview");
    expect(page).not.toContain("<HomeHeroProductPreview");
    expect(preview).toContain('eventName="home_public_demo_click"');
    expect(page.indexOf("<HomeHeroDemoPreview")).toBeLessThan(
      page.indexOf("<HomeTrainingPlanSpotlight"),
    );
  });

  it("keeps an accessible responsive fallback until the Demo is ready", () => {
    expect(preview).toContain("<iframe");
    expect(page).toContain("key={demoUrl}");
    expect(preview).toContain("title={copy.title}");
    expect(preview).toContain("mobile-home-v2-${previewLocale}.png");
    expect(preview).toContain("READY_TIMEOUT_MS");
    expect(preview).toContain("PUBLIC_DEMO_FRAME_READY_MESSAGE");
    expect(preview).toContain("PUBLIC_DEMO_EMBED_CONTEXT_MESSAGE");
    expect(preview).toContain("event.origin !== demoOrigin");
    expect(preview).toContain(
      "event.source !== iframeRef.current?.contentWindow",
    );
    expect(preview).toContain("theme: resolvedTheme");
    expect(preview).toContain("locale: lang");
    expect(preview).toContain("inert={ready}");
    expect(preview).toContain("tabIndex={ready ? 0 : -1}");
    expect(preview).not.toContain("{copy.label}");
    expect(preview).not.toContain("{copy.description}");
  });

  it("sandboxes the embedded app and waits for its authenticated ready signal", () => {
    expect(preview).toContain(
      'sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"',
    );
    expect(provider).toContain("window.parent === window");
    expect(provider).toContain("window.parent.postMessage");
    expect(provider).toContain("PUBLIC_DEMO_FRAME_READY_MESSAGE");
    expect(provider).toContain("isPublicDemoEmbedContextMessage");
    expect(provider).toContain("event.source !== window.parent");
    expect(provider).toContain("setTheme(event.data.theme)");
    expect(provider).toContain("locale: event.data.locale");
  });
});
