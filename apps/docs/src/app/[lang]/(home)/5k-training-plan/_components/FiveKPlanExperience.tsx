import { DistancePlanExperience } from "@/components/DistancePlanExperience";
import type {
  RunningPlan,
  RunningPlanPageLabels,
} from "@/lib/running-plan-pages";

export async function FiveKPlanExperience({
  lang,
  plan,
  labels,
}: {
  lang: string;
  plan: RunningPlan;
  labels: RunningPlanPageLabels;
}) {
  return <DistancePlanExperience lang={lang} plan={plan} labels={labels} />;
}
