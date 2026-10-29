export const aiCoachSlugs = ["running-coach", "cycling-coach"] as const;

export type AiCoachSlug = (typeof aiCoachSlugs)[number];

export function isAiCoachSlug(value: string): value is AiCoachSlug {
  return (aiCoachSlugs as readonly string[]).includes(value);
}

export type AiCoachCollectionCopy = {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
  groupTitle: string;
  groupSubtitle: string;
  cardPrimary: string;
  cardSecondary: string;
  differenceTitle: string;
  differences: Array<[string, string]>;
  faqTitle: string;
  faqSubtitle: string;
  faq: Array<[string, string]>;
};

export type AiCoachPage = {
  slug: AiCoachSlug;
  sport: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
  definitionTitle: string;
  definitionText: string;
  promise: string;
  exampleTitle: string;
  exampleSubtitle: string;
  exampleSteps: Array<[string, string]>;
  dataTitle: string;
  dataSubtitle: string;
  dataPoints: Array<[string, string, string]>;
  signalsTitle: string;
  signalsSubtitle: string;
  signals: Array<[string, string]>;
  comparisonTitle: string;
  comparisonSubtitle: string;
  comparisons: Array<[string, string, string]>;
  safetyTitle: string;
  safetyText: string;
  safetyItems: Array<[string, string]>;
  useCasesTitle: string;
  useCases: Array<[string, string]>;
  workflowTitle: string;
  workflow: Array<[string, string]>;
  relatedTitle: string;
  relatedLinks: Array<[string, string, string]>;
  faqTitle: string;
  faqSubtitle: string;
  faq: Array<[string, string]>;
  ctaTitle: string;
  ctaText: string;
};

export type AiCoachPageLabels = {
  home: string;
  aiCoach: string;
  signal: string;
  useCase: string;
  workflow: string;
  dataPoint: string;
  dataReason: string;
  dataAction: string;
  example: string;
  comparison: string;
  definition: string;
};
