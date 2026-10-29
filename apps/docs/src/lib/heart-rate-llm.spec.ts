import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../packages/messages/docs/en.json";
import {
  getHeartRateZonesLlmText,
  getMaxHeartRateLlmText,
  getZone2HeartRateLlmText,
} from "./heart-rate-llm";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    createTranslator({
      locale: "en",
      messages: JSON.parse(JSON.stringify(en)),
      namespace,
    }),
}));

describe("heart-rate calculator LLM context", () => {
  it("includes the max heart rate definition, formulas, limits, and FAQ", async () => {
    const text = await getMaxHeartRateLlmText();
    expect(text).toContain(en.maxHeartRateCalculator.page.quickAnswer.title);
    expect(text).toContain(
      `| ${en.maxHeartRateCalculator.page.formulas.hunt.name} |`,
    );
    expect(text).toContain(en.maxHeartRateCalculator.page.limitations.body);
    expect(text).toContain(en.maxHeartRateCalculator.page.measure.safety);
    expect(text).toContain("| 40 | 180 | 180 | 171 |");
    for (const faq of en.maxHeartRateCalculator.page.faq) {
      expect(text).toContain(faq.question);
      expect(text).toContain(faq.answer);
    }
  });

  it("keeps the Zone 2 methods, age table, handoff, and FAQ aligned", async () => {
    const text = await getZone2HeartRateLlmText();
    expect(text).toContain(
      en.zone2HeartRateCalculator.page.education.definition.answer,
    );
    expect(text).toContain("| Karvonen (HRR) | 60–70% HRR |");
    expect(text).toContain("| 40 | 180 bpm | 108–125 bpm |");
    expect(text).toContain("/heart-rate-zones-calculator");
    for (const faq of en.zone2HeartRateCalculator.page.faq) {
      expect(text).toContain(faq.question);
      expect(text).toContain(faq.answer);
    }
  });

  it("describes complete 5- and 7-zone output separately", async () => {
    const text = await getHeartRateZonesLlmText();
    expect(text).toContain("Karvonen / HRR · 5 zones");
    expect(text).toContain("Friel / LTHR · 7 zones");
    expect(text).toContain("/zone-2-heart-rate-calculator");
    expect(text).toContain(
      en.heartRateZonesCalculator.page.sections.answer.body,
    );
  });
});
