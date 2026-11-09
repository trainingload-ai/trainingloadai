"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type {
  PersonalProvider,
  PersonalRegion,
  PersonalSettings,
} from "@shared/personal-integrations";
import {
  personalRequest,
  usePersonalConnection,
} from "@/api/personal-integrations";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  adaptiveDialogFooterActionsClassName,
  adaptiveDialogFooterActionButtonClassName,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiFetchError } from "@/lib/api";
import { toast } from "sonner";
import { invalidateAfterActivityImportComplete } from "@/lib/query-invalidation";


function personalJobStatusMessageKey(job: {
  kind: string;
  status: string;
  errorCode?: string | null;
}): `states.${string}` {
  // Parent SYNC checkpoints to WAITING while discovering/downloading children
  // (errorCode cleared). That is progress, not a failure backoff.
  if (job.status === "WAITING" && job.kind === "SYNC" && !job.errorCode) {
    return "states.SYNCING_ACTIVITIES";
  }
  return `states.${job.status}`;
}

function personalSyncMechanismKey(
  trigger?: string | null,
): "mechanisms.first_connect" | "mechanisms.automatic" | "mechanisms.manual" {
  if (trigger === "first_connect") return "mechanisms.first_connect";
  if (trigger === "focus" || trigger === "dawn") return "mechanisms.automatic";
  return "mechanisms.manual";
}

export function PersonalConnectionDialog({
  provider,
  open,
  onOpenChange,
  returnUrl,
}: {
  provider: PersonalProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Keep query params (e.g. onboarding step=import) across COROS OAuth. */
  returnUrl?: string;
}) {
  const t = useTranslations("PersonalIntegrations");
  const sharedT = useTranslations("SharedUI");
  const query = usePersonalConnection(provider, open);
  const cache = useQueryClient();
  const [region, setRegion] = useState<PersonalRegion>(
    provider === "garmin" ? "global" : "us",
  );
  const [settings, setSettings] = useState<PersonalSettings>({
    automatic: true,
    activities: true,
    wellness: false,
    allowWrites: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [apiKey, setApiKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [disconnecting, setDisconnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const hydrated = useRef(false);
  const completed = useRef(
    new Map<string, { status: string; imported: number; healthDays: number }>(),
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("personalProvider") !== provider) return;
    const result = url.searchParams.get("personalResult");
    if (result === "connected") setNotice(t("connected"));
    else if (result)
      setError(
        t.has(`errors.${result}`)
          ? t(`errors.${result}` as never)
          : t("requestFailed"),
      );
    url.searchParams.delete("personalProvider");
    url.searchParams.delete("personalResult");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [provider, t]);
  useEffect(() => {
    if (
      !hydrated.current &&
      query.data &&
      query.data.state !== "NOT_CONNECTED"
    ) {
      setSettings(query.data.settings);
      setRegion(query.data.region!);
      hydrated.current = true;
    }
    let imported = false;
    for (const job of query.data?.jobs ?? []) {
      const previous = completed.current.get(job.id);
      const importedCount = Number(job.result?.imported ?? 0);
      const healthDays = Number(job.result?.healthDays ?? 0);
      if (
        job.kind === "SYNC" &&
        ((previous &&
          previous.status !== "SUCCEEDED" &&
          job.status === "SUCCEEDED") ||
          importedCount !== (previous?.imported ?? 0) ||
          healthDays !== (previous?.healthDays ?? 0))
      )
        imported = true;
      completed.current.set(job.id, {
        status: job.status,
        imported: importedCount,
        healthDays,
      });
    }
    if (imported) void invalidateAfterActivityImportComplete(cache);
  }, [query.data, cache]);
  const run = async (work: () => Promise<void>, opts?: { successToast?: string }) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await query.refetch();
      if (opts?.successToast) toast.success(opts.successToast);
    } catch (cause) {
      const code = cause instanceof ApiFetchError ? cause.errorCode : "";
      const message = t.has(`errors.${code}`)
        ? t(`errors.${code}` as never)
        : t("requestFailed");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };
  const connected = query.data?.connected === true && !reconnecting;
  const settingsDirty =
    connected &&
    query.data &&
    (
      ["automatic", "activities", "wellness", "allowWrites"] as const
    ).some((key) => settings[key] !== query.data!.settings[key]);
  const submit = () =>
    run(
      async () => {
        if (provider === "garmin") {
          await personalRequest(provider, "/connect", {
            apiKey,
            region,
            settings,
            confirmed,
          });
          setApiKey("");
          setNotice(t("connected"));
          hydrated.current = false;
          setReconnecting(false);
        } else {
          const result = await personalRequest<{ authorizationUrl: string }>(
            provider,
            "/oauth/start",
            {
              region,
              settings,
              confirmed,
              returnUrl:
                returnUrl ??
                `${window.location.origin}${window.location.pathname}`,
            },
          );
          window.location.assign(result.authorizationUrl);
        }
      },
      { successToast: t("connected") },
    );
  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
    >
      <AdaptiveDialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg pc:p-0">
        <AdaptiveDialogHeader className="shrink-0 space-y-0 gap-2 px-5 py-5 text-left pc:px-6">
          <AdaptiveDialogTitle>{t(`${provider}.title`)}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            {t(`${provider}.description`)}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <div
          data-personal-connection-body
          className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain break-words px-5 pb-5 text-sm pc:px-6"
        >
          {query.isPending && <p role="status">{t("loading")}</p>}
          {(error || query.error) && (
            <p role="alert" className="text-destructive">
              {error || t("requestFailed")}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {query.data?.errorCode && (
            <p className="text-destructive">
              {t.has(`errors.${query.data.errorCode}`)
                ? t(`errors.${query.data.errorCode}` as never)
                : t("requestFailed")}
            </p>
          )}
          {connected && (
            <p>
              {t("account", { id: query.data?.accountId ?? "" })}
              {query.data?.lastSyncCompletedAt
                ? ` · ${t("lastSync", { date: new Date(query.data.lastSyncCompletedAt).toLocaleString() })}`
                : ""}
            </p>
          )}
          <fieldset disabled={busy} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor={`${provider}-region`}>{t("region")}</Label>
              <Select
                value={region}
                onValueChange={(value) => setRegion(value as PersonalRegion)}
                disabled={connected}
              >
                <SelectTrigger
                  id={`${provider}-region`}
                  aria-label={t("region")}
                  className="w-full bg-background shadow-none dark:bg-black/20"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(provider === "garmin"
                    ? (["global", "cn"] as const)
                    : (["us", "eu", "cn"] as const)
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`regions.${value}` as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("regionHint")}</p>
            </div>
            <div className="space-y-3">
              {(
                [
                  "automatic",
                  "activities",
                  "wellness",
                  ...(provider === "coros" ? ["allowWrites"] : []),
                ] as Array<keyof Omit<PersonalSettings, "timezone">>
              ).map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4"
                >
                  <Label htmlFor={`${provider}-${key}`}>
                    {t(`settings.${key}`)}
                  </Label>
                  <Switch
                    id={`${provider}-${key}`}
                    checked={settings[key]}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, [key]: checked })
                    }
                  />
                </div>
              ))}
            </div>
            {!connected && (
              <>
                {provider === "garmin" && (
                  <div className="space-y-2">
                    <Label htmlFor="garmin-personal-key">
                      {t("garmin.apiKey")}
                    </Label>
                    <Input
                      id="garmin-personal-key"
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <a
                      className="inline-block text-xs text-muted-foreground underline underline-offset-4"
                      target="_blank"
                      rel="noreferrer"
                      href={
                        region === "cn"
                          ? "https://connect.garmin.cn/app/settings/personalApiToken"
                          : "https://connect.garmin.com/app/settings/personalApiToken"
                      }
                    >
                      {t("garmin.createKey")}
                    </a>
                  </div>
                )}
                {query.data &&
                  !["NOT_CONNECTED", "DISCONNECTED"].includes(
                    query.data.state,
                  ) && (
                    <Label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      {t("replaceConfirm")}
                    </Label>
                  )}
              </>
            )}
          </fieldset>
          {connected && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setReconnecting(true);
                  setConfirmed(false);
                }}
              >
                {t("reconnect")}
              </Button>
              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="font-semibold">{t("syncTitle")}</h3>
                <p className="text-muted-foreground">{t(provider === "garmin" ? "garminSyncHint" : "syncHint")}</p>
                <div className="flex items-center gap-2">
                  <DatePickerWithRange
                    className="min-w-0 flex-1"
                    popoverModal
                    startNewRangeOnOpen
                    date={dateRange}
                    onDateChange={setDateRange}
                  />
                  <Button
                    className="shrink-0"
                    disabled={
                      busy ||
                      settingsDirty ||
                      (!settings.activities && !settings.wellness)
                    }
                    onClick={() =>
                      run(
                        async () => {
                          const startDate = dateRange?.from
                            ? format(dateRange.from, "yyyy-MM-dd")
                            : undefined;
                          const endDate = dateRange?.to
                            ? format(dateRange.to, "yyyy-MM-dd")
                            : undefined;
                          await personalRequest(provider, "/sync", {
                            ...(startDate ? { startDate } : {}),
                            ...(endDate ? { endDate } : {}),
                            requestId: crypto.randomUUID(),
                          });
                          setNotice(t("queued"));
                        },
                        { successToast: t("syncSuccess") },
                      )
                    }
                  >
                    {t("sync")}
                  </Button>
                </div>
                {settingsDirty && (
                  <p className="text-xs text-muted-foreground">
                    {t("saveBeforeSync")}
                  </p>
                )}
                <ul className="space-y-2" aria-label={t("jobs")}>
                  {query.data?.jobs.slice(0, 2).map((job) => {
                    const statusKey = personalJobStatusMessageKey(job);
                    const mechanismKey =
                      job.kind === "SYNC"
                        ? personalSyncMechanismKey(job.trigger)
                        : null;
                    return (
                    <li key={job.id} className="rounded-md bg-muted p-3">
                      <div className="flex justify-between gap-2">
                        <span>
                          {t(job.kind === "WRITE" ? "delivery" : "syncTitle")}
                          {mechanismKey ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {t(mechanismKey)}
                            </span>
                          ) : null}
                        </span>
                        <span>
                          {t.has(statusKey) ? t(statusKey as never) : job.status}
                        </span>
                      </div>
                      {job.kind === "SYNC" &&
                        typeof job.startDate === "string" &&
                        typeof job.endDate === "string" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("jobRange", {
                              startDate: job.startDate,
                              endDate: job.endDate,
                            })}
                          </p>
                        )}
                      {job.errorCode && (
                        <p className="text-destructive">
                          {t.has(`errors.${job.errorCode}`)
                            ? t(`errors.${job.errorCode}` as never)
                            : t("requestFailed")}
                        </p>
                      )}
                      {job.result && job.kind === "SYNC" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("counts", {
                            discovered: Number(job.result.discovered ?? 0),
                            downloading: Number(job.result.downloading ?? 0),
                            importing: Number(job.result.importing ?? 0),
                            imported: Number(job.result.imported ?? 0),
                            failed: Number(job.result.failed ?? 0),
                            healthDays: Number(job.result.healthDays ?? 0),
                          })}
                        </p>
                      )}
                      {job.status === "WAITING" &&
                        (job.errorCode || statusKey === "states.WAITING") && (
                        <p className="text-xs text-muted-foreground">
                          {t("retryAt", {
                            date: new Date(job.nextAttemptAt).toLocaleString(),
                          })}
                        </p>
                      )}
                      {job.kind === "WRITE" && job.status === "UNKNOWN" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await personalRequest(
                                provider,
                                `/operations/${job.id}/reconcile`,
                                {},
                              );
                              setNotice(t("reconcileHint"));
                            })
                          }
                        >
                          {t("reconcile")}
                        </Button>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  {t("disconnectHint")}
                </p>
                {disconnecting ? (
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await personalRequest<{
                            revoked: boolean;
                          }>(provider, "/disconnect", undefined, "DELETE");
                          hydrated.current = false;
                          setDisconnecting(false);
                          setNotice(
                            t(
                              result.revoked
                                ? "disconnected"
                                : "revokeManually",
                            ),
                          );
                        })
                      }
                    >
                      {t("confirmDisconnect")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDisconnecting(false)}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setDisconnecting(true)}
                  >
                    {t("disconnect")}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
        <AdaptiveDialogFooter
          data-personal-connection-footer
          style={{
            paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
          }}
          className={
            adaptiveDialogFooterActionsClassName +
            " m-0 shrink-0 border-t border-border bg-background px-5 py-4 pc:px-6"
          }
        >
          <Button
            type="button"
            variant="outline"
            size="dialog-action"
            className={adaptiveDialogFooterActionButtonClassName}
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {sharedT("close")}
          </Button>
          <Button
            type="button"
            size="dialog-action"
            className={adaptiveDialogFooterActionButtonClassName}
            disabled={
              busy ||
              query.isPending ||
              (!connected && provider === "garmin" && !apiKey) ||
              (!connected &&
                Boolean(query.data && query.data.state !== "NOT_CONNECTED") &&
                !confirmed)
            }
            onClick={
              connected
                ? () =>
                    run(async () => {
                      await personalRequest(
                        provider,
                        "/settings",
                        settings,
                        "PATCH",
                      );
                      setNotice(t("saved"));
                    })
                : submit
            }
          >
            {busy
              ? t("working")
              : connected
                ? t("save")
                : t(provider === "garmin" ? "connect" : "authorize")}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
