import { describe, expect, it } from "vitest";
import { resolveDocsScreenshot } from "./docs-screenshot";

describe("documentation screenshot media", () => {
  it("resolves both real platforms and themes in the article locale", () => {
    const media = resolveDocsScreenshot({
      id: "integrations-connections",
      locale: "zh",
    });
    expect(media.images.map((image) => image.platform)).toEqual([
      "web",
      "mobile",
    ]);
    expect(media.desktop?.imageSrc).toBe(
      "/docs/captures/zh/integrations-connections.webp",
    );
    expect(media.desktop?.darkImageSrc).toBe(
      "/docs/captures/zh/integrations-connections-dark.webp",
    );
    expect(media.mobile?.imageSrc).toBe(
      "/docs/mobile/zh/mobile-permission-sources.webp",
    );
    expect(media.mobile?.darkImageSrc).toBe(
      "/docs/mobile/zh/mobile-permission-sources-dark.webp",
    );
    expect(media.destination.href).toBe(
      "https://demo.trainingload.ai/zh/account",
    );
  });

  it("keeps PC as the main view when the article references the mobile capture", () => {
    const media = resolveDocsScreenshot({
      id: "mobile-permission-sources",
      locale: "en",
    });
    expect(media.images.map((image) => image.platform)).toEqual([
      "web",
      "mobile",
    ]);
    expect(media.desktop?.captureId).toBe("integrations-connections");
    expect(media.mobile?.captureId).toBe("mobile-permission-sources");
  });

  it("keeps exclusive features single-platform and preserves their destination", () => {
    const timeline = resolveDocsScreenshot({
      id: "activity-timeline-selection",
      locale: "en",
    });
    expect(timeline.images).toHaveLength(1);
    expect(timeline.mobile).toBeUndefined();
    const recording = resolveDocsScreenshot({
      id: "mobile-recording-ready",
      locale: "zh",
    });
    expect(recording.desktop).toBeUndefined();
    expect(recording.images).toHaveLength(1);
  });

  it("falls back consistently to English media in both themes", () => {
    const media = resolveDocsScreenshot({
      id: "integrations-connections",
      locale: "fr",
    });
    expect(media.desktop?.imageSrc).toContain("/en/");
    expect(media.desktop?.darkImageSrc).toContain("/en/");
    expect(media.mobile?.imageSrc).toContain("/en/");
    expect(media.mobile?.darkImageSrc).toContain("/en/");
  });

  it("keeps legacy explicit images and Demo overrides usable", () => {
    const media = resolveDocsScreenshot({
      id: "custom",
      locale: "zh",
      imageSrc: "/custom.webp",
      appPath: "/calendar",
    });
    expect(media.imageSrc).toBe("/custom.webp");
    expect(media.images).toHaveLength(1);
    expect(media.destination.href).toBe(
      "https://demo.trainingload.ai/zh/calendar",
    );
  });
});
