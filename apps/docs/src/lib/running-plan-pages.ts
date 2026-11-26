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
  messages: RunningPlanCopy,
): RunningPlan {
  const loopLinks = messages.productLoopRelatedLinks.filter(
    ([, href]) => href !== "/vdot-calculator",
  );
  return {
    ...localizedPlan,
    slug: "couch-to-5k-training-plan",
    routePath: "/couch-to-5k-training-plan",
    templateSlug: "first-5k",
    planChooser: createFiveKPlanChooser(messages, "couch"),
    relatedLinks: mergeRelatedLinks(
      mergeRelatedLinks(
        localizedPlan.relatedLinks,
        [messages.fiveKHubRelatedLink],
      ),
      loopLinks,
    ),
  };
}

type FiveKChooserVariant = "couch" | "finish" | "intermediate";
type RaceDistance = "10k" | "half-marathon" | "marathon";

export type RunningPlanCopy = {
  fiveKChooserLabels: { current: string; options: string[] };
  raceDistanceChooserCopy: Record<
    RaceDistance,
    Omit<NonNullable<RunningPlan["planChooser"]>, "options"> & {
      options: Array<Omit<NonNullable<RunningPlan["planChooser"]>["options"][number], "href">>;
    }
  >;
  fiveKHubRelatedLink: [string, string, string];
  productLoopRelatedLinks: Array<[string, string, string]>;
  fiveKCopy: Partial<RunningPlan> & Pick<Required<RunningPlan>, "planChooser">;
  finishFiveKDetails: Pick<
    RunningPlan,
    | "previewTitle"
    | "previewSubtitle"
    | "previewRows"
    | "contentTitle"
    | "contentSubtitle"
    | "contentSections"
  >;
  templateMetaDescription: string;
  intermediateLink: [string, string, string];
  intermediateFiveK: IntermediateFiveKLocaleCopy;
};

function createFiveKPlanChooser(
  messages: RunningPlanCopy,
  current: FiveKChooserVariant,
): NonNullable<RunningPlan["planChooser"]> {
  const source = messages.fiveKCopy.planChooser;
  const labels = messages.fiveKChooserLabels;
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

function createRaceDistancePlanChooser(
  messages: RunningPlanCopy,
  distance: RaceDistance,
): NonNullable<RunningPlan["planChooser"]> {
  const copy = messages.raceDistanceChooserCopy[distance];
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

export function createFiveKTrainingPlan(
  basePlan: RunningPlan,
  lang: string,
  messages: RunningPlanCopy,
): RunningPlan {
  const copy = messages.fiveKCopy;
  const templateLocale = normalizePlanTemplateLocale(lang);
  const localized = getRunPlanTemplate("finish-5k")!.copy[templateLocale];
  const existingRelatedLinks = copy.relatedLinks ?? basePlan.relatedLinks ?? [];
  const [firstRelated, ...restRelated] = existingRelatedLinks;
  return {
    ...basePlan,
    ...copy,
    slug: "5k-training-plan",
    routePath: "/5k-training-plan",
    templateSlug: "finish-5k",
    title: copy.title ?? basePlan.title,
    subtitle: copy.subtitle ?? localized.description,
    promise: copy.promise ?? localized.promise,
    ...messages.finishFiveKDetails,
    metaDescription: messages.templateMetaDescription,
    relatedLinks: mergeRelatedLinks(
      [
        ...(firstRelated ? [firstRelated] : []),
        messages.intermediateLink,
        ...restRelated,
      ],
      messages.productLoopRelatedLinks,
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

export function createIntermediateFiveKPlan(
  basePlan: RunningPlan,
  lang: string,
  messages: RunningPlanCopy,
): RunningPlan {
  const finish = createFiveKTrainingPlan(basePlan, lang, messages);
  const sourceCopy = messages.fiveKCopy;
  const localized =
    getRunPlanTemplate("improve-5k")!.copy[normalizePlanTemplateLocale(lang)];
  const copy = messages.intermediateFiveK;
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
    planChooser: createFiveKPlanChooser(messages, "intermediate"),
    contentTitle: copy.contentTitle,
    contentSubtitle: copy.contentSubtitle,
    contentSections: copy.contentSections,
    forTitle: copy.forTitle,
    forItems: copy.forItems,
    relatedLinks: mergeRelatedLinks(
      [copy.standardFinishLink],
      messages.productLoopRelatedLinks,
    ),
    faq: copy.faq,
  };
}

export function createHalfMarathonTrainingPlan(
  basePlan: RunningPlan,
  lang: string,
  messages: RunningPlanCopy,
): RunningPlan {
  return {
    ...basePlan,
    slug: "half-marathon-training-plan",
    routePath: "/half-marathon-training-plan",
    templateSlug: "finish-half-marathon",
    planChooser: createRaceDistancePlanChooser(messages, "half-marathon"),
    howToTotalTime: isHalfMarathonIndexedLocale(lang)
      ? HALF_MARATHON_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      messages.productLoopRelatedLinks,
    ),
  };
}

export function createMarathonTrainingPlan(
  basePlan: RunningPlan,
  lang: string,
  messages: RunningPlanCopy,
): RunningPlan {
  return {
    ...basePlan,
    slug: "marathon-training-plan",
    routePath: "/marathon-training-plan",
    templateSlug: "finish-marathon",
    planChooser: createRaceDistancePlanChooser(messages, "marathon"),
    howToTotalTime: isMarathonIndexedLocale(lang)
      ? MARATHON_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      messages.productLoopRelatedLinks,
    ),
  };
}

export function createTenKTrainingPlan(
  basePlan: RunningPlan,
  lang: string,
  messages: RunningPlanCopy,
): RunningPlan {
  return {
    ...basePlan,
    slug: "10k-training-plan",
    routePath: "/10k-training-plan",
    templateSlug: "finish-10k",
    planChooser: createRaceDistancePlanChooser(messages, "10k"),
    howToTotalTime: isTenKIndexedLocale(lang)
      ? TEN_K_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      messages.productLoopRelatedLinks,
    ),
  };
}

export function createDistanceTrainingPlan(
  basePlan: RunningPlan,
  lang: string,
  messages: RunningPlanCopy,
): RunningPlan {
  if (basePlan.slug === "5k-training-plan") {
    return createFiveKTrainingPlan(basePlan, lang, messages);
  }
  if (basePlan.slug === "10k-training-plan") {
    return createTenKTrainingPlan(basePlan, lang, messages);
  }
  if (basePlan.slug === "half-marathon-training-plan") {
    return createHalfMarathonTrainingPlan(basePlan, lang, messages);
  }
  if (basePlan.slug === "marathon-training-plan") {
    return createMarathonTrainingPlan(basePlan, lang, messages);
  }
  return {
    ...basePlan,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      messages.productLoopRelatedLinks,
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
