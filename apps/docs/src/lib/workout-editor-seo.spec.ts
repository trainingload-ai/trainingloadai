import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { llmFreeToolPages } from "@/lib/llms-catalog";

describe("workout editor SEO ownership", () => {
  it("registers the tool for indexed sitemap locales only", async () => {
    const source = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
    expect(source).toContain('"/workout-editor"');
    expect(source).toContain("for (const lang of SEO_INDEXED_LANGUAGES)");
    expect(SEO_INDEXED_LANGUAGES).toEqual(["en", "zh", "ja", "zh-hant"]);
  });

  it("lists the public builder in the LLM tools catalog", () => {
    expect(
      llmFreeToolPages.some((tool) => tool.path === "/workout-editor"),
    ).toBe(true);
  });

  it("moves generic workout editor queries off the docs page", async () => {
    const source = await readFile(
      new URL("../../../SEO_KEYWORD_MAP.md", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(
      /\| `\/workout-editor`\s+\|[^|]+\|\s+workout editor\s+\|/,
    );
    expect(source).toMatch(
      /\| `\/docs\/planning\/manual-workout-editor`\s+\|[^|]+\|\s+manual workout editor\s+\|/,
    );
    expect(source).toContain(
      "`/workout-editor` owns `workout editor`, `workout builder`, and `structured workout builder`",
    );
    expect(source).not.toMatch(
      /`\/docs\/planning\/manual-workout-editor` owns workout editor/,
    );
  });
});
