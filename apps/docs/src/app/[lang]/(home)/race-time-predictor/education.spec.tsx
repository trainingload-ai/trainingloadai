import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../../../../../packages/messages/docs/en.json";
import { getRaceTimeLlmText } from "@/lib/race-time-llm";
import { RaceEducation, RaceSources } from "./education";

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

describe("Race prediction education", () => {
  it.each(["en", "zh", "zh-hant", "ja"])(
    "renders all educational content without translation errors in %s",
    async (lang) => {
      const html = renderToStaticMarkup(await RaceEducation({ lang }));
      expect(html).toContain('id="marathon-time-predictor"');
      expect(html).toContain("3:49:37");
      expect(html).not.toContain("{source}");
      expect(html).not.toContain("{marathon}");
      const sources = renderToStaticMarkup(await RaceSources({ lang }));
      expect(sources).toContain('id="race-source-research"');
    },
  );
  it("server-renders nine examples with source times preserved and known VDOT equivalents", async () => {
    const html = renderToStaticMarkup(await RaceEducation({ lang: "en" }));
    expect(html).toContain("What is a race time predictor?");
    expect(html).toContain(
      "Marathon time predictor: from 5K, 10K or half marathon",
    );
    expect(html).toContain(
      "10K · 50:00</th><td>24:06</td><td>50:00</td><td>1:50:54</td><td>3:49:37</td>",
    );
    expect(html).toContain(
      "5K · 25:00</th><td>25:00</td><td>51:54</td><td>1:55:05</td><td>3:57:58</td>",
    );
    const exampleTable = html
      .split('id="prediction-examples"')[1]
      .split("</table>")[0];
    expect(exampleTable.match(/scope="row"/g)).toHaveLength(9);
    expect(html).toContain(en.raceTimePredictor.page.education.examples.note);
    expect(html).toContain(en.raceTimePredictor.page.education.input.privacy);
    expect(html).toContain('href="/marathon-training-plan"');
  });

  it("publishes the same explanations and example values in full LLM context", async () => {
    const text = await getRaceTimeLlmText();
    expect(text).toContain(en.raceTimePredictor.page.education.definition.body);
    expect(text).toContain(
      en.raceTimePredictor.page.education.accuracy.research,
    );
    expect(text).toContain("| 10K 50:00 | 24:06 | 50:00 | 1:50:54 | 3:49:37 |");
    expect(text).toContain(en.raceTimePredictor.page.sections.answer.formula);
    for (const faq of en.raceTimePredictor.page.faq) {
      expect(text).toContain(faq.question);
      expect(text).toContain(faq.answer);
    }
    const sources = renderToStaticMarkup(await RaceSources({ lang: "en" }));
    for (const id of ["vdot", "research", "garmin"]) {
      expect(sources).toContain(`id="race-source-${id}"`);
    }
    expect(text).toContain(
      "https://link.springer.com/article/10.1186/s13102-016-0052-y",
    );
  });
});
