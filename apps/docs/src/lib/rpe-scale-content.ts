import messages from "@trainingloadai/messages/docs-copy/rpe-scale.json";

export const RPE_SCALE_PATH = "/rpe-scale";

export const RPE_SCALE_CONTENT_LOCALES = [
  "en",
  "zh",
  "zh-hant",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
  "it",
  "pt-BR",
] as const;

export type RpeScaleRow = {
  id: string;
  range: string;
  label: string;
  feel: string;
  talkTest: string;
  training: string;
};

export type RpeScaleContent = {
  metadataTitle: string;
  metadataDescription: string;
  keywords: string[];
  shortTitle: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  directAnswer: string;
  effortFirstLabel: string;
  primaryCta: string;
  secondaryCta: string;
  toc: string;
  tocItems: Array<[string, string]>;
  definitionTitle: string;
  definitionParagraphs: string[];
  scaleTitle: string;
  scaleIntro: string;
  scaleHeaders: [string, string, string, string, string];
  scaleRows: RpeScaleRow[];
  scaleCaution: string;
  plansTitle: string;
  plansIntro: string;
  plans: Array<{
    title: string;
    range: string;
    description: string;
    href: string;
  }>;
  compareTitle: string;
  compareIntro: string;
  comparisons: Array<{ title: string; strength: string; limitation: string }>;
  compareConclusion: string;
  coachTitle: string;
  coachParagraphs: string[];
  coachSteps: Array<{ title: string; description: string }>;
  meaningsTitle: string;
  meaningsIntro: string;
  meanings: Array<{ title: string; description: string; href?: string }>;
  calibrateTitle: string;
  calibrateIntro: string;
  calibrateSteps: string[];
  mistakesTitle: string;
  mistakes: string[];
  faqTitle: string;
  faq: Array<[string, string]>;
  sourcesTitle: string;
  sourceNote: string;
  safety: string;
  relatedTitle: string;
  related: Array<[string, string, string]>;
  homeLabel: string;
  scheduleGuideLabel: string;
  intensityLinkLabel: string;
};

type RpeScaleLocale = (typeof RPE_SCALE_CONTENT_LOCALES)[number];
const content = messages as Record<RpeScaleLocale, RpeScaleContent>;

export function isRpeScaleContentLocale(
  locale: string,
): locale is RpeScaleLocale {
  return (RPE_SCALE_CONTENT_LOCALES as readonly string[]).includes(locale);
}

export function getRpeScaleContent(locale: string): RpeScaleContent {
  if (isRpeScaleContentLocale(locale)) {
    return content[locale];
  }
  return content.en;
}
