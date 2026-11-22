import type { CSSProperties } from "react";
import type { CalendarProposalMark } from "./calendar-move-model";

const colors = [
  "--violet-500",
  "--orange-500",
  "--blue-500",
  "--pink-500",
  "--teal-500",
  "--lime-600",
] as const;

export function calendarProposalStyle(
  mark: CalendarProposalMark | undefined,
  element: "card" | "marker",
): (CSSProperties & { "--proposal-color": string }) | undefined {
  if (!mark) return undefined;
  const token = colors[(mark.number - 1) % colors.length];
  const color = `hsl(var(${token}))`;
  const before = mark.side === "before";
  if (element === "marker") {
    return {
      "--proposal-color": color,
      border: "1px solid var(--proposal-color)",
      backgroundColor: before ? "transparent" : "var(--proposal-color)",
    };
  }
  return {
    "--proposal-color": color,
    backgroundColor: `color-mix(in oklab, var(--proposal-color) ${before ? 8 : 25}%, var(--background))`,
    backgroundImage: before
      ? "repeating-linear-gradient(-45deg, color-mix(in oklab, var(--proposal-color) 20%, transparent) 0 1.5px, transparent 1.5px 7px)"
      : undefined,
  };
}
