"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { usePlansList } from "@/api/usePlans";
import { getPlanDetail } from "@/api/plans";
import { EditPlanDialog } from "@/components/plan/EditPlanDialog";
import { usePlanStore } from "@/lib/plan-store";
import {
  Item,
  ItemGroup,
  ItemHeader,
  ItemTitle,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemActions,
} from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  useActivatePlan,
  useCancelActivation,
  useDeletePlan,
} from "@/api/usePlanMutations";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
  buildPlanListItemMeta,
  toExistingPlanDraft,
} from "./plan-dialog-model";
import { PlanActivateDialog } from "./PlanActivateDialog";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

interface PlanListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreatePlan?: () => void;
}

export const PlanListDialog: React.FC<PlanListDialogProps> = ({
  open,
  onOpenChange,
  onCreatePlan,
}) => {
  const t = useTranslations("PlanListDialog");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const qc = useQueryClient();
  const { plans, isLoading, error } = usePlansList(open);
  const [editOpen, setEditOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const initCurrentFromExisting = usePlanStore(
    (s) => s.initCurrentFromExisting,
  );
  const { mutateAsync: activateAsync, isPending: activating } =
    useActivatePlan();
  const { mutateAsync: cancelAsync, isPending: cancelling } =
    useCancelActivation();
  const { mutateAsync: deleteAsync, isPending: deleting } = useDeletePlan();
  const [activateOpen, setActivateOpen] = useState(false);
  const [activatePlanId, setActivatePlanId] = useState<string | null>(null);
  const [returnToListOnClose, setReturnToListOnClose] = useState(false);

  const hasActivePlan = plans.some((p) => p.status === "ACTIVE");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[100vw] md:w-[50vw] max-w-none sm:max-w-none h-[70vh] grid grid-rows-[auto_1fr] p-4">
          <DialogHeader className="text-left">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>{t("title")}</DialogTitle>
              <Button
                size="sm"
                variant="secondary"
                disabled={publicDemo.active}
                title={
                  publicDemo.active ? demoText("readOnlyAction") : undefined
                }
                onClick={onCreatePlan}
              >
                {t("buttons.create")}
              </Button>
            </div>
          </DialogHeader>
          <ScrollArea className="min-h-0">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("states.loading")}
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center py-12 text-sm text-destructive">
                {t("states.loadFailed")}
              </div>
            )}
            {!isLoading && !error && plans.length === 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("states.empty")}
              </div>
            )}
            {!isLoading && !error && plans.length > 0 && (
              <ItemGroup className="gap-4">
                {plans.map((p, idx) => {
                  const meta = buildPlanListItemMeta(p);
                  return (
                    <React.Fragment key={p.id}>
                      <Item
                        variant="outline"
                        size="sm"
                        title={meta.titleText}
                        className="cursor-default"
                      >
                        <ItemHeader>
                          <ItemTitle>
                            {p.title}
                            {meta.weeks ? (
                              <span className="ml-2 text-mobile-caption pc:text-xs text-muted-foreground">
                                {meta.weeks} weeks
                              </span>
                            ) : null}
                          </ItemTitle>
                          <div className="flex items-center gap-2">
                            {meta.isActive && (
                              <Badge variant="secondary">
                                {t("badges.active")}
                              </Badge>
                            )}
                            <span className="text-mobile-caption pc:text-xs text-muted-foreground">
                              {meta.updatedAt}
                            </span>
                          </div>
                        </ItemHeader>
                        {meta.description && (
                          <ItemContent>
                            <ItemDescription className="line-clamp-2">
                              {meta.description}
                            </ItemDescription>
                          </ItemContent>
                        )}
                        <ItemActions>
                          <ButtonGroup>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  const detail = await qc.fetchQuery({
                                    queryKey: queryKeys.plans.detail(p.id),
                                    queryFn: () => getPlanDetail(p.id),
                                  });
                                  if (!detail) return;
                                  setReadOnly(true);
                                  setReturnToListOnClose(true);
                                  initCurrentFromExisting(
                                    toExistingPlanDraft(detail),
                                  );
                                  onOpenChange(false);
                                  setEditOpen(true);
                                } catch (err) {
                                  console.error(
                                    "Failed to load plan detail",
                                    err,
                                  );
                                }
                              }}
                            >
                              {t("buttons.view")}
                            </Button>
                            {meta.isActive ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={cancelling || publicDemo.active}
                                title={
                                  publicDemo.active
                                    ? demoText("readOnlyAction")
                                    : undefined
                                }
                                onClick={async () => {
                                  await cancelAsync({ planId: p.id });
                                }}
                              >
                                {t("buttons.deactivate")}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  publicDemo.active ||
                                  activating ||
                                  hasActivePlan
                                }
                                onClick={() => {
                                  setActivatePlanId(p.id);
                                  setActivateOpen(true);
                                }}
                              >
                                {t("buttons.activate")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                publicDemo.active || deleting || meta.isActive
                              }
                              title={
                                publicDemo.active
                                  ? demoText("readOnlyAction")
                                  : meta.isActive
                                    ? t("states.cannotDeleteActive")
                                    : undefined
                              }
                              onClick={async () => {
                                await deleteAsync({ planId: p.id });
                              }}
                            >
                              {t("buttons.delete")}
                            </Button>
                          </ButtonGroup>
                        </ItemActions>
                      </Item>
                      {idx !== plans.length - 1 && <ItemSeparator />}
                    </React.Fragment>
                  );
                })}
              </ItemGroup>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <PlanActivateDialog
        open={activateOpen}
        pending={activating}
        onOpenChange={(nextOpen) => {
          setActivateOpen(nextOpen);
          if (!nextOpen) setActivatePlanId(null);
        }}
        onConfirm={async (startDate) => {
          if (!activatePlanId) return;
          await activateAsync({
            planId: activatePlanId,
            startDate,
          });
          setActivateOpen(false);
          setActivatePlanId(null);
        }}
      />
      <EditPlanDialog
        open={editOpen}
        onOpenChange={(nextOpen) => {
          setEditOpen(nextOpen);
          if (!nextOpen && returnToListOnClose) {
            setReturnToListOnClose(false);
            onOpenChange(true);
          }
        }}
        readOnly={readOnly || publicDemo.active}
      />
    </>
  );
};
