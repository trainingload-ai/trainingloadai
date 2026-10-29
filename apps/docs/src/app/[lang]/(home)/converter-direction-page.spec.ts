import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Converter direction page", () => {
  const source = readFileSync(new URL("./converter-direction-page.tsx", import.meta.url), "utf8");
  const client = readFileSync(
    new URL("../../../components/ConverterDirectionClient.tsx", import.meta.url),
    "utf8",
  );

  it("keeps HowTo and FAQ JSON-LD in sync with direction copy", () => {
    expect(source).toContain("howToSchema");
    expect(source).toContain("faqPageSchema");
    expect(source).toContain("webApplicationSchema");
    expect(source).toContain("breadcrumbSchema");
    expect(source).toContain("direction.ui.howToTitle");
    expect(source).toContain("direction.howTo");
    expect(source).toContain("direction.faq");
  });

  it("renders P0 and P1 content modules on the direction client", () => {
    expect(client).toContain('id="preserved-data"');
    expect(client).toContain('id="use-cases"');
    expect(client).toContain('id="format-compare"');
    expect(client).toContain('id="other-tools"');
    expect(client).toContain("relatedSameFromTitle");
    expect(client).toContain("relatedSameToTitle");
    expect(client).toContain("relatedHubTitle");
    expect(client).toContain('"/converter"');
    expect(client).toContain('"/fit-course-converter"');
    expect(client).not.toContain("ToolRelatedLinks");
  });
});
