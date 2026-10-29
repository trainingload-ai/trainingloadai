import type { FitnessStatusMetricSpan } from "@/hooks/useFitnessStatusConfig";

export function clampSpan(span: FitnessStatusMetricSpan, columns: number) {
  return Math.min(span, columns) as 1 | 2 | 4;
}

export function getSpanClass(span: FitnessStatusMetricSpan) {
  if (span === 1) return "col-span-1";
  if (span === 2) return "col-span-2";
  return "col-span-2 sm:col-span-4";
}
