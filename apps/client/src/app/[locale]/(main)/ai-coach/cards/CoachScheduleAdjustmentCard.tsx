"use client";

import { useState, type ReactNode, type Ref } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  ClipboardList,
  Clock,
  History,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { CalendarAdjustmentState } from "@shared/plan-proposal";
import { cn } from "@/lib/utils";
import { CoachCard } from "./CoachCard";

const stateIcons = {
  [CalendarAdjustmentState.Ready]: ClipboardList,
  [CalendarAdjustmentState.Stale]: RefreshCw,
  [CalendarAdjustmentState.Expired]: Clock,
  [CalendarAdjustmentState.Invalidated]: CircleAlert,
  [CalendarAdjustmentState.Superseded]: History,
  [CalendarAdjustmentState.Discarded]: CircleX,
  [CalendarAdjustmentState.Applied]: CheckCircle2,
};

export function CoachScheduleAdjustmentCard({
  state,
  planTitle,
  toggleRef,
  statusLabel,
  children,
  footer,
  dense,
}: {
  state: CalendarAdjustmentState;
  planTitle: string;
  toggleRef?: Ref<HTMLButtonElement>;
  statusLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  dense?: boolean;
}) {
  const t = useTranslations("CalendarMove");
  const Icon = stateIcons[state];
  const ready = state === CalendarAdjustmentState.Ready;
  const applied = state === CalendarAdjustmentState.Applied;
  const needsRefresh =
    state === CalendarAdjustmentState.Expired ||
    state === CalendarAdjustmentState.Stale ||
    state === CalendarAdjustmentState.Invalidated;
  const [disclosure, setDisclosure] = useState({ state, open: ready });
  if (disclosure.state !== state) {
    // Keep recovery controls open if a conflict is reported during confirmation.
    setDisclosure({ state, open: ready || (needsRefresh && disclosure.open) });
  }
  const statusColor = cn(
    ready && "text-palette-violet-800 dark:text-palette-violet-300",
    applied && "text-success",
    needsRefresh && "text-warning",
  );
  const status = statusLabel ?? t(`adjustmentStates.${state}`);
  const previewTitle = t("recovery.previewTitle");

  return (
    <CoachCard
      icon={<Icon className={statusColor} />}
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span role="status" className={cn("font-semibold", statusColor)}>
            {status}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {previewTitle}
          </span>
        </span>
      }
      subtitle={planTitle}
      footer={footer}
      dense={dense}
      collapsible
      open={disclosure.open}
      onOpenChange={(open) => setDisclosure({ state, open })}
      toggleAriaLabel={[status, previewTitle, planTitle].join(" ")}
      toggleRef={toggleRef}
      toggleClassName={cn(
        "w-full max-w-none items-start rounded-md py-3 hover:bg-foreground/5 focus-visible:ring-inset [&>svg:last-child]:ms-auto [&>svg:last-child]:mt-1",
        dense ? "px-3" : "px-4",
      )}
      className={cn(
        "overflow-hidden rounded-md",
        ready && "bg-palette-violet-100/60 dark:bg-palette-violet-950/35",
        applied && "bg-success/8 dark:bg-success/10",
        !ready && !applied && "bg-muted/55 dark:bg-muted/25",
      )}
      contentClassName={cn(
        "mx-0 mt-0 rounded-none bg-transparent pt-0 dark:bg-transparent",
        dense && "p-3 pt-0",
      )}
    >
      {children}
    </CoachCard>
  );
}
