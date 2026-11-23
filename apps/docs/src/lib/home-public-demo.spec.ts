import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isPublicDemoEmbedContextMessage,
  PUBLIC_DEMO_EMBED_CONTEXT_MESSAGE,
} from "@shared/public-demo-policy";

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
    expect(preview).toContain("mobileLight=");
    expect(preview).toContain("mobileDark=");
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
    // The hosted Demo provider is Managed code. Public docs own the sender
    // and shared protocol, so exercise that contract without reading a
    // private source file that is absent from a clean Public checkout.
    const message = {
      type: PUBLIC_DEMO_EMBED_CONTEXT_MESSAGE,
      version: 1,
      locale: "zh",
      theme: "dark",
    };
    expect(isPublicDemoEmbedContextMessage(message)).toBe(true);
    expect(isPublicDemoEmbedContextMessage({ ...message, version: 2 })).toBe(
      false,
    );
    expect(
      isPublicDemoEmbedContextMessage({ ...message, theme: "unknown" }),
    ).toBe(false);
  });
});
