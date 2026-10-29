import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../packages/messages/docs/en.json";
import { getPowerZonesLlmText } from "./power-zones-llm";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    createTranslator({
      locale: "en",
      messages: JSON.parse(JSON.stringify(en)),
      namespace,
    }),
}));

describe("power zones calculator LLM context", () => {
  it("includes the definition, continuous Coggan table, targets, and FAQ", async () => {
    const text = await getPowerZonesLlmText();
    expect(text).toContain(en.powerZonesCalculator.page.sections.definition.answer);
    expect(text).toContain("| Z2 | Endurance | 56–75% | 138–188 W |");
    expect(text).toContain("| Z3 | Tempo | 76–90% | 189–225 W |");
    expect(text).toContain(en.powerZonesCalculator.page.sections.targets.note);
    expect(text).toContain(en.powerZonesCalculator.page.sections.limits.description);
    expect(text).not.toContain("Z3 starts at 190 W");
    for (const faq of en.powerZonesCalculator.page.faq) {
      expect(text).toContain(faq.question);
      expect(text).toContain(faq.answer);
    }
  });
});
