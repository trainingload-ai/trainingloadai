"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import {
  createPlanTemplatePreview,
  getPlanTemplate,
  instantiatePlanTemplate,
  getPlanTemplateRecommendation,
  type PlanTemplatePreview,
} from "@/api/plan-templates";
import type { ParsedPlan } from "@/api/workout";
import { getCompetitionEvents } from "@/api/competition-events";
import { featureAllowed, useFeatureAccess } from "@/api/feature-access";
import { Button } from "@/components/ui/button";
import { ManagedPlanCoachAccessPrompt } from "@deployment/managed-ui";
import { CalendarSelect } from "@/components/calendar-select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WeekdayMultiSelect } from "@/components/plan/weekday-multi-select";
import { Link, useRouter } from "@/i18n/navigation";
import { queryKeys } from "@/lib/query-keys";
import {
  PlanTemplateCoachReminder,
  planTemplateBlocksBuild,
} from "@/components/plan/plan-template-coach-reminder";
import { workoutDefinitionStepLines } from "@shared/plan-templates/workout-step-display";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

const PlanTemplateWorkoutChart = dynamic(
  () =>
    import("@/components/workout/WorkoutPlanChart").then(
      (module) => module.WorkoutPlanChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[84px] animate-pulse rounded-xs bg-muted" />
    ),
  },
);

const NO_TARGET_RACE = "none";

const weekdayLabels = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
} as const;

function isoWeekday(date: string) {
  const weekday = dayjs(date).day();
  return weekday === 0 ? 7 : weekday;
}

function WorkoutStepList({
  definition,
  locale,
}: {
  definition: PlanTemplatePreview["template"]["weeks"][number]["workouts"][number]["definition"];
  locale: string;
}) {
  const lines = workoutDefinitionStepLines(definition, locale);
  if (lines.length === 0) return null;
  const plan =
    definition.source === "STRUCTURE" &&
    definition.structure.kind === "ENDURANCE"
      ? (definition.structure.blocks as ParsedPlan)
      : null;
  return (
    <div
      className={`mt-3 rounded-lg bg-background/55 p-3 ${plan ? "md:grid md:grid-cols-[minmax(0,1fr)_10rem] md:items-center md:gap-4" : ""}`}
    >
      <ol className="space-y-2">
        {lines.map((line, index) => (
          <li
            key={`${line}-${index}`}
            className="flex gap-2.5 text-sm font-medium leading-5 text-foreground/85"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
              {index + 1}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
      {plan ? (
        <figure
          aria-label={locale.startsWith("zh") ? "训练结构图" : "Workout chart"}
          className="hidden min-h-24 overflow-hidden rounded-md bg-muted/35 p-1.5 md:block"
        >
          <PlanTemplateWorkoutChart
            plan={plan}
            sportType="RUN"
            height={84}
            hideAxes
            compact
          />
        </figure>
      ) : null}
    </div>
  );
}

export default function PlanTemplateDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const locale = useLocale();
  const coachReminderT = useTranslations("PlanTemplateCoachReminder");
  const detailT = useTranslations("PlanTemplateDetail");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const zh = locale.startsWith("zh");
  const router = useRouter();
  const queryClient = useQueryClient();
  const featureAccess = useFeatureAccess();
  const [startDate, setStartDate] = useState(() =>
    dayjs().add(1, "week").startOf("week").add(1, "day").format("YYYY-MM-DD"),
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(() =>
    slug === "first-5k" || slug === "finish-10k" ? [2, 4, 7] : [2, 4, 6, 7],
  );
  const [variantId, setVariantId] = useState<string | undefined>();
  const [targetRaceEventId, setTargetRaceEventId] = useState("");

  const detail = useQuery({
    queryKey: queryKeys.plans.template(slug, locale, variantId),
    queryFn: () => getPlanTemplate(slug, locale, variantId),
  });
  const template = detail.data?.template;
  const recommendation = useQuery({
    queryKey: queryKeys.plans.templateRecommendation(template?.goal ?? "5K"),
    queryFn: () => getPlanTemplateRecommendation(template!.goal),
    enabled: Boolean(template),
  });
  const capability = detail.data?.capability ?? recommendation.data?.capability;
  const races = useQuery({
    queryKey: ["plan-template-target-races", template?.goal],
    queryFn: () =>
      getCompetitionEvents(
        dayjs().format("YYYY-MM-DD"),
        dayjs().add(3, "year").format("YYYY-MM-DD"),
        "PLANNED",
      ),
    enabled: template?.outcome === "TARGET",
  });
  const requiredDays = template?.trainingDaysPerWeek ?? 3;
  const effectiveDays = selectedDays;
  const targetRace = (races.data ?? []).find(
    (event) => event.id === targetRaceEventId,
  );
  const targetRaceWeekday = targetRace
    ? isoWeekday(targetRace.startDate)
    : undefined;
  const eligibilityOption = recommendation.data?.options?.find(
    (option) => option.slug === template?.slug,
  );
  const eligibilityBlocksBuild = planTemplateBlocksBuild(eligibilityOption);

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const nextPreview = await createPlanTemplatePreview(slug, {
        startDate,
        preferredWeekdays: effectiveDays,
        locale,
        variantId,
        longRunWeekday:
          template?.outcome === "TARGET"
            ? (targetRaceWeekday ?? Math.max(...effectiveDays))
            : Math.max(...effectiveDays),
        targetRaceEventId: targetRaceEventId || undefined,
      });
      if (!nextPreview) throw new Error("PLAN_TEMPLATE_PREVIEW_UNAVAILABLE");
      return instantiatePlanTemplate(slug, nextPreview.previewToken);
    },
    onSuccess: async (value) => {
      if (!value?.plan.id) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() }),
      ]);
      router.push(`/plans/${value.plan.id}`);
    },
  });

  if (detail.isError)
    return (
      <div className="mx-auto max-w-5xl rounded-xl bg-destructive/10 p-8 text-destructive">
        {zh ? "模板不存在或加载失败。" : "This template is unavailable."}
      </div>
    );
  if (detail.isLoading || !template)
    return (
      <div className="mx-auto h-96 max-w-5xl animate-pulse rounded-xl bg-muted" />
    );

  const hasAiCoach = featureAllowed(featureAccess.data, "ai.coach");
  const labels = zh ? weekdayLabels.zh : weekdayLabels.en;
  const displayGoal = detailT(`goal.${template.goal}`);
  const coachStageIcons = {
    TRACK: ClipboardCheck,
    ASSESS: HeartPulse,
    ADJUST: SlidersHorizontal,
  } as const;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 pb-14">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link
          href={`/plans/templates/${template.goal === "HALF_MARATHON" ? "half-marathon" : template.goal.toLowerCase()}`}
        >
          <ArrowLeft className="mr-2 size-4" />
          {detailT("backToGoal", { goal: displayGoal })}
        </Link>
      </Button>
      <section className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <p className="text-sm font-bold text-emerald-600">
            {template.periodWeeks} {zh ? "周" : "weeks"} ·{" "}
            {template.trainingDaysPerWeek}× / {zh ? "周" : "week"}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
            {template.title}
          </h1>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            {template.description}
          </p>
          {template.publicExample ? (
            <p
              className={`mt-3 rounded-lg px-4 py-3 text-sm font-semibold ${
                capability?.state === "AVAILABLE" && capability.vdot
                  ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
              }`}
            >
              {capability?.state === "AVAILABLE" && capability.vdot
                ? coachReminderT("personalizedPaces", {
                    value: new Intl.NumberFormat(locale, {
                      maximumFractionDigits: 1,
                    }).format(capability.vdot),
                  })
                : coachReminderT("rpeFallback")}
            </p>
          ) : null}
          <div className="mt-5 flex items-center gap-2.5 rounded-lg bg-muted/60 p-4 text-sm leading-5">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            <span className="min-w-0">{template.eligibility}</span>
          </div>
          {eligibilityOption?.status !== "ELIGIBLE" ? (
            <div className="mt-4">
              <PlanTemplateCoachReminder option={eligibilityOption} />
            </div>
          ) : null}
        </div>
        <aside>
          <Card className="rounded-xl border-0 bg-muted/55 shadow-none">
            <CardHeader className="p-5 pb-0">
              <h2 className="font-bold">
                {zh ? "安排到你的日历" : "Fit it to your calendar"}
              </h2>
            </CardHeader>
            <CardContent className="p-5 pt-4">
              <Label htmlFor="plan-template-start-date">
                {zh ? "计划周开始日期" : "Plan-week start date"}
              </Label>
              <CalendarSelect
                id="plan-template-start-date"
                className="mt-2 max-w-none"
                date={startDate ? dayjs(startDate).toDate() : undefined}
                dateLabel={startDate}
                placeholder={zh ? "选择开始日期" : "Choose a start date"}
                title={zh ? "计划周开始日期" : "Plan-week start date"}
                onSelect={(date) => {
                  if (!date) return;
                  setStartDate(dayjs(date).format("YYYY-MM-DD"));
                  createDraftMutation.reset();
                }}
              />
              {template.outcome === "TARGET" ? (
                <div className="mt-4">
                  <Label htmlFor="target-race-event">
                    {zh ? "目标赛事（可选）" : "Goal race (optional)"}
                  </Label>
                  <Select
                    value={targetRaceEventId || NO_TARGET_RACE}
                    onValueChange={(value) => {
                      setTargetRaceEventId(
                        value === NO_TARGET_RACE ? "" : value,
                      );
                      createDraftMutation.reset();
                    }}
                  >
                    <SelectTrigger id="target-race-event" className="mt-2">
                      <SelectValue
                        placeholder={
                          zh
                            ? "选择已保存的目标赛事"
                            : "Choose a saved goal race"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TARGET_RACE}>
                        {zh ? "不关联赛事" : "No linked race"}
                      </SelectItem>
                      {(races.data ?? [])
                        .filter(
                          (event) =>
                            event.sportType === "RUN" &&
                            event.goalType === "TARGET_TIME",
                        )
                        .map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.title} · {event.startDate}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {zh
                      ? "不关联赛事时，计划会按开始日期排期，并根据当前最大摄氧量设置训练强度。"
                      : "Without a linked race, the plan follows your start date and uses current VO₂max for training intensity."}
                  </p>
                  {targetRaceWeekday &&
                  !effectiveDays.includes(targetRaceWeekday) ? (
                    <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                      {zh
                        ? `比赛在${weekdayLabels.zh[targetRaceWeekday - 1]}，请把这一天选为训练日。`
                        : `The race is on ${weekdayLabels.en[targetRaceWeekday - 1]}; include that day as a training day.`}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {template.availableVariants.length > 1 ? (
                <div className="mt-4">
                  <Label htmlFor="plan-template-variant">
                    {zh ? "计划长度" : "Plan length"}
                  </Label>
                  <Select
                    value={variantId ?? template.variantId}
                    onValueChange={(value) => {
                      setVariantId(value);
                      createDraftMutation.reset();
                    }}
                  >
                    <SelectTrigger
                      id="plan-template-variant"
                      size="default"
                      className="mt-2"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {template.availableVariants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.periodWeeks} {zh ? "周" : "weeks"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <Label className="mt-4">
                {zh
                  ? `每周选择 ${requiredDays} 天`
                  : `Choose ${requiredDays} days each week`}
              </Label>
              <div className="mt-2">
                <WeekdayMultiSelect
                  options={labels.map((label, index) => ({
                    value: index + 1,
                    label,
                  }))}
                  value={effectiveDays}
                  maxSelected={requiredDays}
                  ariaLabel={
                    zh ? "选择每周训练日" : "Choose weekly training days"
                  }
                  placeholder={zh ? "请选择训练日" : "Choose training days"}
                  separator={zh ? "、" : ", "}
                  selectionLabel={(selected, required) =>
                    zh
                      ? `已选择 ${selected}/${required} 天`
                      : `${selected}/${required} days selected`
                  }
                  onValueChange={(values) => {
                    setSelectedDays(values);
                    createDraftMutation.reset();
                  }}
                />
              </div>
              <Button
                className="mt-5 w-full"
                disabled={
                  publicDemo.active ||
                  createDraftMutation.isPending ||
                  eligibilityBlocksBuild ||
                  effectiveDays.length !== requiredDays ||
                  !startDate ||
                  (template.outcome === "TARGET" &&
                    Boolean(targetRaceEventId) &&
                    (!targetRaceWeekday ||
                      !effectiveDays.includes(targetRaceWeekday)))
                }
                title={
                  publicDemo.active ? demoText("readOnlyAction") : undefined
                }
                onClick={() => createDraftMutation.mutate()}
              >
                <ClipboardCheck className="mr-2 size-4" />
                {createDraftMutation.isPending
                  ? detailT("creatingDraft")
                  : detailT("createDraft")}
              </Button>
              {createDraftMutation.isError ? (
                <p className="mt-2 text-sm text-destructive">
                  {detailT("createDraftFailed")}
                </p>
              ) : null}
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {zh
                  ? "官方计划对所有账户免费；创建过程不调用 AI，也不消耗 AI token。"
                  : "Official plans are free for every account. Creating one never calls AI or consumes AI tokens."}
              </p>
            </CardContent>
          </Card>
        </aside>
      </section>

      <section className="rounded-xl bg-gradient-to-br from-emerald-500/[0.10] via-muted/55 to-muted/40 p-6 md:p-8">
        <div className="flex gap-3">
          <ShieldCheck
            aria-hidden="true"
            className="mt-1 size-6 shrink-0 text-emerald-600"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-balance text-2xl font-black">
              {template.coachFlow.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {template.coachFlow.summary}
            </p>
            <div className="mt-3 rounded-lg bg-emerald-500/[0.08] px-4 py-3 text-sm leading-6 text-muted-foreground">
              <p>
                {featureAccess.isLoading
                  ? detailT("checkingAccess")
                  : hasAiCoach
                    ? detailT("memberCoachSummary")
                    : null}
              </p>
              {!featureAccess.isLoading && !hasAiCoach ? (
                <ManagedPlanCoachAccessPrompt />
              ) : null}
            </div>
          </div>
        </div>
        <ol className="mt-6 grid gap-3 lg:grid-cols-3">
          {template.coachFlow.stages.map((stage) => {
            const StageIcon = coachStageIcons[stage.id];
            return (
              <li key={stage.id} className="rounded-xl bg-background/65 p-5">
                <StageIcon
                  aria-hidden="true"
                  className="size-5 text-emerald-600"
                />
                <h3 className="mt-3 font-bold">{stage.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {stage.description}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2 className="text-2xl font-black">
          {zh ? "完整每周训练" : "Complete weekly schedule"}
        </h2>
        <Accordion
          type="multiple"
          defaultValue={["week-1"]}
          className="mt-5 space-y-3"
        >
          {template.weeks.map((week) => (
            <AccordionItem
              key={week.weekIndex}
              value={`week-${week.weekIndex}`}
              className="rounded-xl border-0 bg-muted/55"
            >
              <AccordionTrigger className="gap-4 rounded-xl p-5 font-bold hover:bg-muted/35 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="min-w-0 flex-1">
                  {week.title}
                  <span className="ml-3 text-sm font-normal text-muted-foreground">
                    {week.description}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="grid gap-3 px-5 pb-5 md:grid-cols-2">
                {week.workouts.map((workout) => (
                  <article
                    key={workout.semanticId}
                    className="rounded-lg bg-muted/45 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-bold">{workout.name}</h3>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5 text-xs font-semibold">
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                          {workout.intensityGuidance.rpe.display}
                        </span>
                        {workout.intensityGuidance.pace ? (
                          <span className="rounded-full bg-sky-500/10 px-2 py-1 text-sky-700 dark:text-sky-300">
                            {workout.intensityGuidance.pace.display}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {workout.notes}
                    </p>
                    <WorkoutStepList
                      definition={workout.definition}
                      locale={locale}
                    />
                    <div className="mt-3 rounded-lg bg-background/45 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                      <p>{workout.intensityGuidance.talkTest}</p>
                      <p className="mt-1">
                        {workout.intensityGuidance.summary}
                      </p>
                    </div>
                  </article>
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </main>
  );
}
