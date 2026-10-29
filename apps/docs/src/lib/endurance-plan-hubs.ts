export const endurancePlanHubSlugs = [
  "cycling-training-plan",
  "ironman-70-3-training-plan",
  "olympic-triathlon-training-plan",
  "swim-training-plan",
] as const;

export type EndurancePlanHubSlug = (typeof endurancePlanHubSlugs)[number];

export type EndurancePlanHub = {
  slug: EndurancePlanHubSlug;
  routePath: string;
  sport: string;
  weeks: string;
  level: string;
  weeklyVolume: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  honestyTitle: string;
  honestyText: string;
  primaryCta: string;
  secondaryCta: string;
  promise: string;
  forTitle: string;
  forItems: string[];
  phaseTitle: string;
  phaseSubtitle: string;
  phaseNote: string;
  previewRows: Array<[string, string, string]>;
  methodTitle: string;
  methodSubtitle: string;
  methodSections: Array<[string, string, string[]]>;
  howToTitle: string;
  howToDescription: string;
  howToSteps: Array<[string, string]>;
  howToTotalTime?: string;
  aiTitle: string;
  aiSubtitle: string;
  aiSignals: Array<[string, string]>;
  relatedTitle: string;
  relatedLinks: Array<[string, string, string]>;
  faqTitle: string;
  faqSubtitle: string;
  faq: Array<[string, string]>;
  finalTitle: string;
  finalText: string;
  finalCta: string;
  trustItems: string[];
  appIntent: "cycling" | "triathlon" | "swimming";
  cardTitle: string;
  cardDescription: string;
  cardMeta: string;
};

export type EndurancePlanHubLabels = {
  home: string;
  plans: string;
  tools: string;
  framework: string;
  timeline: string;
  level: string;
  volume: string;
  viewFramework: string;
  createInApp: string;
};

export type EndurancePlanHubCollection = {
  title: string;
  subtitle: string;
  cardCta: string;
  cardBadge: string;
  toolsGroup: string;
};

export const ENDURANCE_PLAN_HUB_ROUTES: Record<EndurancePlanHubSlug, string> = {
  "cycling-training-plan": "/cycling-training-plan",
  "ironman-70-3-training-plan": "/ironman-70-3-training-plan",
  "olympic-triathlon-training-plan": "/olympic-triathlon-training-plan",
  "swim-training-plan": "/swim-training-plan",
};

export function isEndurancePlanHubSlug(
  value: string,
): value is EndurancePlanHubSlug {
  return (endurancePlanHubSlugs as readonly string[]).includes(value);
}

export function normalizeEndurancePlanHub(
  page: EndurancePlanHub,
  slug: EndurancePlanHubSlug,
): EndurancePlanHub {
  return {
    ...page,
    slug,
    routePath: ENDURANCE_PLAN_HUB_ROUTES[slug],
  };
}
