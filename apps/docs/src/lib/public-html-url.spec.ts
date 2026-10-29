import { describe, expect, it } from "vitest";
import {
  docsMarkdownApiPath,
  hasMarkdownPublicExtension,
  isIndexableSitemapUrl,
  isMachineReadableMarkdownPath,
  publicHtmlPathFromMarkdown,
  stripMarkdownPublicExtension,
} from "@/lib/public-html-url";

describe("public HTML URL hygiene", () => {
  it("detects public markdown extensions without treating source files as URLs", () => {
    expect(hasMarkdownPublicExtension("/docs/guide/product-tour.mdx")).toBe(
      true,
    );
    expect(hasMarkdownPublicExtension("/pricing.md")).toBe(true);
    expect(hasMarkdownPublicExtension("/docs/guide/product-tour")).toBe(false);
    expect(hasMarkdownPublicExtension("/pricing")).toBe(false);
  });

  it("keeps machine-readable pricing/tools markdown off indexable loc lists", () => {
    expect(isMachineReadableMarkdownPath("/pricing.md")).toBe(true);
    expect(isMachineReadableMarkdownPath("/tools.md")).toBe(true);
    expect(
      isIndexableSitemapUrl("https://www.trainingload.ai/pricing.md"),
    ).toBe(false);
    expect(isIndexableSitemapUrl("https://www.trainingload.ai/tools.md")).toBe(
      false,
    );
    expect(isIndexableSitemapUrl("https://www.trainingload.ai/pricing")).toBe(
      true,
    );
    expect(isIndexableSitemapUrl("https://www.trainingload.ai/tools")).toBe(
      true,
    );
  });

  it("maps accidental docs markdown URLs to the extensionless HTML route", () => {
    expect(
      publicHtmlPathFromMarkdown(
        "/es/docs/guide/effective-vo2max-for-endurance.mdx",
      ),
    ).toBe("/es/docs/guide/effective-vo2max-for-endurance");
    expect(
      publicHtmlPathFromMarkdown("/ko/docs/planning/manual-workout-editor.mdx"),
    ).toBe("/ko/docs/planning/manual-workout-editor");
    expect(publicHtmlPathFromMarkdown("/docs/guide/product-tour.mdx")).toBe(
      "/docs/guide/product-tour",
    );
    expect(publicHtmlPathFromMarkdown("/docs.mdx")).toBe("/docs");
    expect(publicHtmlPathFromMarkdown("/zh/docs.mdx")).toBe("/zh/docs");
    expect(stripMarkdownPublicExtension("/docs/guide/foo.md")).toBe(
      "/docs/guide/foo",
    );
  });

  it("does not invent HTML redirects for the unprefixed AI markdown endpoints", () => {
    expect(publicHtmlPathFromMarkdown("/pricing.md")).toBeNull();
    expect(publicHtmlPathFromMarkdown("/tools.md")).toBeNull();
    expect(publicHtmlPathFromMarkdown("/zh/pricing.md")).toBe("/zh/pricing");
  });

  it("points Copy Markdown / LLM actions at the noindex API, not a public .mdx URL", () => {
    expect(docsMarkdownApiPath("en", ["guide", "product-tour"])).toBe(
      "/api/docs-markdown/en/guide/product-tour",
    );
    expect(docsMarkdownApiPath("es", ["planning", "manual-workout-editor"])).toBe(
      "/api/docs-markdown/es/planning/manual-workout-editor",
    );
    expect(docsMarkdownApiPath("en")).toBe("/api/docs-markdown/en");
  });
});
