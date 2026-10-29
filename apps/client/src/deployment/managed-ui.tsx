"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { MobileButtonRow, MobileGroupedList } from "@/components/mobile-app/components/MobileGroupedList";

import { Link } from "@/i18n/navigation";
import type { ImportBatchItem, ImportBatchSummary } from "@/api/activities";
import type { V2ActivityListItem } from "@/api/v2-activities";
import type { NotificationItem } from "@/api/notifications";
import type { TrainingPlanDetail } from "@/api/plans";
import type { AiOperationErrorReason } from "@shared/ai-operation-errors";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type GuardedLinkProps = Omit<React.ComponentProps<typeof Link>, "href"> & {
  href: string;
};

export function AccessOptionsDialog(_props: DialogProps) {
  return null;
}

export function AccessOptionsDialogContent(_props: {
  onPrimary?: (billing: "monthly" | "yearly") => void;
  onAdvanced?: (billing: "monthly" | "yearly") => void;
}) {
  return null;
}

export function AccessGuardedLink({
  href,
  children,
  ...props
}: GuardedLinkProps) {
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

export function useAccessNavigationGuard() {
  const guardNavigation = React.useCallback(
    (_event: React.MouseEvent<HTMLAnchorElement>, _href: string) => {},
    [],
  );
  const [pricingOpen, setPricingOpen] = React.useState(false);
  return React.useMemo(
    () => ({ guardNavigation, pricingOpen, setPricingOpen }),
    [guardNavigation, pricingOpen],
  );
}

export function AccountDeploymentSettings() {
  return null;
}

export function AccountDeploymentDiagnostics() {
  return null;
}

export { LocalAccountDeleteSection as DeploymentAccountDeleteSection } from "@/app/[locale]/(main)/account/component/LocalAccountDeleteSection";

export function OnboardingCompletionExtension({
  onContinue,
}: {
  payload: unknown;
  onContinue: () => void;
}) {
  React.useEffect(() => onContinue(), [onContinue]);
  return null;
}

export function DeploymentUsagePage() {
  return null;
}

export function useManagedAiAccessRecovery(
  _reason: AiOperationErrorReason | null,
) {
  return React.useMemo(
    () => ({
      recoveryAction: undefined,
      overlay: null,
    }),
    [],
  );
}

export { MobileConnectionsPanel } from "@/components/mobile-app/components/MobileMeConnectionsPanel";

export function ManagedActivityExportMenuItems(_props: {
  activity: V2ActivityListItem;
  disabled?: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return null;
}

export function ManagedWorkoutExternalActions(_props: {
  className?: string;
  structureKind?: string | null;
  workoutId?: string;
  workoutName?: string | null;
}) {
  return null;
}

export function ManagedExternalExportFailureActions(_props: {
  item: NotificationItem;
  onResolved?: () => void;
}) {
  return null;
}

export function useManagedPlanProviderActions(
  _plan: TrainingPlanDetail | undefined,
  _t: (key: string, values?: Record<string, string | number | Date>) => string,
) {
  return React.useMemo(
    () => ({
      busy: false,
      connected: false,
      enabled: false,
      exporting: false,
      providerName: "",
      beforeDestructiveAction: async () => {},
      exportToProvider: async () => {},
    }),
    [],
  );
}

export function DeploymentAccountNavigation() {
  return null;
}

export function HomeAccessExtension() {
  return null;
}

export function CoachAccessExtension() {
  return null;
}

export function ManagedActivityReviewAccessPrompt() {
  return null;
}

export function ManagedPlanCoachAccessPrompt() {
  return null;
}

export function ManagedAccountMenuItem() {
  return null;
}

export function DeploymentSocialAuth(_props: {
  disabled?: boolean;
  locale: string;
  mode: "login" | "signup";
}) {
  return null;
}

export function recordDeploymentAuthMethodCompletion(_method?: string) {}

export function DeploymentAccountBadge(_props: { compact?: boolean }) {
  return null;
}

export function capturePendingAccessToken() {
  return null;
}

export function clearPendingAccessToken() {}

export function trackProductFunnelEvent(
  _name: string,
  _properties: Record<string, unknown>,
) {}

export function rememberImportBatchSource(_batchId: string, _files: File[]) {}

export function trackCompletedImportBatch(
  _batch: ImportBatchSummary,
  _items: ImportBatchItem[],
) {
  return false;
}

export function toAnalyticsActivityType(
  _sportType: string | null | undefined,
): "cycling" | "other" | "running" | "swimming" | "triathlon" | "walking" {
  return "other";
}

export function AccountAuthenticationSettings() { return null; }
export function MobileEmailPanel() { return null; }
export function MobilePasswordPanel() { return null; }
export function MobileAccountSettingsPanel({ onOpen }: {
  onOpen: (panel: "account-nickname" | "account-email" | "account-password") => void;
}) {
  const t = useTranslations("AccountInner");
  const session = useViewerSession();
  return <MobileGroupedList><MobileButtonRow tall label={t("name.label")}
    value={session.data?.user.name || "—"} onClick={() => onOpen("account-nickname")} />
  </MobileGroupedList>;
}

export function useGuestAccessText() { return useTranslations("GuestAccess"); }

export function DeploymentUnauthenticatedAccountAction(_props: {href?:string; mobile?:boolean}) { return null; }
