"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  getPlanTemplateRecommendation,
  listPlanTemplates,
  type RunPlanTemplateGoal,
} from "@/api/plan-templates";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { queryKeys } from "@/lib/query-keys";
import { PlanTemplateCoachReminder } from "@/components/plan/plan-template-coach-reminder";

export function PlanTemplateGoalPage({ goal }: { goal: RunPlanTemplateGoal }) {
  const locale = useLocale();
  const t = useTranslations("PlanTemplateDetail");
  const zh = locale.startsWith("zh");
  const templates = useQuery({
    queryKey: queryKeys.plans.templates(goal, locale),
    queryFn: () => listPlanTemplates(goal, locale),
  });
  const recommendation = useQuery({
    queryKey: queryKeys.plans.templateRecommendation(goal),
    queryFn: () => getPlanTemplateRecommendation(goal),
  });
  const recommendedSlug = recommendation.data?.recommendation?.slug;
  const displayGoal = t(`goal.${goal}`);
  const hasPersonalizedPaces =
    recommendation.data?.capability?.state === "AVAILABLE" &&
    recommendation.data.capability.source !== "PUBLIC_EXAMPLE";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/plans/templates">
            <ArrowLeft className="mr-2 size-4" />
            {locale.startsWith("zh")
              ? "返回官方训练"
              : "Back to official training"}
          </Link>
        </Button>
        <div className="mt-5 max-w-3xl">
          <p className="text-sm font-semibold text-emerald-600">
            {t("officialTraining")} · {displayGoal}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
            {zh
              ? `选择适合你的 ${displayGoal} 计划`
              : `Choose the right ${displayGoal} plan for you`}
          </h1>
          <p className="mt-4 text-muted-foreground">
            {goal === "5K"
              ? zh
                ? "三个计划均为冻结的结构化训练计划。预览不使用 AI；AI 教练只读取近期跑步基线，为你标记更合适的起点。"
                : "All three are frozen, structured plans. Previewing never calls AI; the AI coach only reads your recent running baseline to mark the most suitable starting point."
              : zh
                ? "根据你的近期训练频率、训练量和长跑基础，选择适合的完赛、进阶或挑战计划。每个计划都可以先查看完整课表。"
                : "Choose a Finish, Improve or Target plan based on your recent training frequency, volume and long-run base. You can review every workout before starting."}
          </p>
        </div>
      </div>

      {templates.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, item) => (
            <div
              key={item}
              className="h-72 animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : templates.isError ? (
        <div className="rounded-xl bg-destructive/10 p-6 text-sm text-destructive">
          {locale.startsWith("zh")
            ? `${goal} 计划加载失败，请稍后重试。`
            : "Plans could not be loaded. Please try again."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(templates.data?.templates ?? []).map((template) => {
            const recommended = template.slug === recommendedSlug;
            const eligibilityOption = recommendation.data?.options?.find(
              (option) => option.slug === template.slug,
            );
            return (
              <article
                key={template.key}
                className="flex flex-col rounded-xl bg-muted/55 p-6"
              >
                <div className="flex min-h-7 items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {template.periodWeeks}{" "}
                    {locale.startsWith("zh") ? "周" : "weeks"} ·{" "}
                    {template.trainingDaysPerWeek}×
                  </span>
                  {recommended ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <Sparkles className="size-3.5" />
                      {locale.startsWith("zh") ? "为你推荐" : "Recommended"}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-5 text-xl font-black">{template.title}</h2>
                {template.publicExample ? (
                  <p
                    className={`mt-2 text-xs font-semibold ${
                      hasPersonalizedPaces
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {hasPersonalizedPaces
                      ? t("personalizedPaceBadge")
                      : t("examplePaceBadge")}
                  </p>
                ) : null}
                <p className="mt-3 line-clamp-5 text-sm leading-6 text-muted-foreground">
                  {template.description}
                </p>
                <div className="mt-5 flex gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{template.eligibility}</span>
                </div>
                {eligibilityOption?.status !== "ELIGIBLE" ? (
                  <div className="mt-4">
                    <PlanTemplateCoachReminder
                      option={eligibilityOption}
                      variant="compact"
                    />
                  </div>
                ) : null}
                <Button
                  asChild
                  className="mt-6 w-full"
                  variant={recommended ? "default" : "outline"}
                >
                  <Link href={`/plans/templates/${template.slug}`}>
                    {locale.startsWith("zh")
                      ? "查看完整计划"
                      : "View full plan"}
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
