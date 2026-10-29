import { getTranslations } from "next-intl/server";
import {
  getPaceCalculationExamples,
  getPaceConversions,
  getRacePaceGoals,
  PACE_RACE_KEYS,
  PACE_SOURCES,
} from "./running-pace-education";

/** Publish the visible explanations and generated tables without a second copy. */
export async function getRunningPaceLlmText() {
  const t = await getTranslations({
    locale: "en",
    namespace: "runningPaceCalculator.page",
  });
  const examples = getPaceCalculationExamples();
  const readings = t.raw("education.reading.items") as Array<{
    title: string;
    body: string;
  }>;
  const faq = t.raw("faq") as Array<{ question: string; answer: string }>;
  return [
    `#### ${t("education.definition.title")}`,
    t("education.definition.answer"),
    t("education.definition.detail"),
    `#### ${t("education.formulas.title")}`,
    t("education.formulas.intro"),
    ...(["pace", "time", "distance"] as const).map(
      (key) =>
        `${t(`education.formulas.rows.${key}.formula`)}\n\n${t(`education.formulas.rows.${key}.example`, { result: examples[key] })}`,
    ),
    t("education.formulas.clockNote"),
    `#### ${t("education.conversion.title")}`,
    t("education.conversion.body"),
    [
      "| min/km | min/mile | km/h | mph |",
      "| --- | --- | --- | --- |",
      ...getPaceConversions().map(
        (row) =>
          `| ${row.perKm} | ${row.perMile} | ${row.kmh.toFixed(2)} | ${row.mph.toFixed(2)} |`,
      ),
    ].join("\n"),
    t("education.conversion.formula"),
    t("education.conversion.note"),
    `[${t("education.sources.units")}](${PACE_SOURCES.units})`,
    `#### ${t("education.goals.title")}`,
    t("education.goals.body"),
    ...PACE_RACE_KEYS.map((race) =>
      [
        `##### ${t(`education.goals.titles.${race}`)}`,
        `| ${t("education.goals.goal")} | min/km | min/mile |`,
        "| --- | --- | --- |",
        ...getRacePaceGoals(race).map(
          (row) => `| ${row.time} | ${row.perKm} | ${row.perMile} |`,
        ),
      ].join("\n"),
    ),
    t("education.goals.note"),
    `${t("education.sources.distances")} [World Athletics](${PACE_SOURCES.distances})`,
    `#### ${t("education.reading.title")}`,
    ...readings.map(
      (item, index) =>
        `##### ${item.title}\n\n${t(`education.reading.items.${index}.body`, { weightedPace: examples.weightedPace })}`,
    ),
    `#### ${t("education.next.title")}`,
    t("education.next.body"),
    `[${t("education.next.vdot")}](/vdot-calculator)`,
    `[${t("education.next.predictor")}](/race-time-predictor)`,
    `[${t("education.next.zones")}](/docs/metrics/pace/zones)`,
    `#### ${t("faqTitle")}`,
    ...faq.map((item) => `##### ${item.question}\n\n${item.answer}`),
  ].join("\n\n");
}
