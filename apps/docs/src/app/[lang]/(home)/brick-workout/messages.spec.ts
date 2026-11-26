import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import en from "@trainingloadai/messages/docs/en.json";
import ja from "@trainingloadai/messages/docs/ja.json";
import zhHant from "@trainingloadai/messages/docs/zh-hant.json";
import zh from "@trainingloadai/messages/docs/zh.json";
import de from "@trainingloadai/messages/docs/de.json";
import es from "@trainingloadai/messages/docs/es.json";
import fr from "@trainingloadai/messages/docs/fr.json";
import itMsg from "@trainingloadai/messages/docs/it.json";
import ko from "@trainingloadai/messages/docs/ko.json";
import ptBR from "@trainingloadai/messages/docs/pt-BR.json";

const messages = {
  en,
  de,
  fr,
  es,
  "pt-BR": ptBR,
  it: itMsg,
  ko,
  ja,
  zh,
  "zh-hant": zhHant,
} as const;

describe("brick workout messages", () => {
  it("covers brick workout / brick training in every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].brickWorkout;
      expect(copy.metadata.title.length).toBeGreaterThan(10);
      expect(copy.metadata.description.length).toBeGreaterThan(40);
      expect(copy.page.faq.length).toBeGreaterThanOrEqual(5);
      expect(copy.page.sections.formats.cards.length).toBeGreaterThanOrEqual(3);
      expect(
        messages[lang].commonLinks.brickWorkoutAction.length,
      ).toBeGreaterThan(2);
    }
  });

  it("locks English brick workout and brick training terms", () => {
    expect(en.brickWorkout.metadata.title.toLowerCase()).toContain(
      "brick workout",
    );
    expect(en.brickWorkout.metadata.keywords).toEqual(
      expect.arrayContaining(["brick workout", "brick training"]),
    );
    expect(JSON.stringify(en.brickWorkout).toLowerCase()).toContain(
      "bike-to-run",
    );
  });

  it("locks locale brick terms", () => {
    expect(zh.brickWorkout.metadata.title).toContain("砖块训练");
    expect(ja.brickWorkout.metadata.title).toContain("ブリック");
    expect(zhHant.brickWorkout.metadata.title).toContain("磚塊訓練");
  });
});
