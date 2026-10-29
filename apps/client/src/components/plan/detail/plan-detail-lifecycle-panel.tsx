import { useGuestAccessText } from "@deployment/managed-ui";
import {
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import type { TrainingPlanDetail } from "@/api/plans";
import { Button } from "@/components/ui/button";
import {
  getLifecycleDescription,
  type PlanLifecycleAction,
  type TranslateFn,
} from "@/components/plan/detail/plan-detail-utils";
import {
  Panel,
  SectionTitle,
} from "@/components/plan/detail/plan-detail-panel";
import { useTranslations } from "next-intl";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

export function PlanDetailLifecyclePanel({
  plan,
  t,
  pendingAction,
  providerAction,
  onRequestAction,
}: {
  plan: TrainingPlanDetail;
  t: TranslateFn;
  pendingAction: PlanLifecycleAction | null;
  providerAction?: {
    providerName: string;
    connected: boolean;
    exporting: boolean;
    onExport: () => void;
  };
  onRequestAction: (action: PlanLifecycleAction) => void;
}) {
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  const busy = pendingAction !== null;
  const disabled = busy || publicDemo.active;
  const canExportToProvider =
    Boolean(providerAction) &&
    (plan.status === "ACTIVE" || plan.status === "PAUSED");
  const actionLabel = (action: PlanLifecycleAction) =>
    pendingAction === action
      ? t("lifecycle.pending")
      : t(`lifecycle.actions.${action}`);

  return (
    <Panel className="space-y-3">
      <SectionTitle title={t("lifecycle.title")} />
      <div className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
        <p className="text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
          {getLifecycleDescription(t, plan.status)}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {canExportToProvider && providerAction ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={
                disabled ||
                providerAction.exporting ||
                !providerAction.connected
              }
              onClick={providerAction.onExport}
              title={
                publicDemo.active
                  ? demoText("readOnlyAction")
                  : providerAction.connected
                    ? t("providerAction.exportPlan", {
                        provider: providerAction.providerName,
                      })
                    : t("providerAction.connectRequired", {
                        provider: providerAction.providerName,
                      })
              }
            >
              <Send className="h-4 w-4" />
              {providerAction.exporting
                ? t("providerAction.exporting", {
                    provider: providerAction.providerName,
                  })
                : t("providerAction.exportPlan", {
                    provider: providerAction.providerName,
                  })}
            </Button>
          ) : null}

          {plan.status === "DRAFT" ? (
            <>
              <Button
                size="sm"
                className="w-full"
                disabled={disabled}
                onClick={() => onRequestAction("activate")}
              >
                <PlayCircle className="h-4 w-4" />
                {actionLabel("activate")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                disabled={disabled}
                onClick={() => onRequestAction("delete")}
              >
                <Trash2 className="h-4 w-4" />
                {actionLabel("delete")}
              </Button>
            </>
          ) : null}

          {plan.status === "COMPLETED" && plan.capabilities?.delete ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={disabled}
              onClick={() => onRequestAction("delete")}
            >
              <Trash2 className="h-4 w-4" />
              {actionLabel("delete")}
            </Button>
          ) : null}

          {plan.status === "ACTIVE" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={disabled}
                onClick={() => onRequestAction("pause")}
              >
                <PauseCircle className="h-4 w-4" />
                {actionLabel("pause")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={disabled}
                onClick={() => onRequestAction("complete")}
              >
                <CheckCircle2 className="h-4 w-4" />
                {actionLabel("complete")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="w-full"
                disabled={disabled}
                onClick={() => onRequestAction("cancel")}
              >
                <Square className="h-4 w-4" />
                {actionLabel("cancel")}
              </Button>
            </>
          ) : null}

          {plan.status === "PAUSED" ? (
            <>
              <Button
                size="sm"
                className="w-full"
                disabled={disabled}
                onClick={() => onRequestAction("resume")}
              >
                <PlayCircle className="h-4 w-4" />
                {actionLabel("resume")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={disabled}
                onClick={() => onRequestAction("complete")}
              >
                <CheckCircle2 className="h-4 w-4" />
                {actionLabel("complete")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="w-full"
                disabled={disabled}
                onClick={() => onRequestAction("cancel")}
              >
                <Square className="h-4 w-4" />
                {actionLabel("cancel")}
              </Button>
            </>
          ) : null}

          {plan.status === "SCHEDULED" ? (
            <Button
              size="sm"
              variant="destructive"
              className="w-full"
              disabled={disabled}
              onClick={() => onRequestAction("cancel")}
            >
              <Square className="h-4 w-4" />
              {actionLabel("cancel")}
            </Button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
