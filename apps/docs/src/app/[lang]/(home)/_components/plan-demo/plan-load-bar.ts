import type { CSSProperties } from "react";

/** 与 client plan/page.tsx 一致 */
export const PLAN_LOAD_BAR_BACKGROUND =
  "linear-gradient(to top, hsl(var(--emerald-500) / 0.96) 0%, hsl(var(--emerald-500) / 0.88) 18%, hsl(var(--emerald-500) / 0.74) 42%, hsl(var(--emerald-500) / 0.6) 66%, hsl(var(--emerald-500) / 0.48) 86%, hsl(var(--emerald-500) / 0.36) 100%)";

export const PLAN_LOAD_BAR_MASK =
  "linear-gradient(to top, #000 0%, #000 58%, rgba(0,0,0,0.5) 78%, transparent 100%)";

export function planLoadBarFillStyle(height: string): CSSProperties {
  return {
    height,
    background: PLAN_LOAD_BAR_BACKGROUND,
    WebkitMaskImage: PLAN_LOAD_BAR_MASK,
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskImage: PLAN_LOAD_BAR_MASK,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
  };
}

export function cappedExecutionPercent(actual: number, estimated: number): number {
  if (!(estimated > 0) || !Number.isFinite(actual)) return 0;
  return Math.min(100, Math.max(0, (actual / estimated) * 100));
}
