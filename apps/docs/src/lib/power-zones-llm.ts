import { getTranslations } from "next-intl/server";

type CogganRow = {
  zone: string;
  name: string;
  percent: string;
  example: string;
};

type WorkoutTarget = {
  target: string;
  percent: string;
  use: string;
};

type FaqItem = { question: string; answer: string };

export async function getPowerZonesLlmText() {
  const [t, model] = await Promise.all([
    getTranslations({ locale: "en", namespace: "powerZonesCalculator.page" }),
    getTranslations({
      locale: "en",
      namespace: "powerZonesCalculator.client.inputs.model.options",
    }),
  ]);
  const coggan = t.raw("sections.coggan.rows") as CogganRow[];
  const targets = t.raw("sections.targets.rows") as WorkoutTarget[];
  const limits = t.raw("sections.limits.items") as string[];
  const faq = t.raw("faq") as FaqItem[];
  return [
    `#### ${t("sections.definition.title")}`,
    t("sections.definition.answer"),
    t("sections.definition.detail"),
    `#### ${t("sections.coggan.title")}`,
    t("sections.coggan.description"),
    [
      `| ${t("sections.coggan.headers.zone")} | ${t("sections.coggan.headers.name")} | ${t("sections.coggan.headers.percent")} | ${t("sections.coggan.headers.example")} |`,
      "| --- | --- | --- | --- |",
      ...coggan.map(
        (row) =>
          `| ${row.zone} | ${row.name} | ${row.percent} | ${row.example} |`,
      ),
    ].join("\n"),
    t("sections.coggan.note"),
    `#### ${t("sections.targets.title")}`,
    t("sections.targets.description"),
    [
      `| ${t("sections.targets.headers.target")} | ${t("sections.targets.headers.percent")} | ${t("sections.targets.headers.use")} |`,
      "| --- | --- | --- |",
      ...targets.map(
        (row) => `| ${row.target} | ${row.percent} | ${row.use} |`,
      ),
    ].join("\n"),
    t("sections.targets.note"),
    `#### ${t("sections.reference.title")}`,
    t("sections.reference.description"),
    ...(["ftp", "cp", "models"] as const).map(
      (key) =>
        `##### ${t(`sections.reference.cards.${key}.title`)}\n\n${t(`sections.reference.cards.${key}.body`)}`,
    ),
    `#### ${t("sections.models.title")}`,
    t("sections.models.description"),
    ...(["coggan", "friel", "vance", "stryd"] as const).map(
      (key) =>
        `- ${model(key)}: ${t(`sections.models.cards.${key}`)}`,
    ),
    `#### ${t("sections.limits.title")}`,
    t("sections.limits.description"),
    limits.map((item) => `- ${item}`).join("\n"),
    `#### ${t("faqTitle")}`,
    ...faq.map((item) => `##### ${item.question}\n\n${item.answer}`),
  ].join("\n\n");
}
