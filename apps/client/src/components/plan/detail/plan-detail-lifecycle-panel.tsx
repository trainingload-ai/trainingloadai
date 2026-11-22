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
import { RollingPlanAutomation } from "@/components/plan/rolling-plan-automation";
import {
  getLifecycleActions,
  getLifecycleDescription,
  type PlanLifecycleAction,
  type TranslateFn,
} from "@/components/plan/detail/plan-detail-utils";
import {
  Panel,
  SectionTitle,
} from "@/components/plan/detail/plan-detail-panel";
import { cn } from "@/lib/utils";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

const actionIcons = {
  activate: PlayCircle,
  resume: PlayCircle,
  pause: PauseCircle,
  complete: CheckCircle2,
  cancel: Square,
  delete: Trash2,
} satisfies Record<PlanLifecycleAction, typeof PlayCircle>;

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
  const actions = getLifecycleActions(plan.status, plan.capabilities);
  const actionLabel = (action: PlanLifecycleAction) =>
    pendingAction === action
      ? t("lifecycle.pending")
      : t(`lifecycle.actions.${action}`);

  return (
    <Panel className="space-y-3">
      <SectionTitle title={t("lifecycle.title")} />
      <div className="space-y-3 rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
        <p className="text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
          {getLifecycleDescription(t, plan.status)}
        </p>
        <RollingPlanAutomation plan={plan} />
        {actions.length > 0 || canExportToProvider ? (
          <footer className="space-y-2">
            {canExportToProvider && providerAction ? (
              <Button
                size="touch-sm"
                variant="ghost"
                className="max-w-full whitespace-normal bg-background/80 hover:bg-background"
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
                <Send aria-hidden="true" />
                {providerAction.exporting
                  ? t("providerAction.exporting", {
                      provider: providerAction.providerName,
                    })
                  : t("providerAction.exportPlan", {
                      provider: providerAction.providerName,
                    })}
              </Button>
            ) : null}
            {actions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {actions.map(({ action, tone }) => {
                  const Icon = actionIcons[action];
                  return (
                    <Button
                      key={action}
                      size="touch-sm"
                      variant={tone === "primary" ? "default" : "ghost"}
                      className={cn(
                        "max-w-full whitespace-normal",
                        tone === "neutral" && "bg-background/80 hover:bg-background",
                        tone === "destructive" && "ms-auto text-destructive hover:bg-destructive/10 hover:text-destructive",
                      )}
                      disabled={disabled}
                      onClick={() => onRequestAction(action)}
                    >
                      <Icon aria-hidden="true" />
                      {actionLabel(action)}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </footer>
        ) : null}
      </div>
    </Panel>
  );
}
