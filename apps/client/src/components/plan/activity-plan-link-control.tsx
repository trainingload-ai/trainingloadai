"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import * as React from "react";
import { Check, Link2, Link2Off, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { V2ActivityListItem } from "@/api/v2-activities";
import {
  getActivityPlanCandidates,
  replaceActivityPlanLink,
  removeActivityPlanLink,
  type ActivityPlanCandidate,
} from "@/api/activity-plan-link";
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
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

export function ActivityPlanLinkControl({
  activity,
  onLinkedPlanWorkoutChange,
}: {
  activity: V2ActivityListItem;
  onLinkedPlanWorkoutChange?: (
    linked: V2ActivityListItem["linkedPlanWorkout"],
  ) => void;
}) {
  const t = useTranslations("ActivityPlanLink");
  const tActivityTitle = useTranslations("ActivityTitle");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [candidates, setCandidates] = React.useState<
    ActivityPlanCandidate[] | null
  >(null);
  const [loading, setLoading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingCandidate, setPendingCandidate] =
    React.useState<ActivityPlanCandidate | null>(null);

  const linked = activity.linkedPlanWorkout ?? null;

  React.useEffect(() => {
    if (!menuOpen || !activity.hashId) return;
    let cancelled = false;
    setLoading(true);
    setCandidates(null);
    void getActivityPlanCandidates(activity.hashId).then((res) => {
      if (cancelled) return;
      setCandidates(res?.candidates ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [menuOpen, activity.hashId]);

  const displayWorkoutName = React.useCallback(
    (c: ActivityPlanCandidate) =>
      c.name?.trim() ||
      t("dropdown.sessionFallback", { index: c.sessionIndex }),
    [t],
  );

  const handleReplace = async (
    c: ActivityPlanCandidate,
    skipOccupiedConfirm?: boolean,
  ) => {
    if (!activity.hashId) return;
    if (c.occupiedBy && !skipOccupiedConfirm) {
      setPendingCandidate(c);
      setConfirmOpen(true);
      return;
    }
    try {
      setPending(true);
      const res = await replaceActivityPlanLink(activity.hashId, c.workoutId);
      const next = res?.linkedPlanWorkout;
      if (next) {
        onLinkedPlanWorkoutChange?.(next);
        toast.success(t("toast.linkSuccess"));
      }
      setMenuOpen(false);
    } catch {
      toast.error(t("toast.linkFailed"));
    } finally {
      setPending(false);
      setConfirmOpen(false);
      setPendingCandidate(null);
    }
  };

  const handleConfirmReplace = () => {
    if (pendingCandidate) void handleReplace(pendingCandidate, true);
  };

  const handleRemove = async () => {
    if (!activity.hashId) return;
    try {
      setPending(true);
      await removeActivityPlanLink(activity.hashId);
      onLinkedPlanWorkoutChange?.(null);
      toast.success(t("toast.unlinkSuccess"));
      setMenuOpen(false);
    } catch {
      toast.error(t("toast.unlinkFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              disabled={pending || publicDemo.active}
              title={publicDemo.active ? demoText("readOnlyAction") : undefined}
              className={cn(
                "min-w-0 max-w-[min(100%,12rem)] font-normal shadow-none transition-colors",
                "[&_svg]:size-3.5 data-[state=open]:bg-muted/80",
                linked
                  ? "bg-muted text-foreground hover:bg-muted/90 hover:text-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {pending ? (
                  <Loader2 className="shrink-0 animate-spin text-muted-foreground" />
                ) : linked ? (
                  <Link2 className="shrink-0 text-primary" />
                ) : (
                  <Link2Off className="shrink-0 opacity-80" />
                )}
                <span
                  className="min-w-0 flex-1 truncate text-left"
                  title={linked?.name?.trim() ? linked.name.trim() : undefined}
                >
                  {linked
                    ? linked.name?.trim() || t("dropdown.linkedFallback")
                    : t("label.unlinked")}
                </span>
                {linked?.source === "AUTO" ? (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-mobile-unit pc:text-[10px] font-medium leading-none text-muted-foreground">
                    {t("label.auto")}
                  </span>
                ) : null}
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
              {loading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-mobile-caption pc:text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("dropdown.loading")}
                </div>
              ) : !candidates?.length ? (
                <div className="px-2 py-3 text-mobile-caption pc:text-xs text-muted-foreground">
                  {t("dropdown.empty")}
                </div>
              ) : (
                // 过滤掉已占用的 workout
                candidates.map((c) => {
                  const isCurrent = linked?.workoutId === c.workoutId;
                  return (
                    <DropdownMenuItem
                      key={c.workoutId}
                      className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                      onSelect={(e) => {
                        e.preventDefault();
                        if (isCurrent || pending) return;
                        void handleReplace(c);
                      }}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {displayWorkoutName(c)}
                        </span>
                        {isCurrent ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : null}
                      </div>
                      <span className="text-mobile-caption pc:text-[11px] text-muted-foreground">
                        {c.expectedDurationSec != null
                          ? t("dropdown.expectedDuration", {
                              minutes: Math.max(
                                1,
                                Math.round(c.expectedDurationSec / 60),
                              ),
                            })
                          : "—"}
                        {c.occupiedBy
                          ? ` · ${t("dropdown.occupiedBy", {
                              title: getLocalizedActivityTitle(
                                c.occupiedBy,
                                tActivityTitle,
                              ),
                            })}`
                          : ""}
                      </span>
                    </DropdownMenuItem>
                  );
                })
              )}
            </div>
            {linked ? (
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
          pendingCandidate?.occupiedBy
            ? t("confirm.replaceDescription", {
                workout: displayWorkoutName(pendingCandidate),
                other: getLocalizedActivityTitle(
                  pendingCandidate.occupiedBy,
                  tActivityTitle,
                ),
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
