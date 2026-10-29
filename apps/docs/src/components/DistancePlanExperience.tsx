import { getTranslations } from "next-intl/server";
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
  const [tHome, tSignup] = await Promise.all([
    getTranslations({ locale: lang, namespace: "home" }),
    getTranslations({
      locale: lang,
      namespace: "freeAiWorkoutReview.signup",
    }),
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
