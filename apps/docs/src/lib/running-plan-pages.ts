import messages from "@trainingloadai/messages/docs-copy/running-plan-pages.json";
import {
  getRunPlanTemplate,
  normalizePlanTemplateLocale,
} from "@shared/plan-templates";
import {
  HALF_MARATHON_PLAN_FACTS,
  isHalfMarathonIndexedLocale,
} from "./half-marathon-training-plan-copy";
import {
  MARATHON_PLAN_FACTS,
  isMarathonIndexedLocale,
} from "./marathon-training-plan-copy";
import {
  TEN_K_PLAN_FACTS,
  isTenKIndexedLocale,
} from "./ten-k-training-plan-copy";

export const runningPlanSlugs = [
  "couch-to-5k-training-plan",
  "5k-training-plan",
  "5k-training-plan-intermediate",
  "10k-training-plan",
  "half-marathon-training-plan",
  "marathon-training-plan",
] as const;

export type RunningPlanSlug = (typeof runningPlanSlugs)[number];

export type RunningPlan = {
  slug: RunningPlanSlug;
  /** Public URL; kept separate because some plans use nested routes. */
  routePath?: string;
  templateSlug?:
    | "first-5k"
    | "finish-5k"
    | "improve-5k"
    | "finish-10k"
    | "finish-half-marathon"
    | "finish-marathon";
  distance: string;
  sport: "Running";
  weeks: string;
  level: string;
  weeklyVolume: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  primaryCtaTarget?: "app" | "schedule";
  secondaryCta: string;
  secondaryCtaTarget?: "app" | "plan-hub";
  conversionCta?: string;
  finalCta?: string;
  finalTitle?: string;
  finalText?: string;
  collectionCta?: string;
  trustItems?: string[];
  promise: string;
  planChooser?: {
    title: string;
    subtitle: string;
    options: Array<{
      label: string;
      title: string;
      description: string;
      href: string | null;
    }>;
  };
  forTitle: string;
  forItems: string[];
  previewTitle: string;
  previewSubtitle: string;
  previewRows: Array<[string, string, string]>;
  contentTitle?: string;
  contentSubtitle?: string;
  contentSections?: Array<[string, string, string[]]>;
  conversionTitle?: string;
  conversionText?: string;
  aiTitle: string;
  aiSubtitle: string;
  aiSignals: Array<[string, string]>;
  relatedTitle?: string;
  relatedLinks?: Array<[string, string, string]>;
  faq: Array<[string, string]>;
  howToTitle?: string;
  howToDescription?: string;
  howToSteps?: Array<[string, string]>;
  howToTotalTime?: string;
};

export function createCouchTo5kPlan(
  localizedPlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const loopLinks = productLoopRelatedLinks(lang).filter(
    ([, href]) => href !== "/vdot-calculator",
  );
  return {
    ...localizedPlan,
    slug: "couch-to-5k-training-plan",
    routePath: "/couch-to-5k-training-plan",
    templateSlug: "first-5k",
    planChooser: createFiveKPlanChooser(lang, "couch"),
    relatedLinks: mergeRelatedLinks(
      mergeRelatedLinks(
        localizedPlan.relatedLinks,
        fiveKHubRelatedLink(lang, "couch"),
      ),
      loopLinks,
    ),
  };
}

type PlanCopyLocale =
  | "en"
  | "zh"
  | "zh-hant"
  | "ja"
  | "ko"
  | "de"
  | "fr"
  | "es"
  | "it"
  | "pt-BR";

function planCopyLocale(lang: string): PlanCopyLocale {
  if (lang === "zh-hant") return "zh-hant";
  if (lang.startsWith("zh")) return "zh";
  if (lang === "ja") return "ja";
  if (lang === "ko") return "ko";
  if (lang === "de") return "de";
  if (lang === "fr") return "fr";
  if (lang === "es") return "es";
  if (lang === "it") return "it";
  if (lang === "pt-BR" || lang.toLowerCase() === "pt-br") return "pt-BR";
  return "en";
}

type FiveKChooserVariant = "couch" | "finish" | "intermediate";
type RaceDistance = "10k" | "half-marathon" | "marathon";

const fiveKChooserLabels = messages.fiveKChooserLabels;

function createFiveKPlanChooser(
  lang: string,
  current: FiveKChooserVariant,
): NonNullable<RunningPlan["planChooser"]> {
  const locale = planCopyLocale(lang);
  const source = fiveKCopyForLocale(locale).planChooser ?? messages.fiveKCopy.en.planChooser;
  const labels = fiveKChooserLabels[locale];
  const routes = [
    "/couch-to-5k-training-plan",
    "/5k-training-plan",
    "/5k-training-plan/intermediate",
  ] as const;
  const currentIndex = { couch: 0, finish: 1, intermediate: 2 }[current];

  return {
    ...source,
    options: source.options.map((option, index) => ({
      ...option,
      label: index === currentIndex ? labels.current : labels.options[index],
      href: index === currentIndex ? null : routes[index],
    })),
  };
}

const raceDistanceChooserCopy = messages.raceDistanceChooserCopy;

function createRaceDistancePlanChooser(
  lang: string,
  distance: RaceDistance,
): NonNullable<RunningPlan["planChooser"]> {
  const copy = raceDistanceChooserCopy[planCopyLocale(lang)][distance];
  const basePath =
    distance === "10k"
      ? "/10k-training-plan"
      : distance === "half-marathon"
        ? "/half-marathon-training-plan"
        : "/marathon-training-plan";
  const hrefs = [null, `${basePath}/improve`, `${basePath}/target`] as const;

  return {
    title: copy.title,
    subtitle: copy.subtitle,
    options: copy.options.map((option, index) => ({
      ...option,
      href: hrefs[index] ?? null,
    })),
  };
}

const fiveKHubRelatedLinksByLocale =
  messages.fiveKHubRelatedLinksByLocale as Record<
  PlanCopyLocale,
  [string, string, string]
>;

function fiveKHubRelatedLink(
  lang: string,
  variant: Exclude<FiveKChooserVariant, "finish">,
): Array<[string, string, string]> {
  const locale = planCopyLocale(lang);
  if (variant === "couch") {
    return [fiveKHubRelatedLinksByLocale[locale]];
  }
  return [];
}

const productLoopRelatedLinksByLocale =
  messages.productLoopRelatedLinksByLocale as Record<
  PlanCopyLocale,
  Array<[string, string, string]>
>;

/** Action links that keep distance hubs inside the product loop. */
export function productLoopRelatedLinks(
  lang: string,
): Array<[string, string, string]> {
  return productLoopRelatedLinksByLocale[planCopyLocale(lang)];
}

function mergeRelatedLinks(
  existing: Array<[string, string, string]> | undefined,
  extras: Array<[string, string, string]>,
) {
  const merged = [...(existing ?? [])];
  const seen = new Set(merged.map(([, href]) => href));
  for (const link of extras) {
    if (seen.has(link[1])) continue;
    merged.push(link);
    seen.add(link[1]);
  }
  return merged;
}

function fiveKCopyForLocale(locale: PlanCopyLocale): Partial<RunningPlan> {
  const copies = messages.fiveKCopy;
  const copy =
    locale === "en" || locale === "zh"
      ? copies[locale]
      : { ...copies[locale === "zh-hant" ? "zh" : "en"], ...copies[locale] };

  return {
    ...copy,
    previewRows: copy.previewRows as RunningPlan["previewRows"],
    contentSections: copy.contentSections as RunningPlan["contentSections"],
    aiSignals: copy.aiSignals as RunningPlan["aiSignals"],
    relatedLinks: copy.relatedLinks as RunningPlan["relatedLinks"],
    faq: copy.faq as RunningPlan["faq"],
  };
}

const finishFiveKDetails =
  messages.finishFiveKDetails as Record<
  PlanCopyLocale,
  Pick<
    RunningPlan,
    | "previewTitle"
    | "previewSubtitle"
    | "previewRows"
    | "contentTitle"
    | "contentSubtitle"
    | "contentSections"
  >
>;

export function createFiveKTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const locale = planCopyLocale(lang);
  const copy = fiveKCopyForLocale(locale);
  const templateLocale = normalizePlanTemplateLocale(lang);
  const localized = getRunPlanTemplate("finish-5k")!.copy[templateLocale];
  const details = finishFiveKDetails[locale];
  const { templateMetaDescriptions } = messages;
  const existingRelatedLinks = copy.relatedLinks ?? basePlan.relatedLinks ?? [];
  const [firstRelated, ...restRelated] = existingRelatedLinks;
  const intermediateLink = messages.intermediateLinksByLocale[
    locale
  ] as [string, string, string];
  return {
    ...basePlan,
    ...copy,
    slug: "5k-training-plan",
    routePath: "/5k-training-plan",
    templateSlug: "finish-5k",
    title: copy.title ?? basePlan.title,
    subtitle: copy.subtitle ?? localized.description,
    promise: copy.promise ?? localized.promise,
    ...details,
    metaDescription:
      templateMetaDescriptions[locale] ?? templateMetaDescriptions.en,
    relatedLinks: mergeRelatedLinks(
      [
        ...(firstRelated ? [firstRelated] : []),
        intermediateLink,
        ...restRelated,
      ],
      productLoopRelatedLinks(lang),
    ),
  };
}

type IntermediateFiveKLocaleCopy = {
  title?: string;
  promise?: string;
  heroSubtitle: string;
  previewRows: RunningPlan["previewRows"];
  contentTitle: string;
  contentSubtitle: string;
  contentSections: NonNullable<RunningPlan["contentSections"]>;
  level: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  forTitle: string;
  forItems: string[];
  standardFinishLink: [string, string, string];
  faq: RunningPlan["faq"];
};

const intermediateFiveKCopyByLocale =
  messages.intermediateFiveKCopyByLocale as Record<
  PlanCopyLocale,
  IntermediateFiveKLocaleCopy
>;

export function createIntermediateFiveKPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const finish = createFiveKTrainingPlan(basePlan, lang);
  const locale = planCopyLocale(lang);
  const sourceCopy = fiveKCopyForLocale(locale);
  const localized =
    getRunPlanTemplate("improve-5k")!.copy[normalizePlanTemplateLocale(lang)];
  const copy = intermediateFiveKCopyByLocale[locale];
  return {
    ...finish,
    slug: "5k-training-plan-intermediate",
    routePath: "/5k-training-plan/intermediate",
    templateSlug: "improve-5k",
    level: copy.level,
    metaTitle: copy.metaTitle,
    metaDescription: copy.metaDescription,
    keywords: copy.keywords,
    eyebrow: copy.eyebrow,
    title: copy.title ?? localized.title,
    subtitle: copy.heroSubtitle,
    promise: copy.promise ?? localized.promise,
    previewTitle: sourceCopy.previewTitle ?? finish.previewTitle,
    previewSubtitle: sourceCopy.previewSubtitle ?? finish.previewSubtitle,
    previewRows: copy.previewRows,
    planChooser: createFiveKPlanChooser(lang, "intermediate"),
    contentTitle: copy.contentTitle,
    contentSubtitle: copy.contentSubtitle,
    contentSections: copy.contentSections,
    forTitle: copy.forTitle,
    forItems: copy.forItems,
    relatedLinks: mergeRelatedLinks(
      [copy.standardFinishLink],
      productLoopRelatedLinks(lang),
    ),
    faq: copy.faq,
  };
}

export function createHalfMarathonTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "half-marathon-training-plan",
    routePath: "/half-marathon-training-plan",
    templateSlug: "finish-half-marathon",
    planChooser: createRaceDistancePlanChooser(lang, "half-marathon"),
    howToTotalTime: isHalfMarathonIndexedLocale(lang)
      ? HALF_MARATHON_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createMarathonTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "marathon-training-plan",
    routePath: "/marathon-training-plan",
    templateSlug: "finish-marathon",
    planChooser: createRaceDistancePlanChooser(lang, "marathon"),
    howToTotalTime: isMarathonIndexedLocale(lang)
      ? MARATHON_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createTenKTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "10k-training-plan",
    routePath: "/10k-training-plan",
    templateSlug: "finish-10k",
    planChooser: createRaceDistancePlanChooser(lang, "10k"),
    howToTotalTime: isTenKIndexedLocale(lang)
      ? TEN_K_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createDistanceTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  if (basePlan.slug === "5k-training-plan") {
    return createFiveKTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "10k-training-plan") {
    return createTenKTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "half-marathon-training-plan") {
    return createHalfMarathonTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "marathon-training-plan") {
    return createMarathonTrainingPlan(basePlan, lang);
  }
  return {
    ...basePlan,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
    routePath: `/${basePlan.slug}`,
  };
}

export type RunningPlanPageLabels = {
  home: string;
  plans: string;
  runningPlan: string;
  timeline: string;
  level: string;
  volume: string;
  faqTitleSuffix: string;
  faqSubtitle: string;
  finalTitle: string;
  finalText: string;
  viewFullSchedule: string;
  addToCalendar: string;
};

export type PlanCollectionCopy = {
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
  trustItems?: string[];
  faqTitle?: string;
  faqSubtitle?: string;
  faq?: Array<[string, string]>;
};
