import { getTranslations } from "next-intl/server";
import {
  getRacePredictionExamples,
  RACE_PREDICTION_SOURCES,
} from "./race-time-education";
import { PREDICT_RACE_KEYS } from "./race-time-predictor";

/** Reuse the visible English messages and calculator examples, not a separate article. */
export async function getRaceTimeLlmText() {
  const [t, race] = await Promise.all([
    getTranslations({ locale: "en", namespace: "raceTimePredictor.page" }),
    getTranslations({
      locale: "en",
      namespace: "raceTimePredictor.client.presets",
    }),
  ]);
  const examples = getRacePredictionExamples();
  const tenK = examples.find(
    (row) => row.source === "10k" && row.sourceTime === "50:00",
  )!;
  const checks = t.raw("education.accuracy.checks") as string[];
  const steps = t.raw("education.input.steps") as Array<{
    title: string;
    body: string;
  }>;
  const faq = t.raw("faq") as Array<{ question: string; answer: string }>;
  return [
    `#### ${t("education.definition.title")}`,
    t("education.definition.body"),
    `#### ${t("howTo.title")}`,
    ...(["inputs", "formula", "next"] as const).map(
      (key, i) =>
        `${i + 1}. ${t(`howTo.steps.${key}.title`)}: ${t(`howTo.steps.${key}.body`)}`,
    ),
    `#### ${t("education.marathon.title")}`,
    t("education.marathon.body"),
    ...(["from5k", "from10k", "fromHalf"] as const).map(
      (key) =>
        `##### ${t(`education.marathon.${key}.title`)}\n\n${t(`education.marathon.${key}.body`)}`,
    ),
    t("education.marathon.example", {
      source: tenK.sourceTime,
      marathon: tenK.times.marathon,
    }),
    `#### ${t("education.examples.title")}`,
    t("education.examples.body"),
    [
      `| ${t("education.examples.source")} | ${PREDICT_RACE_KEYS.map((key) => race(key)).join(" | ")} |`,
      "| --- | --- | --- | --- | --- |",
      ...examples.map(
        (row) =>
          `| ${race(row.source)} ${row.sourceTime} | ${PREDICT_RACE_KEYS.map((key) => row.times[key]).join(" | ")} |`,
      ),
    ].join("\n"),
    t("education.examples.note"),
    `#### ${t("education.accuracy.title")}`,
    t("education.accuracy.body"),
    checks.map((item) => `- ${item}`).join("\n"),
    t("education.accuracy.research"),
    `#### ${t("education.comparison.title")}`,
    ...(
      [
        ["vdot", "Daniels VDOT"],
        ["riegel", "Riegel"],
        ["garmin", "Garmin"],
      ] as const
    ).map(
      ([key, name]) =>
        `- ${name}: ${t(`education.comparison.rows.${key}.input`)} ${t(`education.comparison.rows.${key}.meaning`)}`,
    ),
    t("education.comparison.note"),
    `#### ${t("education.input.title")}`,
    steps.map((step, i) => `${i + 1}. ${step.title}: ${step.body}`).join("\n"),
    t("education.input.privacy"),
    `#### ${t("sections.answer.title")}`,
    t("sections.answer.description"),
    t("sections.answer.body"),
    `\`\`\`text\n${t("sections.answer.formula")}\n\`\`\``,
    t("sections.answer.limits"),
    `#### ${t("faqTitle")}`,
    ...faq.map((item) => `##### ${item.question}\n\n${item.answer}`),
    `#### ${t("education.sources.title")}`,
    RACE_PREDICTION_SOURCES.map(
      (source) =>
        `- [${source.label}](${source.href}): ${t(`education.sources.${source.key}`)}`,
    ).join("\n"),
  ].join("\n\n");
}
