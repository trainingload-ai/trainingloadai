import type {
  EnduranceWorkRestStep,
  EndurancePlanBlock,
} from "../endurance-workout-ir";
import type { WorkoutDefinitionInput } from "../workout-structure";

type DisplayLocale = "en" | "zh" | "zh-hant" | "ja";

const STEP_LABELS: Record<
  DisplayLocale,
  Record<NonNullable<EnduranceWorkRestStep["stepKind"]>, string>
> = {
  en: {
    WARMUP: "Warm-up",
    WORK: "Main set",
    RECOVERY: "Recovery",
    REST: "Rest",
    COOLDOWN: "Cool-down",
    OTHER: "Run",
  },
  zh: {
    WARMUP: "热身",
    WORK: "主训练",
    RECOVERY: "恢复",
    REST: "休息",
    COOLDOWN: "冷身",
    OTHER: "跑步",
  },
  "zh-hant": {
    WARMUP: "熱身",
    WORK: "主訓練",
    RECOVERY: "恢復",
    REST: "休息",
    COOLDOWN: "冷身",
    OTHER: "跑步",
  },
  ja: {
    WARMUP: "ウォームアップ",
    WORK: "メイン",
    RECOVERY: "リカバリー",
    REST: "休息",
    COOLDOWN: "クールダウン",
    OTHER: "ラン",
  },
};

function displayLocale(locale: string): DisplayLocale {
  if (locale.toLowerCase().startsWith("zh-hant")) return "zh-hant";
  if (locale.toLowerCase().startsWith("zh")) return "zh";
  if (locale.toLowerCase().startsWith("ja")) return "ja";
  return "en";
}

function cleanNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(1)));
}

function durationText(step: EnduranceWorkRestStep, locale: DisplayLocale) {
  const meta = step.durationMeta;
  if (meta?.kind === "DISTANCE" && Number.isFinite(meta.value)) {
    const value = Number(meta.value);
    if (meta.unit === "KILOMETERS") return `${cleanNumber(value)} km`;
    if (meta.unit === "METERS") return `${cleanNumber(value)} m`;
  }
  const seconds = Number(meta?.value ?? step.duration);
  if (!Number.isFinite(seconds) || seconds <= 0)
    return locale === "en"
      ? "Open duration"
      : locale === "ja"
        ? "時間自由"
        : locale === "zh-hant"
          ? "開放時長"
          : "开放时长";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    if (locale === "en") return `${hours} hr`;
    if (locale === "ja") return `${hours}時間`;
    return locale === "zh-hant" ? `${hours} 小時` : `${hours} 小时`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    if (locale === "en") return `${minutes} min`;
    if (locale === "ja") return `${minutes}分`;
    return locale === "zh-hant" ? `${minutes} 分鐘` : `${minutes} 分钟`;
  }
  return locale === "en" ? `${seconds} sec` : `${seconds} 秒`;
}

function paceText(step: EnduranceWorkRestStep) {
  const target = step.primaryTargetMeta;
  if (
    target?.kind !== "SPEED" ||
    target.unit !== "sec/km" ||
    !Number.isFinite(target.value)
  )
    return "";
  const format = (seconds: number) => {
    const rounded = Math.round(seconds);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
  };
  const fast = format(Number(target.value));
  const slow = Number.isFinite(target.valueHigh)
    ? format(Number(target.valueHigh))
    : fast;
  return fast === slow ? `${fast}/km` : `${fast}–${slow}/km`;
}

function stepText(step: EnduranceWorkRestStep, locale: DisplayLocale) {
  const label = STEP_LABELS[locale][step.stepKind ?? "OTHER"];
  const pace = paceText(step);
  return `${label} · ${durationText(step, locale)}${pace ? ` · ${pace}` : ""}`;
}

function blockText(block: EndurancePlanBlock, locale: DisplayLocale) {
  if (block.type !== "repeat")
    return block.steps.map((step) => stepText(step, locale));
  const childSteps = block.children.flatMap((child) =>
    child.steps.map((step) => stepText(step, locale)),
  );
  const repeatLabel =
    locale === "en"
      ? `Repeat ${block.count} times`
      : locale === "ja"
        ? `${block.count}回繰り返す`
        : locale === "zh-hant"
          ? `重複 ${block.count} 組`
          : `重复 ${block.count} 组`;
  const separator = locale === "en" ? "; " : "；";
  const divider = locale === "en" ? ": " : "：";
  return [`${repeatLabel}${divider}${childSteps.join(separator)}`];
}

export function workoutDefinitionStepLines(
  definition: WorkoutDefinitionInput | undefined,
  locale: string,
) {
  if (!definition) return [];
  if (definition.source === "TEXT")
    return definition.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  if (definition.structure.kind === "FREEFORM")
    return [definition.structure.text].filter(Boolean);
  if (definition.structure.kind !== "ENDURANCE") return [];
  const normalizedLocale = displayLocale(locale);
  return definition.structure.blocks.flatMap((block) =>
    blockText(block, normalizedLocale),
  );
}
