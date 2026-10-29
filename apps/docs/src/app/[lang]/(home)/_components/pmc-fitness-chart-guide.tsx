import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  GitCompareArrows,
  Layers3,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PmcMetricGuide = {
  key: "ctl" | "atl" | "tsb" | "acwr";
  acronym: string;
  name: string;
  summary: string;
  formula: string;
  interpretation: string;
  caution: string;
};

export type PmcFitnessChartGuideData = {
  ui: {
    metricsEyebrow: string;
    metricsTitle: string;
    metricsSubtitle: string;
    formulaLabel: string;
    interpretationLabel: string;
    cautionLabel: string;
    docsAction: string;
    patternsEyebrow: string;
    patternsTitle: string;
    patternsSubtitle: string;
    scenarioHeader: string;
    signalsHeader: string;
    meaningHeader: string;
    actionHeader: string;
    advantagesEyebrow: string;
    advantagesTitle: string;
    advantagesSubtitle: string;
    freeBadge: string;
    previewLabel: string;
    previewHint: string;
  };
  metrics: PmcMetricGuide[];
  patterns: Array<[string, string, string, string]>;
  advantages: Array<[string, string]>;
};

const metricDocsPath: Record<PmcMetricGuide["key"], string> = {
  ctl: "chronic-training-load",
  atl: "acute-training-load",
  tsb: "training-stress-balance",
  acwr: "acute-to-chronic-workload-ratio",
};

const metricStyles: Record<
  PmcMetricGuide["key"],
  { accent: string; border: string; soft: string; dot: string }
> = {
  ctl: {
    accent: "text-emerald-700 dark:text-emerald-300",
    border: "border-l-emerald-500",
    soft: "border-emerald-500/20 bg-emerald-500/[0.06]",
    dot: "bg-emerald-500",
  },
  atl: {
    accent: "text-amber-700 dark:text-amber-300",
    border: "border-l-amber-500",
    soft: "border-amber-500/20 bg-amber-500/[0.06]",
    dot: "bg-amber-500",
  },
  tsb: {
    accent: "text-sky-700 dark:text-sky-300",
    border: "border-l-sky-500",
    soft: "border-sky-500/20 bg-sky-500/[0.06]",
    dot: "bg-sky-500",
  },
  acwr: {
    accent: "text-violet-700 dark:text-violet-300",
    border: "border-l-violet-500",
    soft: "border-violet-500/20 bg-violet-500/[0.06]",
    dot: "bg-violet-500",
  },
};

export function PmcFitnessChartGuide({
  prefix,
  data,
}: {
  prefix: string;
  data: PmcFitnessChartGuideData;
}) {
  const { ui } = data;

  return (
    <>
      <section className="border-y border-neutral-200/70 bg-white/70 px-5 py-12 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
              {ui.metricsEyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              {ui.metricsTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {ui.metricsSubtitle}
            </p>
          </div>

          <nav
            aria-label={ui.metricsTitle}
            className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-4"
          >
            {data.metrics.map((metric) => {
              const styles = metricStyles[metric.key];
              return (
                <a
                  key={metric.key}
                  href={`#${metric.key}`}
                  className="group rounded-surface border border-neutral-200 bg-card p-4 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:border-white/10 dark:hover:border-white/20"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", styles.dot)} />
                    <span className={cn("font-black", styles.accent)}>
                      {metric.acronym}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {metric.name}
                  </div>
                </a>
              );
            })}
          </nav>

          <div className="mt-5 space-y-5">
            {data.metrics.map((metric, index) => {
              const styles = metricStyles[metric.key];
              return (
                <article
                  key={metric.key}
                  id={metric.key}
                  className={cn(
                    "scroll-mt-28 rounded-overlay border border-l-4 border-neutral-200 bg-card p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.035] md:p-8",
                    styles.border,
                  )}
                >
                  <div className="grid gap-6 lg:grid-cols-[140px_minmax(0,1fr)] lg:gap-10">
                    <div className="flex items-baseline justify-between lg:block">
                      <div>
                        <div
                          className={cn(
                            "text-4xl font-black tracking-tight",
                            styles.accent,
                          )}
                        >
                          {metric.acronym}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                          {metric.name}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-neutral-400 lg:mt-8">
                        0{index + 1} / 04
                      </div>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">
                        {metric.name}
                      </h3>
                      <p className="mt-3 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
                        {metric.summary}
                      </p>

                      <div className="mt-6 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-surface bg-neutral-950 p-5 text-white dark:bg-black/35">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                            {ui.formulaLabel}
                          </div>
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-200">
                            {metric.formula}
                          </pre>
                        </div>
                        <div
                          className={cn(
                            "rounded-surface border p-5",
                            styles.soft,
                          )}
                        >
                          <div
                            className={cn(
                              "text-xs font-semibold uppercase tracking-[0.16em]",
                              styles.accent,
                            )}
                          >
                            {ui.interpretationLabel}
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                            {metric.interpretation}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-4 border-t border-neutral-200 pt-5 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
                        <p className="max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                          <span className="font-bold text-neutral-900 dark:text-white">
                            {ui.cautionLabel}：
                          </span>
                          {metric.caution}
                        </p>
                        <Link
                          href={`${prefix}/docs/metrics/pmc/${metricDocsPath[metric.key]}`}
                          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                        >
                          {ui.docsAction}
                          <ArrowUpRight aria-hidden="true" className="size-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 md:py-16">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
            <GitCompareArrows aria-hidden="true" className="size-4" />
            {ui.patternsEyebrow}
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            {ui.patternsTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {ui.patternsSubtitle}
          </p>
        </div>

        <div className="mt-8 hidden overflow-x-auto rounded-overlay border border-neutral-200 dark:border-white/10 md:block">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead className="bg-neutral-950 text-white dark:bg-black/40">
              <tr>
                {[
                  ui.scenarioHeader,
                  ui.signalsHeader,
                  ui.meaningHeader,
                  ui.actionHeader,
                ].map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em]"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.patterns.map(([scenario, signals, meaning, action]) => (
                <tr
                  key={scenario}
                  className="border-t border-neutral-200 align-top dark:border-white/10"
                >
                  <th className="w-[17%] bg-neutral-50 px-4 py-4 text-sm font-black dark:bg-white/[0.03]">
                    {scenario}
                  </th>
                  <td className="w-[25%] px-4 py-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {signals}
                  </td>
                  <td className="w-[28%] px-4 py-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {meaning}
                  </td>
                  <td className="w-[30%] px-4 py-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 space-y-3 md:hidden">
          {data.patterns.map(([scenario, signals, meaning, action], index) => (
            <article
              key={scenario}
              className="rounded-overlay border border-neutral-200 bg-card p-5 dark:border-white/10"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-300">
                  0{index + 1}
                </span>
                <h3 className="font-black">{scenario}</h3>
              </div>
              {[
                [ui.signalsHeader, signals],
                [ui.meaningHeader, meaning],
                [ui.actionHeader, action],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="mt-4 border-t border-neutral-200 pt-4 dark:border-white/10"
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                    {label}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {value}
                  </p>
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-neutral-200/70 bg-white/70 px-5 py-12 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
              <Layers3 aria-hidden="true" className="size-4" />
              {ui.advantagesEyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              {ui.advantagesTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {ui.advantagesSubtitle}
            </p>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            {data.advantages.map(([title, text], index) => (
              <article
                key={title}
                className={cn(
                  "rounded-overlay border border-neutral-200 bg-card p-6 dark:border-white/10 dark:bg-white/[0.035] lg:col-span-2",
                  index < 2 && "lg:col-span-3",
                )}
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-300"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black">{title}</h3>
                      {index === 0 ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                          {ui.freeBadge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {text}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
