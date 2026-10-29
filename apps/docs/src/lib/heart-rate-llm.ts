import { getTranslations } from "next-intl/server";
import {
  calculateZone2FromAge,
  estimateMaxHrFromAge,
  formatAnchorBpm,
} from "./zone-2-heart-rate";
import {
  estimateMaxHr,
  roundBpm,
  type MaxHrFormulaKey,
} from "./max-heart-rate";

type MethodRow = {
  method: string;
  band: string;
  formula: string;
  use: string;
};

type TextCard = { title: string; body: string };
type FaqItem = { question: string; answer: string };
type SourceLink = { label: string; href: string };

const MAX_HR_FORMULAS = [
  "tanaka",
  "gulati",
  "hunt",
  "arena",
  "fox",
] as const satisfies readonly MaxHrFormulaKey[];

function plainRichText(value: string) {
  return value.replace(/<\/?strong>/g, "");
}

export async function getMaxHeartRateLlmText() {
  const t = await getTranslations({
    locale: "en",
    namespace: "maxHeartRateCalculator.page",
  });
  const limitations = t.raw("limitations.items") as string[];
  const measureSteps = t.raw("measure.steps") as string[];
  const faq = t.raw("faq") as FaqItem[];
  const ageRows = [20, 30, 40, 50, 60, 70, 80].map((age) => ({
    age,
    tanaka: roundBpm(estimateMaxHr("tanaka", age)!),
    fox: roundBpm(estimateMaxHr("fox", age)!),
    gulati: roundBpm(estimateMaxHr("gulati", age)!),
  }));
  return [
    `#### ${t("quickAnswer.title")}`,
    plainRichText(t.raw("quickAnswer.body") as string),
    t("quickAnswer.note"),
    ...(["adults", "women", "measured"] as const).map(
      (key) =>
        `- ${t(`quickAnswer.bestFormula.${key}.label`)}: ${t(`quickAnswer.bestFormula.${key}.value`)}`,
    ),
    `#### ${t("methodsTitle")}`,
    t("methodsBody"),
    [
      `| ${t("methodsHeaders.formula")} | ${t("methodsHeaders.equation")} | ${t("methodsHeaders.bestFor")} |`,
      "| --- | --- | --- |",
      ...MAX_HR_FORMULAS.map(
        (key) =>
          `| ${t(`formulas.${key}.name`)} | ${t(`formulas.${key}.equation`)} | ${t(`formulas.${key}.bestFor`)} |`,
      ),
    ].join("\n"),
    `#### ${t("limitations.title")}`,
    t("limitations.body"),
    limitations.map((item) => `- ${item}`).join("\n"),
    `#### ${t("measure.title")}`,
    t("measure.body"),
    measureSteps.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    t("measure.safety"),
    `#### ${t("byAge.title")}`,
    t("byAge.body"),
    [
      `| ${t("byAge.headers.age")} | ${t("byAge.headers.tanaka")} | ${t("byAge.headers.fox")} | ${t("byAge.headers.gulati")} |`,
      "| --- | --- | --- | --- |",
      ...ageRows.map(
        (row) =>
          `| ${row.age} | ${row.tanaka} | ${row.fox} | ${row.gulati} |`,
      ),
    ].join("\n"),
    t("byAge.note"),
    `#### ${t("faqTitle")}`,
    ...faq.map((item) => `##### ${item.question}\n\n${item.answer}`),
    "#### Research sources",
    `- [${t("research.tanaka")}](https://pubmed.ncbi.nlm.nih.gov/11153730/)`,
    `- [${t("research.gulati")}](https://pubmed.ncbi.nlm.nih.gov/20585008/)`,
    `- [${t("research.hunt")}](https://pubmed.ncbi.nlm.nih.gov/22376273/)`,
  ].join("\n\n");
}

export async function getZone2HeartRateLlmText() {
  const t = await getTranslations({
    locale: "en",
    namespace: "zone2HeartRateCalculator.page",
  });
  const methods = t.raw("sections.methods.rows") as MethodRow[];
  const cards = t.raw("education.feel.cards") as TextCard[];
  const faq = t.raw("faq") as FaqItem[];
  const sources = t.raw("sections.methods.sources") as SourceLink[];
  const ageRows = [20, 30, 40, 50, 60, 70].flatMap((age) => {
    const maxHr = estimateMaxHrFromAge(age, "tanaka");
    const range = calculateZone2FromAge(age, "tanaka");
    return maxHr == null || range == null ? [] : [{ age, maxHr, range }];
  });
  return [
    `#### ${t("education.definition.title")}`,
    t("education.definition.answer"),
    t("education.definition.detail"),
    `#### ${t("sections.methods.title")}`,
    t("sections.methods.description"),
    [
      `| ${t("sections.methods.headers.method")} | ${t("sections.methods.headers.band")} | ${t("sections.methods.headers.formula")} | ${t("sections.methods.headers.use")} |`,
      "| --- | --- | --- | --- |",
      ...methods.map(
        (row) =>
          `| ${row.method} | ${row.band} | ${row.formula} | ${row.use} |`,
      ),
    ].join("\n"),
    t("sections.methods.note"),
    `#### ${t("education.ageTable.title")}`,
    t("education.ageTable.body"),
    [
      `| ${t("education.ageTable.age")} | ${t("education.ageTable.maxHr")} | ${t("education.ageTable.range")} |`,
      "| --- | --- | --- |",
      ...ageRows.map(
        ({ age, maxHr, range }) =>
          `| ${age} | ${formatAnchorBpm(maxHr)} bpm | ${range.bpmMin}–${range.bpmMax} bpm |`,
      ),
    ].join("\n"),
    t("education.ageTable.note"),
    `#### ${t("education.feel.title")}`,
    t("education.feel.body"),
    ...cards.map((card) => `##### ${card.title}\n\n${card.body}`),
    `#### ${t("education.handoff.title")}`,
    t("education.handoff.body"),
    `[${t("education.handoff.cta")}](/heart-rate-zones-calculator)`,
    `#### ${t("faqTitle")}`,
    ...faq.map((item) => `##### ${item.question}\n\n${item.answer}`),
    "#### Methods and sources",
    sources.map((source) => `- [${source.label}](${source.href})`).join("\n"),
  ].join("\n\n");
}

export async function getHeartRateZonesLlmText() {
  const [t, client] = await Promise.all([
    getTranslations({
      locale: "en",
      namespace: "heartRateZonesCalculator.page",
    }),
    getTranslations({
      locale: "en",
      namespace: "heartRateZonesCalculator.client",
    }),
  ]);
  const faq = t.raw("faq") as FaqItem[];
  const fiveOrders = [1, 2, 3, 4, 5] as const;
  const sevenOrders = [1, 2, 3, 4, 5, 6, 7] as const;
  return [
    `#### ${t("sections.answer.title")}`,
    t("sections.answer.body"),
    t("sections.answer.zone2Prompt"),
    `[${t("sections.answer.zone2Cta")}](/zone-2-heart-rate-calculator)`,
    `#### ${t("howTo.title")}`,
    ...(["model", "values", "train"] as const).map(
      (key, index) =>
        `${index + 1}. ${t(`howTo.steps.${key}.title`)}: ${t(`howTo.steps.${key}.body`)}`,
    ),
    `#### ${t("sections.models.title")}`,
    t("sections.models.description"),
    ...(["karvonen", "friel", "mhr"] as const).map(
      (key) =>
        `##### ${t(`sections.models.labels.${key}`)}\n\n${t(`sections.models.cards.${key}`)} ${t(`sections.models.useWhen.${key}`)}`,
    ),
    `#### ${client("explained.title")} — 5-zone models`,
    fiveOrders
      .map(
        (order) =>
          `- ${client(`zoneNames.karvonen.z${order}`)}: ${client(`explained.five.items.z${order}.summary`)}`,
      )
      .join("\n"),
    `#### ${client("explained.title")} — Friel 7-zone model`,
    sevenOrders
      .map(
        (order) =>
          `- ${client(`zoneNames.friel.z${order}`)}: ${client(`explained.seven.items.z${order}.summary`)}`,
      )
      .join("\n"),
    `#### ${t("methods.title")}`,
    t("methods.body"),
    `- ${t("methods.karvonen")}`,
    `- ${t("methods.friel")}`,
    `- ${t("methods.maxHr")}`,
    `#### ${t("faqTitle")}`,
    ...faq.map((item) => `##### ${item.question}\n\n${item.answer}`),
  ].join("\n\n");
}
