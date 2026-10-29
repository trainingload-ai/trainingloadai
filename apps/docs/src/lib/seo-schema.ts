type SchemaNode = Record<string, unknown>;

export function schemaGraph(nodes: Array<SchemaNode | null | undefined>) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean),
  };
}

export function schemaId(url: string, name: string) {
  return `${url}#${name}`;
}

export function schemaLanguage(locale: string) {
  if (locale === "zh") return "zh-CN";
  if (locale === "zh-hant") return "zh-Hant";
  if (locale === "ja") return "ja";
  if (locale === "de") return "de";
  if (locale === "fr") return "fr";
  if (locale === "ko") return "ko";
  if (locale === "es") return "es";
  if (locale === "pt-BR") return "pt-BR";
  if (locale === "it") return "it";
  return "en";
}

export function openGraphLocale(locale: string) {
  if (locale === "zh") return "zh_CN";
  if (locale === "zh-hant") return "zh_HK";
  if (locale === "ja") return "ja_JP";
  if (locale === "de") return "de_DE";
  if (locale === "fr") return "fr_FR";
  if (locale === "ko") return "ko_KR";
  if (locale === "es") return "es_ES";
  if (locale === "pt-BR") return "pt_BR";
  if (locale === "it") return "it_IT";
  return "en_US";
}

export function dateLocale(locale: string) {
  if (locale === "zh") return "zh-CN";
  if (locale === "zh-hant") return "zh-Hant";
  if (locale === "ja") return "ja-JP";
  if (locale === "de") return "de-DE";
  if (locale === "fr") return "fr-FR";
  if (locale === "ko") return "ko-KR";
  if (locale === "es") return "es-ES";
  if (locale === "pt-BR") return "pt-BR";
  if (locale === "it") return "it-IT";
  return "en-US";
}

export function normalizeFeatureList(raw: unknown) {
  if (typeof raw === "string") {
    return raw
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }

  return undefined;
}

export function normalizeFaqItems(raw: unknown) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((x) => {
      const item = x as { question?: unknown; answer?: unknown } | null;
      const question =
        typeof item?.question === "string" ? item.question : null;
      const answer = typeof item?.answer === "string" ? item.answer : null;
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter(Boolean) as Array<{ question: string; answer: string }>;
}

export function normalizeSchemaFaqItems(raw: unknown) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const item = x as {
        name?: unknown;
        question?: unknown;
        answer?: unknown;
        acceptedAnswer?: unknown;
      };
      const name =
        typeof item.name === "string"
          ? item.name
          : typeof item.question === "string"
            ? item.question
            : null;
      const acceptedAnswer =
        item.acceptedAnswer && typeof item.acceptedAnswer === "object"
          ? (item.acceptedAnswer as { text?: unknown })
          : null;
      const text =
        typeof acceptedAnswer?.text === "string"
          ? acceptedAnswer.text
          : typeof item.answer === "string"
            ? item.answer
            : null;
      if (!name || !text) return null;
      return {
        "@type": "Question",
        name,
        acceptedAnswer: {
          "@type": "Answer",
          text,
        },
      };
    })
    .filter(Boolean);
}

export function webPageSchema({
  id,
  url,
  name,
  description,
  lang,
  type = "WebPage",
  mainEntityId,
}: {
  id: string;
  url: string;
  name: string;
  description: string;
  lang: string;
  type?: "WebPage" | "CollectionPage";
  mainEntityId?: string;
}) {
  return {
    "@type": type,
    "@id": id,
    url,
    name,
    description,
    inLanguage: schemaLanguage(lang),
    ...(mainEntityId ? { mainEntity: { "@id": mainEntityId } } : {}),
  };
}

export function webApplicationSchema({
  id,
  url,
  name,
  description,
  applicationCategory,
  featureList,
}: {
  id: string;
  url: string;
  name: string;
  description: string;
  applicationCategory: string;
  featureList?: string[];
}) {
  return {
    "@type": "WebApplication",
    "@id": id,
    name,
    description,
    url,
    applicationCategory,
    operatingSystem: "Web",
    isAccessibleForFree: true,
    ...(featureList && featureList.length > 0 ? { featureList } : {}),
  };
}

export function faqPageSchema({
  id,
  mainEntity,
}: {
  id: string;
  mainEntity: unknown[];
}) {
  if (mainEntity.length === 0) return null;

  return {
    "@type": "FAQPage",
    "@id": id,
    mainEntity,
  };
}

export function breadcrumbSchema({
  id,
  items,
}: {
  id: string;
  items: Array<{ name: string; item: string }>;
}) {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

export function itemListSchema({
  id,
  items,
}: {
  id: string;
  items: Array<{ name: string; description: string; url: string }>;
}) {
  return {
    "@type": "ItemList",
    "@id": id,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "WebApplication",
        name: item.name,
        description: item.description,
        url: item.url,
        applicationCategory: "HealthApplication",
        operatingSystem: "Web",
        isAccessibleForFree: true,
      },
    })),
  };
}

// HowTo: per-step structured recipe for "how to ..." queries.
// Each step should be a self-contained sentence so AI engines can extract
// a single step without surrounding context.
export function howToSchema({
  id,
  name,
  description,
  steps,
  totalTime,
}: {
  id: string;
  name: string;
  description: string;
  steps: Array<{ name: string; text: string }>;
  totalTime?: string;
}) {
  if (!steps || steps.length === 0) return null;
  return {
    "@type": "HowTo",
    "@id": id,
    name,
    description,
    ...(totalTime ? { totalTime } : {}),
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

// ItemList for product comparison / alternatives pages.
// Use a neutral, balanced framing so AI engines do not mark it as biased
// marketing copy.
export function itemListComparisonSchema({
  id,
  name,
  description,
  items,
}: {
  id: string;
  name: string;
  description: string;
  items: Array<{
    name: string;
    description: string;
    url: string;
    strengths: string[];
    bestFor: string;
  }>;
}) {
  return {
    "@type": "ItemList",
    "@id": id,
    name,
    description,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "SoftwareApplication",
        name: item.name,
        description: item.description,
        url: item.url,
        applicationCategory: "HealthApplication",
        operatingSystem: "Web",
        ...(item.strengths.length > 0 ? { featureList: item.strengths } : {}),
      },
    })),
  };
}
