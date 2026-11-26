import { getTranslations } from "next-intl/server";
import { getRunningPlanScheduleCopy } from "./RunningPlanSchedule";
import {
  formatNewUserGiftCredits,
  newUserGiftValues,
} from "@/lib/offer-content";
import type {
  RunningPlan,
  RunningPlanPageLabels,
} from "@/lib/running-plan-pages";
import {
  FiveKTrainingPlanPage,
  type DistancePlanPresentationCopy,
  type FiveKPlanValueCopy,
  type FiveKProductCopy,
  type FiveKWorkflowCopy,
} from "@/app/[lang]/(home)/5k-training-plan/_components/FiveKTrainingPlanPage";

/**
 * Shared marketing experience for public distance-plan hubs.
 *
 * The page structure and product story stay consistent across distances, while
 * the training plan, schedule, SEO copy and internal links remain distance
 * specific through `plan`.
 */
export async function DistancePlanExperience({
  lang,
  plan,
  labels,
}: {
  lang: string;
  plan: RunningPlan;
  labels: RunningPlanPageLabels;
}) {
  const [tHome, tSignup, tPlan, scheduleCopy] = await Promise.all([
    getTranslations({ locale: lang, namespace: "home" }),
    getTranslations({
      locale: lang,
      namespace: "freeAiWorkoutReview.signup",
    }),
    getTranslations({ locale: lang, namespace: "runningPlanPages" }),
    getRunningPlanScheduleCopy(lang),
  ]);
  const gift = newUserGiftValues(process.env);

  return (
    <FiveKTrainingPlanPage
      lang={lang}
      plan={plan}
      labels={labels}
      product={tHome.raw("pageModules") as FiveKProductCopy}
      planValue={tHome.raw("planSpotlight") as FiveKPlanValueCopy}
      workflow={tHome.raw("trainingLoop") as FiveKWorkflowCopy}
      presentation={{
        sectionKickers: tPlan.raw("sectionKickers") as DistancePlanPresentationCopy["sectionKickers"],
        heroHeadings: tPlan.raw("heroHeadings") as DistancePlanPresentationCopy["heroHeadings"],
        productPreview: tPlan.raw("productPreview") as DistancePlanPresentationCopy["productPreview"],
      }}
      scheduleCopy={scheduleCopy}
      signup={{
        kicker: tSignup("kicker"),
        title: tSignup("title", { days: gift.accessDays }),
        description: tSignup("description", {
          days: gift.accessDays,
          credits: formatNewUserGiftCredits(gift.bonusCredits, lang),
        }),
        cta: tSignup("cta"),
      }}
    />
  );
}
