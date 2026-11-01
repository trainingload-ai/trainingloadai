import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { llmFreeToolPages } from "@/lib/llms-catalog";
import messages from "../../../../packages/messages/docs/en.json";

describe("workout editor SEO ownership", () => {
  it("registers the tool for indexed sitemap locales only", async () => {
    const source = await readFile(
      new URL("../app/sitemap.ts", import.meta.url),
      "utf8",
    );
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
      new URL(
        "../../content/docs/en/planning/manual-workout-editor.mdx",
        import.meta.url,
      ),
      "utf8",
    );
    const metadata = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    expect(messages.workoutEditor.metadata.keywords).toEqual(
      expect.arrayContaining([
        "workout editor",
        "workout builder",
        "structured workout builder",
      ]),
    );
    expect(metadata).toContain('"manual workout editor"');
    expect(metadata).not.toMatch(/^\s*"workout (?:editor|builder)"\s*,?\s*$/m);
    expect(source).toContain("[Workout Editor & Builder](/workout-editor)");
  });
});
