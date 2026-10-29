"use client";

import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const runningGoals = [
  {
    distance: "5K",
    href: "/plans/templates/5k",
    panelClass: "bg-emerald-600",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    iconClass: "text-emerald-600",
    actionClass: "text-emerald-700 dark:text-emerald-300",
    zh: {
      availability: "当前已开放",
      category: "跑步训练",
      planCount: "3 个官方计划",
      preview: "完整计划可免费预览",
      title: "从第一个 5K 到成绩提升",
      description:
        "根据当前跑步能力，选择零基础入门、完赛或进阶计划。每个计划都包含完整周安排、训练说明和强度指导。",
      tags: ["零基础入门", "完赛计划", "进阶计划"],
      action: "查看 5K 计划",
    },
    en: {
      availability: "AVAILABLE NOW",
      category: "Running training",
      planCount: "3 official plans",
      preview: "Full plans are free to preview",
      title: "From your first 5K to a faster race",
      description:
        "Choose a beginner, confident-finish, or performance plan based on your current running ability. Every plan includes the full weekly schedule, workout notes, and intensity guidance.",
      tags: ["First 5K", "Finish 5K", "Improve 5K"],
      action: "View 5K plans",
    },
  },
  {
    distance: "10K",
    href: "/plans/templates/10k",
    panelClass: "bg-emerald-700",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    iconClass: "text-emerald-600",
    actionClass: "text-emerald-700 dark:text-emerald-300",
    zh: {
      availability: "当前已开放",
      category: "跑步训练",
      planCount: "3 个官方计划",
      preview: "完整结构课表可预览",
      title: "从 5 公里基础到第一个 10 公里",
      description:
        "根据当前能力选择完赛、进阶或目标计划，以轻松跑、质量训练和渐进长跑建立完整的 10 公里能力。",
      tags: ["完赛计划", "进阶计划", "目标计划"],
      action: "查看 10K 计划",
    },
    en: {
      availability: "AVAILABLE NOW",
      category: "Running training",
      planCount: "3 official plans",
      preview: "Full structured schedules available",
      title: "From a 5K base to your first 10K",
      description:
        "Choose a Finish, Improve, or Target plan based on your current ability, building complete 10K fitness through easy running, quality work, and progressive long runs.",
      tags: ["Finish", "Improve", "Target"],
      action: "View 10K plans",
    },
  },
  {
    distance: "21.1K",
    href: "/plans/templates/half-marathon",
    panelClass: "bg-emerald-800",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    iconClass: "text-emerald-600",
    actionClass: "text-emerald-700 dark:text-emerald-300",
    zh: {
      availability: "当前已开放",
      category: "半程马拉松",
      planCount: "3 个官方计划",
      preview: "完整结构课表可预览",
      title: "从 10 公里基础到稳健半马",
      description:
        "面向已有跑步基础的跑者，提供完赛、进阶和目标成绩三条路径，并结合长跑基础与当前有效最大摄氧量给出教练提醒。",
      tags: ["完赛计划", "进阶计划", "目标计划"],
      action: "查看半马计划",
    },
    en: {
      availability: "AVAILABLE NOW",
      category: "Half marathon",
      planCount: "3 official plans",
      preview: "Full structured schedules available",
      title: "From a 10K base to a confident half",
      description:
        "Choose a Finish, Improve, or Target path for runners with an established base, with coach reminders informed by long-run history and effective VO₂max.",
      tags: ["Finish", "Improve", "Target"],
      action: "View half-marathon plans",
    },
  },
  {
    distance: "42.2K",
    href: "/plans/templates/marathon",
    panelClass: "bg-emerald-950",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    iconClass: "text-emerald-600",
    actionClass: "text-emerald-700 dark:text-emerald-300",
    zh: {
      availability: "当前已开放",
      category: "马拉松",
      planCount: "3 个官方计划",
      preview: "完整结构课表可预览",
      title: "从耐久建设到完整马拉松",
      description:
        "通过完赛、进阶和目标成绩三条路径组织耐久、专项长跑与恢复，并根据最长跑和当前有效最大摄氧量提前提示风险。",
      tags: ["完赛计划", "进阶计划", "目标计划"],
      action: "查看全马计划",
    },
    en: {
      availability: "AVAILABLE NOW",
      category: "Marathon",
      planCount: "3 official plans",
      preview: "Full structured schedules available",
      title: "From durable training to the marathon",
      description:
        "Build endurance, marathon-specific long runs, and recovery through Finish, Improve, or Target paths, with early safeguards based on long-run history and effective VO₂max.",
      tags: ["Finish", "Improve", "Target"],
      action: "View marathon plans",
    },
  },
] as const;

function RunningGoalCard({
  goal,
  zh,
}: {
  goal: (typeof runningGoals)[number];
  zh: boolean;
}) {
  const copy = zh ? goal.zh : goal.en;

  return (
    <Link
      href={goal.href}
      className="group block rounded-surface bg-muted/55 p-5 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <article className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">
              {goal.distance}
            </p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {copy.category} · {copy.planCount}
            </p>
          </div>
          <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-1 group-hover:text-foreground" />
        </div>
        <h3 className="mt-5 text-xl font-semibold text-balance">
          {copy.title}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-pretty text-muted-foreground">
          {copy.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {copy.tags.map((label) => (
            <span
              key={label}
              className="rounded-compact bg-background/80 px-2.5 py-1 text-xs font-medium"
            >
              {label}
            </span>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className={`size-3.5 ${goal.iconClass}`} />
            {copy.preview}
          </span>
          <span className={`font-semibold ${goal.actionClass}`}>
            {copy.action}
          </span>
        </div>
      </article>
    </Link>
  );
}

export default function PlanTemplatesPage() {
  const locale = useLocale();
  const t = useTranslations("PlanTemplateDetail");
  const zh = locale.startsWith("zh");

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/plans">
            <ArrowLeft className="mr-2 size-4" />
            {zh ? "返回计划库" : "Back to plans"}
          </Link>
        </Button>
        <div className="mt-5 max-w-3xl">
          <p className="text-sm font-semibold text-emerald-600">
            {t("officialTraining")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {zh ? "选择你的训练目标" : "Choose your training goal"}
          </h1>
          <p className="mt-4 text-muted-foreground">
            {zh
              ? "官方训练按运动项目和距离组织。先选择目标，再查看适合不同能力水平的完整结构化计划。"
              : "Official training is organized by sport and distance. Choose a goal first, then preview complete structured plans for different ability levels."}
          </p>
        </div>
      </div>

      <section aria-labelledby="running-goals-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("running")}
            </p>
            <h2 id="running-goals-heading" className="mt-1 text-2xl font-black">
              {zh ? "跑步训练" : "Running training"}
            </h2>
          </div>
          <span className="text-sm text-muted-foreground">
            {zh
              ? "4 个目标、12 份计划已开放"
              : "4 goals and 12 plans available"}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {runningGoals.map((goal) => (
            <RunningGoalCard key={goal.distance} goal={goal} zh={zh} />
          ))}
        </div>
      </section>
    </main>
  );
}
