"use client";

import {
  ArrowRight,
  Bell,
  Bike,
  CheckCircle2,
  Database,
  Footprints,
  HeartPulse,
  LockKeyhole,
  Settings,
  ShieldCheck,
  Target,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { useActivePlan } from "@/api/usePlans";
import { getUserSettings, PUBLIC_DEMO_USER_SETTINGS } from "@/api/settings";
import { useAuthAccounts } from "@/hooks/useAuthAccounts";
import { useUserBasicInfo, useUserProfile } from "@/hooks/useUserProfile";
import { MainScrollPageShell } from "@/components/layout/MainScrollPageShell";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { queryKeys } from "@/lib/query-keys";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { Link } from "@/i18n/navigation";

type TranslateFn = ReturnType<typeof useTranslations>;

function formatPace(paceSeconds?: number | null) {
  if (!paceSeconds || !Number.isFinite(paceSeconds) || paceSeconds <= 0) {
    return "--";
  }
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function toDisplayProvider(provider: string) {
  if (!provider) return "Unknown";
  if (provider === "credential") return "Credential";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-surface bg-muted/45 ${className}`}>
      {children}
    </section>
  );
}

function SectionTitle({
  title,
  action,
  actionHref,
}: {
  title: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action && actionHref ? (
        <Link
          href={actionHref}
          className="flex min-h-8 items-center gap-1 text-mobile-caption font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pc:text-xs"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

export function MeDesktopDashboard() {
  const t = useTranslations("V2MePage");
  useSetPageTitle(t("header.badge"));
  const session = useViewerSession();
  const publicDemo = usePublicDemo();
  const { data: activePlan } = useActivePlan();
  const settingsQuery = useQuery({
    queryKey: queryKeys.me.userSettings(),
    queryFn: () => getUserSettings(),
    enabled: !publicDemo.active,
  });
  const userSettings = publicDemo.active
    ? PUBLIC_DEMO_USER_SETTINGS
    : settingsQuery.data;
  const { data: accounts } = useAuthAccounts();
  const { ftp, lthr } = useUserBasicInfo();
  const { data: profile } = useUserProfile();
  const zones = useMemo(
    () => [
      {
        name: t("zones.runThresholdPace"),
        value: formatPace(profile?.aerobicThresholdPaceSec ?? null),
      },
      {
        name: t("zones.cyclingFtp"),
        value: ftp ? `${Math.round(ftp)}w` : "--",
      },
      {
        name: t("zones.thresholdHr"),
        value: lthr ? `${Math.round(lthr)} bpm` : "--",
      },
    ],
    [ftp, lthr, profile?.aerobicThresholdPaceSec, t],
  );

  const connections = useMemo(() => {
    const linkedProviders = new Set(
      (accounts ?? [])
        .map((account) => account.provider)
        .filter((provider): provider is string => Boolean(provider)),
    );
    const linkedRows = [...linkedProviders].map((provider) => ({
      name: toDisplayProvider(provider),
      status: t("connections.connected"),
      icon: Database,
    }));

    return [
      ...linkedRows,
      {
        name: t("connections.upload"),
        status: t("connections.available"),
        icon: Database,
      },
    ];
  }, [accounts, t]);

  const goalName = activePlan?.plan?.title ?? t("goal.name");
  const goalDescription = activePlan?.plan
    ? `${activePlan.plan.periodWeeks}w · W${(activePlan.plan.currentWeekIndex ?? 0) + 1} · ${activePlan.plan.status}`
    : t("goal.description");
  const userTitle = session.data?.user?.name ?? t("header.badge");

  return (
    <MainScrollPageShell className="flex flex-col gap-3 pb-3 pc:gap-4">
      <header className="rounded-surface bg-muted/45 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-mobile-caption pc:text-xs text-muted-foreground">
              {t("header.badge")}
            </div>
            <h1 className="mt-1 text-xl font-semibold pc:text-2xl">
              {userTitle}
            </h1>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {session.data?.user?.email ?? t("header.description")}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 pc:grid pc:grid-cols-[minmax(0,1fr)_320px] pc:items-start pc:gap-4">
        <div className="order-1 min-w-0 pc:col-start-2 pc:row-start-1 pc:order-none">
          <Panel className="p-4">
            <SectionTitle
              title={t("platformConnections.title")}
              action={t("platformConnections.manage")}
              actionHref="/account#connections"
            />
            <div className="space-y-2">
              {connections.map((connection) => {
                const Icon = connection.icon;

                return (
                  <div
                    key={connection.name}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {connection.name}
                    </span>
                    <span className="text-mobile-caption pc:text-xs text-muted-foreground">
                      {connection.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="order-2 min-w-0 pc:col-start-2 pc:row-start-2 pc:order-none">
          <Panel className="p-4">
            <SectionTitle title={t("privacy.title")} />
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                {t("privacy.defaultPrivate")}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
                <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                {t("privacy.deletable")}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                {t("privacy.aiScope")}
              </div>
            </div>
          </Panel>
        </div>

        <div className="order-3 min-w-0 pc:col-start-2 pc:row-start-3 pc:order-none">
          <Panel className="p-4">
            <SectionTitle title={t("settings.title")} />
            <div className="space-y-2 text-sm">
              <Link
                href="/settings"
                className="flex min-h-10 w-full items-center justify-between rounded-md bg-muted/35 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  {t("settings.trainingReminder")} · {profile?.timezone ?? "--"}
                </span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </Link>
              <Link
                href="/settings"
                className="flex min-h-10 w-full items-center justify-between rounded-md bg-muted/35 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-muted-foreground" />
                  {t("settings.recoveryReminder")} ·{" "}
                  {session.data?.user?.email ?? "--"}
                </span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </Link>
              <Link
                href="/settings"
                className="flex min-h-10 w-full items-center justify-between rounded-md bg-muted/35 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  {t("settings.unitsAndDisplay")} ·{" "}
                  {userSettings?.UNIT_SYSTEM ?? "--"}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </Panel>
        </div>

        <main className="order-4 flex min-w-0 flex-col gap-3 pc:col-start-1 pc:row-span-3 pc:row-start-1 pc:order-none pc:gap-4">
          <Panel className="p-4">
            <SectionTitle
              title={t("goal.title")}
              action={t("goal.edit")}
              actionHref={activePlan?.plan ? "/plan" : "/plans"}
            />
            <div className="rounded-control-lg bg-background/70 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-brand-soft p-2 text-brand-foreground">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">{goalName}</h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {goalDescription}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle
              title={t("trainingZones.title")}
              action={t("trainingZones.manage")}
              actionHref="/account#zones"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              {zones.map((zone) => (
                <div
                  key={zone.name}
                  className="rounded-md bg-neutral-100 dark:bg-muted/45 p-3"
                >
                  <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                    {zone.name}
                  </div>
                  <div className="mt-1 text-lg font-semibold">{zone.value}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle
              title={t("preferences.title")}
              action={t("preferences.adjust")}
              actionHref="/account#profile"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-background/70 p-3">
                <Footprints className="h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-sm font-semibold">
                  {t("preferences.runFirst.title")}
                </div>
                <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  {profile?.type ?? t("preferences.runFirst.description")}
                </p>
              </div>
              <div className="rounded-md bg-background/70 p-3">
                <Bike className="h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-sm font-semibold">
                  {t("preferences.cycleSupport.title")}
                </div>
                <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                  {profile?.loadSources?.length
                    ? profile.loadSources.join(" -> ")
                    : t("preferences.cycleSupport.description")}
                </p>
              </div>
            </div>
          </Panel>
        </main>
      </div>
    </MainScrollPageShell>
  );
}
