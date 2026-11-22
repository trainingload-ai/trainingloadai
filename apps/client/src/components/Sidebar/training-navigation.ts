import { CalendarDays, Gauge, House, ListChecks, NotebookText } from "lucide-react";

export const TRAINING_LINKS = [
  { key: "home", href: "/", Icon: House },
  { key: "plan", href: "/plan", Icon: NotebookText },
  { key: "calendar", href: "/calendar", Icon: CalendarDays },
  { key: "activities", href: "/activities", Icon: ListChecks },
  { key: "dashboard", href: "/dashboard", Icon: Gauge },
] as const;

export function getTrainingSection(route: string) {
  return TRAINING_LINKS.find(({ href }) =>
    href.slice(1) === (route === "plans" ? "plan" : route),
  )?.key;
}
