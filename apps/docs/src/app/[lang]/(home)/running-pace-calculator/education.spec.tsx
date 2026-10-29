import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../../../../../packages/messages/docs/en.json";
import { getRacePaceGoals } from "@/lib/running-pace-education";
import { getRunningPaceLlmText } from "@/lib/running-pace-llm";
import { solveTimeSec, RACE_DISTANCES_KM } from "@/lib/running-pace";
import { PaceEducation } from "./education";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: string;
  }) =>
    createTranslator({
      locale,
      messages: JSON.parse(
        readFileSync(
          new URL(
            `../../../../../../../packages/messages/docs/${locale}.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
      namespace,
      onError: (error) => {
        throw error;
      },
    }),
}));

describe("Running pace education", () => {
  it.each(["en", "zh", "zh-hant", "ja"])(
    "server-renders complete localized tables and examples in %s",
    async (lang) => {
      const html = renderToStaticMarkup(await PaceEducation({ lang }));
      expect(html.match(/scope="row"/g)).toHaveLength(25);
      expect(html).toContain("5:24/km");
      expect(html).toContain("55:00");
      expect(html).not.toMatch(/\{(result|race|weightedPace)\}/);
      expect(html).toContain(
        `href="${lang === "en" ? "" : `/${lang}`}/race-time-predictor"`,
      );
      expect(html).toContain("1.609344");
    },
  );

  it("retains exact goal pace for calculation while rounding only the displayed value", () => {
    const goal = getRacePaceGoals("marathon").find(
      (row) => row.time === "3:00:00",
    )!;
    expect(goal.perKm).toBe("4:16");
    expect(goal.perMile).toBe("6:52");
    expect(solveTimeSec(RACE_DISTANCES_KM.marathon, goal.secPerKm)).toBeCloseTo(
      10800,
      8,
    );
    expect(solveTimeSec(RACE_DISTANCES_KM.marathon, 256)).toBeGreaterThan(
      10800,
    );
    expect(
      getRacePaceGoals("marathon").find((row) => row.time === "4:00:00"),
    ).toMatchObject({ perKm: "5:41", perMile: "9:09" });
  });

  it("keeps the full LLM context aligned with visible copy, examples, tables and FAQ", async () => {
    const text = await getRunningPaceLlmText();
    expect(text).toContain(
      en.runningPaceCalculator.page.education.definition.answer,
    );
    expect(text).toContain(en.runningPaceCalculator.page.education.goals.note);
    expect(text).toContain("| 5:00 | 8:03 | 12.00 | 7.46 |");
    expect(text).toContain("| 4:00:00 | 5:41 | 9:09 |");
    expect(text).toContain("5:24/km");
    for (const faq of en.runningPaceCalculator.page.faq) {
      expect(text).toContain(faq.question);
      expect(text).toContain(faq.answer);
    }
  });
});
