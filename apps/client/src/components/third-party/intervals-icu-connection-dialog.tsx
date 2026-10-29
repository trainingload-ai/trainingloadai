"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  type ConnectIntervalsIcuInput,
  type IntervalsIcuConnectionStatus,
  useConnectIntervalsIcu,
  useDisconnectIntervalsIcu,
  useIntervalsIcuStatus,
  useStartIntervalsIcuOAuth,
  useUpdateIntervalsIcuSettings,
} from "@/api/intervals-icu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import { queryKeys } from "@/lib/query-keys";
import { clockIntlOptions } from "@/lib/time-format";
import { useStore, type TimeFormat } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  buildThirdPartyOAuthReturnUrl,
  clearThirdPartyOAuthResult,
} from "@/lib/third-party-oauth-result";
import { thirdPartySettingsFromStatus } from "@/api/third-party-connection";
import { ThirdPartySyncOptions } from "./third-party-connection-dialog-ui";

const intervalsIcuPlannedWorkoutSyncEnabled = true;
const intervalsIcuSettingsUrl = "https://intervals.icu/settings";

type IntervalsIcuAuthMode = "oauth" | "api_key";

type IntervalsIcuConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnUrl?: string;
  showDisconnect?: boolean;
  handleOAuthResult?: boolean;
  oauthEnabled?: boolean;
};

function formatDateTime(
  value: string | null | undefined,
  locale: string,
  timeFormat: TimeFormat,
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...clockIntlOptions(timeFormat),
  }).format(date);
}

function currentAuthMode(status: IntervalsIcuConnectionStatus) {
  return status.authType === "api_key" ? "api_key" : "oauth";
}

export function IntervalsIcuConnectionDialog({
  open,
  onOpenChange,
  returnUrl,
  showDisconnect = true,
  handleOAuthResult = true,
  oauthEnabled = true,
}: IntervalsIcuConnectionDialogProps) {
  const t = useTranslations("ThirdPartyConnections");
  const queryClient = useQueryClient();
  const { locale } = useParams();
  const currentLocale = (Array.isArray(locale) ? locale[0] : locale) ?? "en";
  const { timeFormat } = useStore();
  const { data: status = { connected: false } } = useIntervalsIcuStatus();
  const connectIntervalsIcu = useConnectIntervalsIcu();
  const startIntervalsIcuOAuth = useStartIntervalsIcuOAuth();
  const updateIntervalsIcuSettings = useUpdateIntervalsIcuSettings();
  const disconnectIntervalsIcu = useDisconnectIntervalsIcu();

  const [authMode, setAuthMode] = useState<IntervalsIcuAuthMode>(
    oauthEnabled ? "oauth" : "api_key",
  );
  const [apiKey, setApiKey] = useState("");
  const [immediateSync, setImmediateSync] = useState(true);
  const [syncScheduledActivities, setSyncScheduledActivities] = useState(true);
  const [exportActivities, setExportActivities] = useState(false);
  const [syncWellness, setSyncWellness] = useState(false);
  const [syncPlannedWorkouts, setSyncPlannedWorkouts] = useState(false);
  const [exportPlannedWorkouts, setExportPlannedWorkouts] = useState(false);
  const [syncSportSettings, setSyncSportSettings] = useState(false);
  const [pendingSave, setPendingSave] =
    useState<ConnectIntervalsIcuInput | null>(null);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const connected = Boolean(status.connected);
  const activeAuthMode = currentAuthMode(status);
  const viewingCurrentAuthMode = connected && authMode === activeAuthMode;
  const replacingCurrentApiKey =
    viewingCurrentAuthMode && authMode === "api_key" && apiKey.trim() !== "";
  const showInitialSyncOption = !viewingCurrentAuthMode;
  const showSettingsAction = viewingCurrentAuthMode && !replacingCurrentApiKey;
  const showAuthAction = !viewingCurrentAuthMode || replacingCurrentApiKey;
  const busy = Boolean(busyAction);
  const lastSync = formatDateTime(
    status.lastSyncCompletedAt,
    currentLocale,
    timeFormat,
  );

  useEffect(() => {
    if (!open) return;

    setApiKey("");
    setAuthMode(
      !oauthEnabled || (connected && status.authType === "api_key")
        ? "api_key"
        : "oauth",
    );
    setImmediateSync(!connected);
    const settings = thirdPartySettingsFromStatus("intervals_icu", status);
    setSyncScheduledActivities(settings.importActivitiesAutomatically);
    setExportActivities(settings.exportActivitiesAutomatically);
    setSyncWellness(settings.importWellness);
    setSyncPlannedWorkouts(
      intervalsIcuPlannedWorkoutSyncEnabled && settings.importPlannedWorkouts,
    );
    setExportPlannedWorkouts(
      intervalsIcuPlannedWorkoutSyncEnabled && settings.exportPlannedWorkouts,
    );
    setSyncSportSettings(settings.importAthleteProfile);
  }, [
    connected,
    oauthEnabled,
    open,
    status.settings,
    status.authType,
    status.exportActivities,
    status.exportPlannedWorkouts,
    status.syncPlannedWorkouts,
    status.syncScheduledActivities,
    status.syncSportSettings,
    status.syncWellness,
  ]);

  useEffect(() => {
    if (!handleOAuthResult || !oauthEnabled) return;
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const result = url.searchParams.get("intervals_icu_oauth");
    const reason = url.searchParams.get("reason");
    if (!result) return;

    if (result === "connected") {
      toast.success(t("intervalsIcu.oauthConnectSuccess"));
      queryClient.setQueryData<IntervalsIcuConnectionStatus>(
        queryKeys.account.intervalsIcu(),
        (current) => ({
          ...(current ?? { connected: false }),
          connected: true,
          authType: "oauth",
        }),
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.account.intervalsIcu(),
      });
    } else {
      toast.error(
        reason === "account_already_connected"
          ? t("intervalsIcu.accountAlreadyConnected")
          : t("intervalsIcu.oauthConnectFailed"),
      );
    }

    clearThirdPartyOAuthResult(url);
    window.history.replaceState(null, "", url.toString());
  }, [handleOAuthResult, oauthEnabled, queryClient, t]);

  const isConfiguringNewAuthMode = () =>
    !connected || authMode !== activeAuthMode;

  const buildSettingsPayload = () => ({
    syncScheduledActivities,
    syncPlannedWorkouts:
      intervalsIcuPlannedWorkoutSyncEnabled && syncPlannedWorkouts,
    syncWellness,
    exportActivities,
    syncSportSettings,
    exportSportSettings: false,
    exportPlannedWorkouts:
      intervalsIcuPlannedWorkoutSyncEnabled && exportPlannedWorkouts,
  });

  const buildConnectPayload = () => ({
    syncActivities: isConfiguringNewAuthMode() && immediateSync,
    ...buildSettingsPayload(),
  });

  const closeDialog = () => onOpenChange(false);

  const handleConnectWithApiKey = async () => {
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey && (!connected || status.authType !== "api_key")) {
      toast.error(t("intervalsIcu.apiKeyRequired"));
      return;
    }

    try {
      setBusyAction("connect");
      const payload = {
        apiKey: trimmedApiKey || undefined,
        ...buildConnectPayload(),
      };
      const result = await connectIntervalsIcu.mutateAsync(payload);
      if (result.keyChangeConfirmationRequired) {
        setPendingSave(payload);
        closeDialog();
        return;
      }
      setApiKey("");
      closeDialog();
      if (result.initialSync?.error) {
        toast.warning(t("intervalsIcu.initialSyncFailed"));
      } else if (result.initialSync) {
        toast.success(t("intervalsIcu.connectAndSyncStarted"));
      } else {
        toast.success(
          connected
            ? t("intervalsIcu.settingsSaved")
            : t("intervalsIcu.connectSuccess"),
        );
      }
    } catch (error) {
      console.error("连接 Intervals.icu 失败：", error);
      toast.error(error instanceof Error ? error.message : t("connectError"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setBusyAction("settings");
      await updateIntervalsIcuSettings.mutateAsync(buildSettingsPayload());
      closeDialog();
      toast.success(t("intervalsIcu.settingsSaved"));
    } catch (error) {
      console.error("保存 Intervals.icu 设置失败：", error);
      toast.error(error instanceof Error ? error.message : t("connectError"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartOAuth = async () => {
    if (!oauthEnabled) return;
    try {
      setBusyAction("oauth");
      const currentReturnUrl =
        typeof window !== "undefined"
          ? buildThirdPartyOAuthReturnUrl(window.location.href, "intervals_icu")
          : undefined;
      // 获取授权 URL 和 scopes
      const result = await startIntervalsIcuOAuth.mutateAsync({
        ...buildConnectPayload(),
        returnUrl: returnUrl ?? currentReturnUrl,
      });
      // 跳转授权 URL
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      console.error("启动 Intervals.icu OAuth 失败：", error);
      toast.error(error instanceof Error ? error.message : t("connectError"));
      setBusyAction(null);
    }
  };

  const confirmApiKeyReplacement = async () => {
    if (!pendingSave) return;
    try {
      setBusyAction("connect");
      const result = await connectIntervalsIcu.mutateAsync({
        ...pendingSave,
        replaceCredentialConfirmed: true,
      });
      setPendingSave(null);
      setApiKey("");
      closeDialog();
      if (result.initialSync?.error) {
        toast.warning(t("intervalsIcu.initialSyncFailed"));
      } else if (result.initialSync) {
        toast.success(t("intervalsIcu.connectAndSyncStarted"));
      } else {
        toast.success(t("intervalsIcu.settingsSaved"));
      }
    } catch (error) {
      console.error("替换 Intervals.icu API 密钥失败：", error);
      toast.error(error instanceof Error ? error.message : t("connectError"));
    } finally {
      setBusyAction(null);
    }
  };

  const requestDisconnect = () => {
    closeDialog();
    setConfirmDisconnectOpen(true);
  };

  const confirmDisconnect = async () => {
    try {
      setBusyAction("disconnect");
      await disconnectIntervalsIcu.mutateAsync();
      setConfirmDisconnectOpen(false);
      toast.success(`Intervals.icu ${t("disconnectSuccess")}`);
    } catch (error) {
      console.error("断开 Intervals.icu 连接失败：", error);
      toast.error(
        error instanceof Error ? error.message : t("disconnectError"),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const apiKeyFields = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={t("intervalsIcu.apiKeyPlaceholder")}
          aria-label={t("intervalsIcu.apiKeyLabel")}
          className="min-w-0 flex-1"
          disabled={busy}
        />
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a
            href={intervalsIcuSettingsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("intervalsIcu.openApiKeySettings")}
            title={t("intervalsIcu.openApiKeySettings")}
          >
            {t("intervalsIcu.getApiKey")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </Button>
      </div>
      <p className="break-words text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
        {connected && status.authType === "api_key"
          ? t("intervalsIcu.apiKeyHelpConnected")
          : connected
            ? t("intervalsIcu.apiKeyHelpOAuthConnected")
            : t("intervalsIcu.apiKeyHelp")}
      </p>
    </>
  );

  return (
    <>
      <AdaptiveDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && busy) return;
          onOpenChange(nextOpen);
        }}
      >
        <AdaptiveDialogContent
          desktopClassName="overflow-x-hidden sm:max-w-lg"
          mobileClassName="overflow-x-hidden"
        >
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>
              {t("intervalsIcu.settingsTitle")}
            </AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              {t(
                oauthEnabled
                  ? "intervalsIcu.settingsDescription"
                  : "intervalsIcu.apiKeySettingsDescription",
              )}
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <div className="min-w-0 space-y-4">
            {connected ? (
              <div className="min-w-0 overflow-hidden rounded-md border border-border/70 bg-muted/35 p-3 text-sm text-muted-foreground">
                <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 break-words">
                      {t("intervalsIcu.authTypeLabel")}
                    </span>
                    <Badge
                      variant="outline"
                      className="shrink-0 px-2 py-0.5 text-mobile-unit pc:text-[10px]"
                    >
                      {status.authType === "oauth"
                        ? t("intervalsIcu.oauthAuthMode")
                        : t("intervalsIcu.apiKeyAuthMode")}
                    </Badge>
                  </div>
                  <div className="min-w-0 break-words">
                    {status.authType === "oauth"
                      ? t("intervalsIcu.oauthAthlete", {
                          name:
                            status.oauthAthleteName ??
                            status.externalAthleteId ??
                            "----",
                        })
                      : t("intervalsIcu.keyEnding", {
                          last4: status.credentialLast4 ?? "----",
                        })}
                  </div>
                  <div className="min-w-0 break-words">
                    {t("intervalsIcu.lastSync")}:{" "}
                    {lastSync ?? t("intervalsIcu.neverSynced")}
                  </div>
                  <div className="flex min-w-0 items-center">
                    <Badge variant="secondary" className="shrink-0">
                      {t("connected")}
                    </Badge>
                  </div>
                </div>
                {status.lastError ? (
                  <div className="mt-2 break-words text-destructive">
                    {t("syncError")}
                  </div>
                ) : null}
              </div>
            ) : null}
            {oauthEnabled ? (
              <Tabs
                value={authMode}
                onValueChange={(value) => {
                  const nextAuthMode = value as IntervalsIcuAuthMode;
                  setAuthMode(nextAuthMode);
                  if (connected && nextAuthMode !== activeAuthMode) {
                    setImmediateSync(true);
                  }
                }}
                className="min-w-0 w-full"
              >
                <TabsList className="grid min-w-0 w-full grid-cols-2">
                  <TabsTrigger value="oauth" className="min-w-0 px-2 sm:px-3">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {t("intervalsIcu.oauthTab")}
                  </TabsTrigger>
                  <TabsTrigger value="api_key" className="min-w-0 px-2 sm:px-3">
                    <KeyRound className="mr-2 h-4 w-4" />
                    {t("intervalsIcu.apiKeyTab")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="oauth" className="space-y-2">
                  {!viewingCurrentAuthMode ? (
                    <div className="rounded-md border border-border/70 bg-muted/25 p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="min-w-0 space-y-1">
                          <div className="break-words font-medium">
                            {t("intervalsIcu.oauthTitle")}
                          </div>
                          <p className="break-words text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                            {t("intervalsIcu.oauthHelp")}
                          </p>
                          {connected && status.authType === "api_key" ? (
                            <p className="break-words text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                              {t("intervalsIcu.oauthReplaceApiKeyHint")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>
                <TabsContent value="api_key" className="space-y-2">
                  {apiKeyFields}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-2">{apiKeyFields}</div>
            )}
            <ThirdPartySyncOptions
              options={[
                ...(showInitialSyncOption
                  ? [
                      {
                        id: "import-recent-activities",
                        label: t("intervalsIcu.syncActivities"),
                        description: t("intervalsIcu.syncActivitiesHelp"),
                        checked: immediateSync,
                        onCheckedChange: setImmediateSync,
                        disabled: busy,
                      },
                    ]
                  : []),
                {
                  id: "import-activities",
                  label: t("intervalsIcu.syncScheduledActivities"),
                  description: t("intervalsIcu.syncScheduledActivitiesHelp"),
                  checked: syncScheduledActivities,
                  onCheckedChange: setSyncScheduledActivities,
                  disabled: busy,
                },
                {
                  id: "export-activities",
                  label: t("intervalsIcu.exportActivities"),
                  description: t("intervalsIcu.exportActivitiesHelp"),
                  checked: exportActivities,
                  onCheckedChange: setExportActivities,
                  disabled: busy,
                },
                {
                  id: "import-planned-workouts",
                  label: t("intervalsIcu.syncPlannedWorkouts"),
                  description: t("intervalsIcu.syncPlannedWorkoutsHelp"),
                  checked: syncPlannedWorkouts,
                  onCheckedChange: setSyncPlannedWorkouts,
                  disabled: !intervalsIcuPlannedWorkoutSyncEnabled || busy,
                },
                {
                  id: "export-planned-workouts",
                  label: t("intervalsIcu.exportPlannedWorkouts"),
                  description: t("intervalsIcu.exportPlannedWorkoutsHelp"),
                  checked: exportPlannedWorkouts,
                  onCheckedChange: setExportPlannedWorkouts,
                  disabled: !intervalsIcuPlannedWorkoutSyncEnabled || busy,
                },
                {
                  id: "import-wellness",
                  label: t("intervalsIcu.syncWellness"),
                  description: t("intervalsIcu.syncWellnessHelp"),
                  checked: syncWellness,
                  onCheckedChange: setSyncWellness,
                  disabled: busy,
                },
                {
                  id: "import-athlete-profile",
                  label: t("intervalsIcu.syncSportSettings"),
                  description: t("intervalsIcu.syncSportSettingsHelp"),
                  checked: syncSportSettings,
                  onCheckedChange: setSyncSportSettings,
                  disabled: busy,
                },
              ]}
            />
          </div>
          <AdaptiveDialogFooter
            className={cn(adaptiveDialogFooterActionsClassName, "flex-wrap")}
          >
            {viewingCurrentAuthMode ? (
              <>
                {showSettingsAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="dialog-action"
                    className={cn(
                      adaptiveDialogFooterActionButtonClassName,
                      "whitespace-normal text-center leading-tight",
                    )}
                    onClick={handleSaveSettings}
                    disabled={busy}
                  >
                    {busyAction === "settings"
                      ? t("intervalsIcu.savingSettings")
                      : t("intervalsIcu.saveSettings")}
                  </Button>
                ) : null}
                {showDisconnect ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="dialog-action"
                    className={cn(
                      adaptiveDialogFooterActionButtonClassName,
                      "whitespace-normal text-center leading-tight",
                    )}
                    onClick={requestDisconnect}
                    disabled={busy}
                  >
                    {activeAuthMode === "oauth"
                      ? t("intervalsIcu.disconnectOAuth")
                      : t("intervalsIcu.disconnectApiKey")}
                  </Button>
                ) : null}
              </>
            ) : null}
            {showAuthAction ? (
              <Button
                type="button"
                size="dialog-action"
                className={cn(
                  adaptiveDialogFooterActionButtonClassName,
                  "whitespace-normal text-center leading-tight",
                )}
                onClick={
                  authMode === "oauth"
                    ? handleStartOAuth
                    : handleConnectWithApiKey
                }
                disabled={busy}
              >
                {busy
                  ? t("connecting")
                  : authMode === "oauth"
                    ? t("connectProvider", { provider: "Intervals.icu" })
                    : t("intervalsIcu.connectWithApiKey")}
              </Button>
            ) : null}
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>

      <AdaptiveDialog
        open={Boolean(pendingSave)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) setPendingSave(null);
        }}
      >
        <AdaptiveDialogContent desktopClassName="sm:max-w-md">
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>
              {t("intervalsIcu.replaceKeyConfirmTitle")}
            </AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              {t("intervalsIcu.replaceKeyConfirmDescription")}
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <AdaptiveDialogFooter
            className={adaptiveDialogFooterActionsClassName}
          >
            <Button
              type="button"
              variant="outline"
              size="dialog-action"
              className={adaptiveDialogFooterActionButtonClassName}
              onClick={() => setPendingSave(null)}
              disabled={busy}
            >
              {t("intervalsIcu.replaceKeyCancel")}
            </Button>
            <Button
              type="button"
              size="dialog-action"
              className={adaptiveDialogFooterActionButtonClassName}
              onClick={confirmApiKeyReplacement}
              disabled={busy}
            >
              {busyAction === "connect"
                ? t("connecting")
                : t("intervalsIcu.replaceKeyConfirmAction")}
            </Button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>

      <AdaptiveDialog
        open={confirmDisconnectOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) setConfirmDisconnectOpen(false);
        }}
      >
        <AdaptiveDialogContent desktopClassName="sm:max-w-md">
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>
              {t("disconnectConfirmTitle", { provider: "Intervals.icu" })}
            </AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              {t("disconnectConfirmDescription", {
                provider: "Intervals.icu",
              })}
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <AdaptiveDialogFooter
            className={adaptiveDialogFooterActionsClassName}
          >
            <Button
              type="button"
              variant="outline"
              size="dialog-action"
              className={adaptiveDialogFooterActionButtonClassName}
              onClick={() => setConfirmDisconnectOpen(false)}
              disabled={busy}
            >
              {t("disconnectConfirmCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="dialog-action"
              className={adaptiveDialogFooterActionButtonClassName}
              onClick={confirmDisconnect}
              disabled={busy}
            >
              {busyAction === "disconnect"
                ? t("disconnecting")
                : t("disconnectConfirmAction")}
            </Button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </>
  );
}
