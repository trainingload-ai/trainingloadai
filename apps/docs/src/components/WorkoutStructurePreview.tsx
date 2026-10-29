import type {
  EndurancePlanBlock,
  EnduranceWorkRestStep,
} from "@shared/endurance-workout-ir";
import type { WorkoutStructure } from "@shared/workout-structure";
import { enduranceStructureToChartSegments } from "@/lib/plan-share-chart";

type PreviewLocale = "en" | "zh" | "zh-hant" | "ja";
type PreviewStepKind = NonNullable<EnduranceWorkRestStep["stepKind"]>;

const STEP_COPY: Record<PreviewLocale, Record<PreviewStepKind, string>> = {
  en: {
    WARMUP: "Warm-up",
    WORK: "Work",
    RECOVERY: "Recovery",
    REST: "Rest",
    COOLDOWN: "Cool-down",
    OTHER: "Step",
  },
  zh: {
    WARMUP: "热身",
    WORK: "主训练",
    RECOVERY: "恢复",
    REST: "休息",
    COOLDOWN: "放松",
    OTHER: "训练",
  },
  "zh-hant": {
    WARMUP: "熱身",
    WORK: "主訓練",
    RECOVERY: "恢復",
    REST: "休息",
    COOLDOWN: "放鬆",
    OTHER: "訓練",
  },
  ja: {
    WARMUP: "ウォームアップ",
    WORK: "メイン",
    RECOVERY: "リカバリー",
    REST: "休息",
    COOLDOWN: "クールダウン",
    OTHER: "ステップ",
  },
};

const STEP_TONE: Record<PreviewStepKind, { chip: string; color: string }> = {
  WARMUP: {
    chip: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100",
    color: "#60a5fa",
  },
  WORK: {
    chip: "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-300/20 dark:bg-indigo-300/10 dark:text-indigo-100",
    color: "#6366f1",
  },
  RECOVERY: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100",
    color: "#6ee7b7",
  },
  REST: {
    chip: "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300",
    color: "#94a3b8",
  },
  COOLDOWN: {
    chip: "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-100",
    color: "#06b6d4",
  },
  OTHER: {
    chip: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-300/20 dark:bg-violet-300/10 dark:text-violet-100",
    color: "#8b5cf6",
  },
};

function previewLocale(lang: string): PreviewLocale {
  if (lang.toLowerCase().startsWith("zh-hant")) return "zh-hant";
  if (lang.toLowerCase().startsWith("zh")) return "zh";
  if (lang.toLowerCase().startsWith("ja")) return "ja";
  return "en";
}

function durationLabel(step: EnduranceWorkRestStep) {
  const meta = step.durationMeta;
  if (meta?.kind === "DISTANCE") {
    const value = Number(meta.value);
    if (meta.unit === "KILOMETERS") return `${value}km`;
    if (meta.unit === "METERS") return `${value}m`;
  }
  const seconds = Number(
    meta?.kind === "TIME" ? meta.value : (step.duration ?? 0),
  );
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function StepChip({
  step,
  locale,
}: {
  step: EnduranceWorkRestStep;
  locale: PreviewLocale;
}) {
  const stepKind = step.stepKind ?? "OTHER";
  const tone = STEP_TONE[stepKind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-compact border px-2 py-1 text-[11px] font-bold ${tone.chip}`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: tone.color }}
      />
      {STEP_COPY[locale][stepKind]}
      <span className="font-black tabular-nums">{durationLabel(step)}</span>
    </span>
  );
}

function StructureBlock({
  block,
  locale,
}: {
  block: EndurancePlanBlock;
  locale: PreviewLocale;
}) {
  if (block.type === "repeat") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 rounded-control border border-dashed border-neutral-300 bg-white/70 p-1 dark:border-white/15 dark:bg-white/5">
        <span className="px-1 text-[11px] font-black tabular-nums text-neutral-600 dark:text-neutral-300">
          ×{block.count}
        </span>
        {block.children.flatMap((child, childIndex) =>
          child.steps.map((step, stepIndex) => (
            <StepChip
              key={`${childIndex}-${stepIndex}`}
              step={step}
              locale={locale}
            />
          )),
        )}
      </span>
    );
  }
  return (
    <>
      {block.steps.map((step, index) => (
        <StepChip key={index} step={step} locale={locale} />
      ))}
    </>
  );
}

export function WorkoutStructurePreview({
  structure,
  lang,
  compact = false,
}: {
  structure?: WorkoutStructure | null;
  lang: string;
  compact?: boolean;
}) {
  if (!structure || structure.kind !== "ENDURANCE") return null;
  const segments = enduranceStructureToChartSegments(structure);
  const total = segments.at(-1)?.t1 ?? 0;
  const locale = previewLocale(lang);
  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      {segments.length > 0 && total > 0 ? (
        <div
          role="img"
          aria-label={
            locale === "zh"
              ? "训练结构图"
              : locale === "zh-hant"
                ? "訓練結構圖"
                : locale === "ja"
                  ? "ワークアウト構成図"
                  : "Workout structure chart"
          }
          className={`relative overflow-hidden rounded-control border border-neutral-200/80 bg-white/80 dark:border-white/10 dark:bg-neutral-950/35 ${compact ? "h-10" : "h-16"}`}
        >
          {[25, 50, 75].map((top) => (
            <span
              key={top}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-dashed border-neutral-200 dark:border-white/10"
              style={{ top: `${top}%` }}
            />
          ))}
          {segments.map((segment, index) => (
            <span
              key={`${segment.t0}-${segment.t1}-${index}`}
              aria-hidden="true"
              className="absolute bottom-1 opacity-60"
              style={{
                backgroundColor: segment.color,
                left: `${(segment.t0 / total) * 100}%`,
                top: `${Math.max(6, 100 - segment.displayY)}%`,
                width: `${Math.max(0.8, ((segment.t1 - segment.t0) / total) * 100)}%`,
              }}
            />
          ))}
        </div>
      ) : null}
      {!compact ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {structure.blocks.map((block, index) => (
            <StructureBlock key={index} block={block} locale={locale} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
