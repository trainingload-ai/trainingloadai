import en from "../../../../packages/messages/running-plan-intents/en.json";
import zh from "../../../../packages/messages/running-plan-intents/zh.json";
import zhHant from "../../../../packages/messages/running-plan-intents/zh-hant.json";
import ja from "../../../../packages/messages/running-plan-intents/ja.json";

export const BRIDGE_PLAN_PATHS = [
  "/5k-to-10k-training-plan",
  "/couch-to-10k-training-plan",
] as const;
export type BridgePlanSlug =
  | "5k-to-10k-training-plan"
  | "couch-to-10k-training-plan";
export type PlanIntentSlug = keyof typeof en.guides;

type GuideItem = { title: string; text: string; href: string; link: string };
export type PlanIntentGuideCopy = {
  title: string;
  intro: string;
  items: GuideItem[];
  faq: string[][];
};
export type BridgePlanCopy = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  heading: string[];
  intro: string;
  facts: string[][];
  readinessTitle: string;
  readiness: string[];
  stages: { title: string; text: string }[];
  faq: string[][];
};
type IntentContent = {
  labels: typeof en.labels;
  guides: Record<PlanIntentSlug, PlanIntentGuideCopy>;
  bridges: Record<BridgePlanSlug, BridgePlanCopy>;
};

const content: Record<string, IntentContent> = {
  en,
  zh,
  "zh-hant": zhHant,
  ja,
};

export function runningPlanIntentContent(lang: string): IntentContent {
  return content[lang] ?? content.en;
}

export function getPlanIntentGuide(slug: string, lang: string) {
  const guides = runningPlanIntentContent(lang).guides;
  return Object.hasOwn(guides, slug) ? guides[slug as PlanIntentSlug] : null;
}

/** Race averages only. Workout intensity continues to come from the real template. */
const GOAL_PACES: Record<string, { distanceKm: number; minutes: number[] }> = {
  "target-10k": { distanceKm: 10, minutes: [40, 45, 50] },
  "target-half-marathon": { distanceKm: 21.0975, minutes: [120] },
  "target-marathon": { distanceKm: 42.195, minutes: [180, 240] },
};

export function goalPaceRows(slug: string) {
  const goal = GOAL_PACES[slug];
  if (!goal) return [];
  const formatPace = (seconds: number) => {
    const rounded = Math.round(seconds);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
  };
  return goal.minutes.map((minutes) => ({
    time: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:00`,
    perKm: formatPace((minutes * 60) / goal.distanceKm),
    perMile: formatPace((minutes * 60 * 1.609344) / goal.distanceKm),
  }));
}
