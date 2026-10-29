"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, Gauge, Zap } from "lucide-react";

type HeroTool = {
  key: string;
  title: string;
  description: string;
  href: string;
  signal: string;
  bestFor: string;
  output: string;
};

type ToolsHeroSwitcherProps = {
  tools: HeroTool[];
  labels: {
    featured: string;
    bestFor: string;
    output: string;
    openTool: string;
  };
};

const iconMap = {
  vdotCalculator: Gauge,
  vo2MaxCalculator: Activity,
  estimateCp: Zap,
};

const INTERVAL_MS = 5_000;

export function ToolsHeroSwitcher({ tools, labels }: ToolsHeroSwitcherProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeTool = tools[activeIndex] ?? tools[0];

  useEffect(() => {
    if (tools.length <= 1) return;

    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % tools.length);
    }, INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [activeIndex, tools.length]);

  if (!activeTool) return null;

  const Icon = iconMap[activeTool.key as keyof typeof iconMap] ?? Gauge;

  return (
    <div className="relative z-10 sm:h-[508px]">
      <style>
        {`
          @keyframes tools-hero-progress {
            from { transform: scaleX(0); }
            to { transform: scaleX(1); }
          }
        `}
      </style>

      <div className="mb-3 flex flex-wrap items-center gap-2 sm:h-9 sm:flex-nowrap">
        {tools.map((tool, index) => {
          const ToolIcon = iconMap[tool.key as keyof typeof iconMap] ?? Gauge;
          const active = index === activeIndex;
          return (
            <button
              key={tool.key}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`relative inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-compact border px-3 text-xs font-semibold shadow-sm backdrop-blur transition-colors ${
                active
                  ? "border-emerald-500/30 bg-emerald-500/90 text-white dark:bg-emerald-500/95 dark:text-neutral-950"
                  : "border-neutral-200/70 bg-white/75 text-neutral-600 hover:bg-white dark:border-white/10 dark:bg-card/70 dark:text-neutral-300 dark:hover:bg-accent"
              }`}
            >
              <ToolIcon className="size-3.5" />
              {tool.signal}
              {active ? (
                <span
                  key={`${tool.key}-${activeIndex}`}
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/80 dark:bg-card/70"
                  style={{
                    animation: `tools-hero-progress ${INTERVAL_MS}ms linear forwards`,
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="relative flex min-h-[460px] flex-col overflow-hidden rounded-compact border border-neutral-900/10 bg-white/85 p-6 shadow-2xl shadow-neutral-900/10 backdrop-blur dark:border-white/10 dark:bg-card/70 dark:shadow-black/40 sm:h-[460px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-4 right-6 text-7xl font-black leading-none tracking-[-0.08em] text-neutral-900/[0.035] dark:text-white/[0.04]"
        >
          TOOLS
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="grid size-12 place-items-center rounded-compact border border-neutral-200 bg-white text-emerald-700 dark:border-white/10 dark:bg-card/70 dark:text-emerald-300">
              <Icon className="size-6" />
            </div>
            <Link
              href={activeTool.href}
              className="text-neutral-400 transition-transform hover:translate-x-0.5 hover:text-emerald-700 dark:hover:text-emerald-300"
              aria-label={activeTool.title}
            >
              <ArrowRight className="size-5" />
            </Link>
          </div>
          <div className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">
            {labels.featured}
          </div>
          <h2 className="mt-2 min-h-[4rem] text-2xl font-black tracking-tight text-neutral-950 dark:text-white">
            {activeTool.title}
          </h2>
          <p className="mt-3 min-h-[5.25rem] text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            {activeTool.description}
          </p>
          <div className="mt-6 grid min-h-[6rem] gap-3 rounded-compact border border-neutral-200 bg-card p-4 text-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div>
              <span className="font-semibold text-neutral-500 dark:text-neutral-400">
                {labels.bestFor}:{" "}
              </span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {activeTool.bestFor}
              </span>
            </div>
            <div>
              <span className="font-semibold text-neutral-500 dark:text-neutral-400">
                {labels.output}:{" "}
              </span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {activeTool.output}
              </span>
            </div>
          </div>
          <Link
            href={activeTool.href}
            className="mt-auto inline-flex w-fit items-center gap-1 rounded-compact border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-800 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/15 dark:text-emerald-200"
          >
            {labels.openTool}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
