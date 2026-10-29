import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("docs page heading hierarchy", () => {
  it("keeps DocsTitle as the only rendered h1", async () => {
    const source = await readFile(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("<DocsTitle className=");
    expect(source).toContain("{page.data.title}");
    expect(source).toContain("h1: OmitDuplicateDocsTitle");
  });

  it("uses the noindex markdown API instead of a public .mdx URL", async () => {
    const source = await readFile(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("docsMarkdownApiPath(lang, slug)");
    expect(source).not.toContain("${docsPath}.mdx");
  });
});
