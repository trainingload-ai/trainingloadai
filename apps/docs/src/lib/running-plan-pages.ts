import { getTranslations } from "next-intl/server";
import {
  getRunPlanTemplate,
  normalizePlanTemplateLocale,
} from "@shared/plan-templates";
import { isSeoIndexedLanguage } from "./i18n";
import {
  HALF_MARATHON_PLAN_FACTS,
  MARATHON_PLAN_FACTS,
  TEN_K_PLAN_FACTS,
} from "./running-plan-facts";

const runningPlanSlugs = [
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

function createCouchTo5kPlan(
  localizedPlan: RunningPlan,
  messages: PlanMessages,
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

type FiveKChooserVariant = "couch" | "intermediate";
const racePlans = {
  "10k-training-plan": {
    distance: "10k",
    templateSlug: "finish-10k",
    duration: TEN_K_PLAN_FACTS.howToTotalTime,
  },
  "half-marathon-training-plan": {
    distance: "half-marathon",
    templateSlug: "finish-half-marathon",
    duration: HALF_MARATHON_PLAN_FACTS.howToTotalTime,
  },
  "marathon-training-plan": {
    distance: "marathon",
    templateSlug: "finish-marathon",
    duration: MARATHON_PLAN_FACTS.howToTotalTime,
  },
} as const;

type RacePlanSlug = keyof typeof racePlans;
type RaceDistance = (typeof racePlans)[RacePlanSlug]["distance"];

type PlanMessages = {
  fiveKChooserLabels: { current: string; options: string[] };
  raceDistanceChoosers: Record<
    RaceDistance,
    Omit<NonNullable<RunningPlan["planChooser"]>, "options"> & {
      options: Array<
        Omit<NonNullable<RunningPlan["planChooser"]>["options"][number], "href">
      >;
    }
  >;
  fiveKHubRelatedLink: [string, string, string];
  productLoopRelatedLinks: Array<[string, string, string]>;
  fiveK: Partial<RunningPlan> & Pick<Required<RunningPlan>, "planChooser">;
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
  intermediateFiveK: IntermediateFiveKMessages;
};

function createFiveKPlanChooser(
  messages: PlanMessages,
  current: FiveKChooserVariant,
): NonNullable<RunningPlan["planChooser"]> {
  const source = messages.fiveK.planChooser;
  const labels = messages.fiveKChooserLabels;
  const routes = [
    "/couch-to-5k-training-plan",
    "/5k-training-plan",
    "/5k-training-plan/intermediate",
  ] as const;
  const currentIndex = { couch: 0, intermediate: 2 }[current];

  return {
    ...source,
    options: source.options.map((option, index) => ({
      ...option,
      label: index === currentIndex ? labels.current : labels.options[index],
      href: index === currentIndex ? null : routes[index],
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

function createFiveKTrainingPlan(
  basePlan: RunningPlan,
  lang: string,
  messages: PlanMessages,
): RunningPlan {
  const copy = messages.fiveK;
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

type IntermediateFiveKMessages = {
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

function createIntermediateFiveKPlan(
  basePlan: RunningPlan,
  lang: string,
  messages: PlanMessages,
): RunningPlan {
  const finish = createFiveKTrainingPlan(basePlan, lang, messages);
  const sourceCopy = messages.fiveK;
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

function createRacePlan(
  basePlan: RunningPlan,
  slug: RacePlanSlug,
  locale: string,
  messages: PlanMessages,
): RunningPlan {
  const { distance, templateSlug, duration } = racePlans[slug];
  const routePath = `/${slug}`;
  const chooser = messages.raceDistanceChoosers[distance];
  const hrefs = [null, `${routePath}/improve`, `${routePath}/target`];

  return {
    ...basePlan,
    slug,
    routePath,
    templateSlug,
    planChooser: {
      ...chooser,
      options: chooser.options.map((option, index) => ({
        ...option,
        href: hrefs[index] ?? null,
      })),
    },
    howToTotalTime: isSeoIndexedLanguage(locale)
      ? duration
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      messages.productLoopRelatedLinks,
    ),
  };
}

export async function getRunningPlan(
  slug: RunningPlanSlug,
  locale: string,
): Promise<RunningPlan> {
  const t = await getTranslations({ locale, namespace: "runningPlanPages" });
  const baseSlug =
    slug === "5k-training-plan-intermediate" ? "5k-training-plan" : slug;
  const basePlan = t.raw(`plans.${baseSlug}`) as RunningPlan;
  const messages = t.raw("derived") as PlanMessages;

  switch (slug) {
    case "couch-to-5k-training-plan":
      return createCouchTo5kPlan(basePlan, messages);
    case "5k-training-plan":
      return createFiveKTrainingPlan(basePlan, locale, messages);
    case "5k-training-plan-intermediate":
      return createIntermediateFiveKPlan(basePlan, locale, messages);
    case "10k-training-plan":
    case "half-marathon-training-plan":
    case "marathon-training-plan":
      return createRacePlan(basePlan, slug, locale, messages);
  }
}

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
