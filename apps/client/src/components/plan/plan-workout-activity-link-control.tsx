"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import * as React from "react";
import { Check, Link2, Link2Off, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PlanSportType, PlanWorkoutLink } from "@/api/plans";
import {
  removeActivityPlanLink,
  replaceActivityPlanLink,
} from "@/api/activity-plan-link";
import {
  getV2ActivitiesFeed,
  type V2ActivityListItem,
} from "@/api/v2-activities";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirmDialog";
import { cn } from "@/lib/utils";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

function feedSportFilter(
  sportType: PlanSportType | string | undefined,
): "RUN" | "CYCLING" | "SWIM" | "ALL" {
  const s = String(sportType ?? "").toUpperCase();
  if (s === "RUN" || s === "CYCLING" || s === "SWIM") {
    return s as "RUN" | "CYCLING" | "SWIM";
  }
  return "ALL";
}

function primaryLink(workoutLinks: PlanWorkoutLink[] | undefined) {
  return workoutLinks?.find((l) => l.role === "PRIMARY" && !l.unlinkedAt);
}

export function PlanWorkoutActivityLinkControl({
  workoutId,
  sportType,
  scheduledDateKey,
  links,
  compact,
  mobileAction,
}: {
  workoutId: string;
  sportType: PlanSportType | string;
  scheduledDateKey: string | null;
  links?: PlanWorkoutLink[];
  /** 今日卡片略紧凑 */
  compact?: boolean;
  /** 移动端训练详情底部的整行操作 */
  mobileAction?: boolean;
}) {
  const t = useTranslations("PlanWorkoutActivityLink");
  const mobileT = useTranslations("ViewWorkoutDialog.mobile");
  const tActivityTitle = useTranslations("ActivityTitle");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [items, setItems] = React.useState<V2ActivityListItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingActivity, setPendingActivity] =
    React.useState<V2ActivityListItem | null>(null);

  const primary = primaryLink(links);
  const linkedActivity = primary?.activity ?? null;

  React.useEffect(() => {
    if (!menuOpen || !scheduledDateKey) return;
    let cancelled = false;
    setLoading(true);
    setItems(null);
    void getV2ActivitiesFeed(
      {
        startDate: scheduledDateKey,
        endDate: scheduledDateKey,
        sportType: feedSportFilter(sportType),
        perPage: 100,
        orderBy: "startTime",
        orderDirection: "desc",
      },
      { forceRefresh: true },
    ).then((res) => {
      if (cancelled) return;
      setItems(res?.items ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [menuOpen, scheduledDateKey, sportType]);

  const invalidatePlans = React.useCallback(async () => {
    await invalidateAfterPlanMutation(queryClient);
  }, [queryClient]);

  const runReplace = async (
    activity: V2ActivityListItem,
    skipOccupiedConfirm?: boolean,
  ) => {
    const other = activity.linkedPlanWorkout;
    if (other && other.workoutId !== workoutId && !skipOccupiedConfirm) {
      setPendingActivity(activity);
      setConfirmOpen(true);
      return;
    }
    try {
      setPending(true);
      await replaceActivityPlanLink(activity.hashId, workoutId);
      await invalidatePlans();
      toast.success(t("toast.linkSuccess"));
      setMenuOpen(false);
    } catch {
      toast.error(t("toast.linkFailed"));
    } finally {
      setPending(false);
      setConfirmOpen(false);
      setPendingActivity(null);
    }
  };

  const handleConfirmReplace = () => {
    if (pendingActivity) void runReplace(pendingActivity, true);
  };

  const handleRemove = async () => {
    if (!linkedActivity?.hashId) return;
    try {
      setPending(true);
      await removeActivityPlanLink(linkedActivity.hashId);
      await invalidatePlans();
      toast.success(t("toast.unlinkSuccess"));
      setMenuOpen(false);
    } catch {
      toast.error(t("toast.unlinkFailed"));
    } finally {
      setPending(false);
    }
  };

  const displayActivityTitle = (a: V2ActivityListItem) =>
    getLocalizedActivityTitle(
      a,
      tActivityTitle,
      t("dropdown.activityFallback"),
    );

  return (
    <>
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size={mobileAction ? "touch" : compact ? "xs" : "compact"}
              disabled={pending || !scheduledDateKey || publicDemo.active}
              className={cn(
                mobileAction
                  ? "h-11 w-full max-w-none rounded-control-lg bg-neutral-100 px-4 font-semibold text-foreground shadow-none hover:bg-neutral-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  : compact
                    ? "min-w-0 max-w-full font-normal shadow-none pc:text-[11px]"
                    : "min-w-0 max-w-[min(100%,14rem)] font-normal shadow-none",
                "[&_svg]:size-3.5 data-[state=open]:bg-muted/80",
                linkedActivity
                  ? "bg-muted/60 text-foreground hover:bg-muted/80 hover:text-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={
                publicDemo.active
                  ? demoText("readOnlyAction")
                  : !scheduledDateKey
                    ? t("dropdown.noScheduledDate")
                    : undefined
              }
            >
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1.5",
                  mobileAction ? "justify-center" : "flex-1",
                )}
              >
                {pending ? (
                  <Loader2 className="shrink-0 animate-spin text-muted-foreground" />
                ) : linkedActivity ? (
                  <Link2 className="shrink-0 text-primary" />
                ) : (
                  <Link2Off className="shrink-0 opacity-80" />
                )}
                <span
                  className={cn(
                    "min-w-0 truncate",
                    mobileAction ? "text-center" : "flex-1 text-left",
                  )}
                >
                  {linkedActivity
                    ? mobileAction
                      ? mobileT("linkedActivityAction")
                      : getLocalizedActivityTitle(
                          linkedActivity,
                          tActivityTitle,
                          t("label.linkedFallback"),
                        )
                    : mobileAction
                      ? mobileT("linkActivityAction")
                      : t("label.unlinked")}
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="flex w-72 max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] flex-col overflow-hidden p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuLabel className="shrink-0 px-2 py-2 text-mobile-caption pc:text-xs font-normal text-muted-foreground">
              {t("dropdown.heading")}
            </DropdownMenuLabel>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1">
              {!scheduledDateKey ? (
                <div className="px-2 py-3 text-mobile-caption pc:text-xs text-muted-foreground">
                  {t("dropdown.noScheduledDate")}
                </div>
              ) : loading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-mobile-caption pc:text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("dropdown.loading")}
                </div>
              ) : !items?.length ? (
                <div className="px-2 py-3 text-mobile-caption pc:text-xs text-muted-foreground">
                  {t("dropdown.empty")}
                </div>
              ) : (
                items.map((a) => {
                  const isCurrent =
                    linkedActivity?.hashId &&
                    a.hashId === linkedActivity.hashId;
                  const lp = a.linkedPlanWorkout;
                  const linkedHere = lp && lp.workoutId === workoutId;
                  const linkedElsewhere = lp && lp.workoutId !== workoutId;
                  return (
                    <DropdownMenuItem
                      key={a.hashId}
                      className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                      onSelect={(e) => {
                        e.preventDefault();
                        if (isCurrent || pending || linkedHere) return;
                        void runReplace(a);
                      }}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {displayActivityTitle(a)}
                        </span>
                        {linkedHere || isCurrent ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : null}
                      </div>
                      <span className="text-mobile-caption pc:text-[11px] text-muted-foreground">
                        {a.duration != null
                          ? t("dropdown.durationMinutes", {
                              minutes: Math.max(1, Math.round(a.duration / 60)),
                            })
                          : "—"}
                        {linkedElsewhere
                          ? ` · ${t("dropdown.linkedOtherPlanWorkout", {
                              name:
                                lp?.name?.trim() ||
                                t("dropdown.sessionFallback"),
                            })}`
                          : ""}
                      </span>
                    </DropdownMenuItem>
                  );
                })
              )}
            </div>
            {linkedActivity ? (
              <>
                <DropdownMenuSeparator className="shrink-0" />
                <div className="shrink-0 p-1 pt-0">
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      void handleRemove();
                    }}
                  >
                    {t("dropdown.removeLink")}
                  </DropdownMenuItem>
                </div>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirm.replaceTitle")}
        description={
          pendingActivity
            ? t("confirm.replaceDescription", {
                activity: displayActivityTitle(pendingActivity),
                workout:
                  pendingActivity.linkedPlanWorkout?.name?.trim() ||
                  t("dropdown.sessionFallback"),
              })
            : t("confirm.replaceTitle")
        }
        confirmText={t("confirm.confirm")}
        cancelText={t("confirm.cancel")}
        onConfirm={handleConfirmReplace}
      />
    </>
  );
}
