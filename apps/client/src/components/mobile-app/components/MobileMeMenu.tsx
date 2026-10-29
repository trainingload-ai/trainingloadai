"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity,
  Bell,
  Check,
  ChevronLeft,
  Clock3,
  Languages,
  LineChart,
  Link2,
  MessageSquareText,
  RefreshCw,
  Ruler,
  SlidersHorizontal,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import { updatePreferredLocale } from "@/api/settings";
import {
  DeploymentAccountNavigation,
  MobileConnectionsPanel,
} from "@deployment/managed-ui";
import { localeNativeLabel, routing, type Locale } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";
import { persistLocalePreference } from "@/lib/locale-preference";
import {
  useStore,
  type ChartXaxis,
  type PowerUnit,
  type Theme,
  type TimeFormat,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { MobileButtonRow, MobileGroupedList } from "./MobileGroupedList";
import { MobileMeActivitiesPanel } from "./MobileMeActivityFeed";
import {
  MobileAutoUpdatePanel,
  MobileReviewAutomationPanel,
} from "./MobileMeAutomationPanels";
import { MobileNotificationsPanel } from "./MobileMeNotificationsPanel";
import { MobileBestDistancePanel } from "./MobileMeBestDistancePanel";
import { MobileProfilePanel } from "./MobileMeProfilePanel";
import { MobileZonesPanel } from "./MobileMeZonesPanel";
import {
  MobileNicknamePanel,
} from "./MobileMeAccountPanels";
import { MobileAccountSettingsPanel, MobileEmailPanel, MobilePasswordPanel } from "@deployment/managed-ui";
import { MobilePage } from "./MobilePage";
import { MobilePushSidePage } from "./MobilePushSidePage";
import { MobileTopBarAction } from "./MobileTopBar";
import { MobileSheet } from "./MobileSheet";
import { APP_VERSION } from "@/utils/version";

type Panel =
  | "account"
  | "account-settings"
  | "account-nickname"
  | "account-email"
  | "account-password"
  | "personal-info"
  | "zones"
  | "notifications"
  | "connections"
  | "auto-update"
  | "review-automation"
  | "activities"
  | "best-distance";
type Preference =
  | "theme"
  | "language"
  | "unit-system"
  | "power-unit"
  | "chart-xaxis"
  | "time-format";
type PreferenceOption = { label: string; value: string };

function BackButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <MobileTopBarAction aria-label={label} onClick={onClick} className="-ml-1">
      <ChevronLeft className="size-6" aria-hidden="true" />
    </MobileTopBarAction>
  );
}

export function MobileMeMenu({
  open,
  onOpenChange,
  signingOut,
  showSignOut = true,
  signOutDisabled = false,
  onSignOut,
  unreadCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signingOut: boolean;
  showSignOut?: boolean;
  signOutDisabled?: boolean;
  onSignOut: () => void;
  unreadCount: number;
}) {
  const t = useTranslations("V2MePage");
  const tabsT = useTranslations("MobileApp.tabs");
  const settingsT = useTranslations("settings");
  const accountT = useTranslations("AccountPage");
  const accountInnerT = useTranslations("AccountInner");
  const profileT = useTranslations("UserProfile");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { setTheme: applyTheme } = useTheme();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [preference, setPreference] = useState<Preference | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);
  const {
    systemUnit,
    powerUnit,
    chartXaxis,
    timeFormat,
    theme,
    updateSetting,
    loadSettings,
  } = useStore();

  useEffect(() => {
    if (open) void loadSettings();
  }, [loadSettings, open]);

  const panelTitle: Record<Panel, string> = {
    account: t("mobile.account.profile"),
    "account-settings": accountT("innerTitle"),
    "account-nickname": accountInnerT("name.label"),
    "account-email": accountInnerT("email.label"),
    "account-password": accountInnerT("password.label"),
    "personal-info": profileT("title"),
    zones: t("trainingZones.title"),
    notifications: t("mobile.account.notifications"),
    connections: t("mobile.account.connections"),
    "auto-update": t("mobile.account.autoUpdate"),
    "review-automation": t("mobile.account.reviewAutomation"),
    activities: t("mobile.account.activities"),
    "best-distance": t("mobile.account.bestDistance"),
  };

  const currentPreferenceValue: Record<Preference, string> = {
    theme,
    language: locale,
    "unit-system": systemUnit,
    "power-unit": powerUnit,
    "chart-xaxis": chartXaxis,
    "time-format": timeFormat,
  };
  const preferenceTitles: Record<Preference, string> = {
    theme: settingsT("theme"),
    language: settingsT("language"),
    "unit-system": settingsT("unitSystem"),
    "power-unit": settingsT("powerUnit"),
    "chart-xaxis": settingsT("chartXaxis"),
    "time-format": settingsT("timeFormat"),
  };
  const preferenceOptions = useMemo<Record<Preference, PreferenceOption[]>>(
    () => ({
      theme: [
        { value: "light", label: settingsT("light") },
        { value: "dark", label: settingsT("dark") },
        { value: "system", label: settingsT("system") },
      ],
      language: routing.locales.map((value) => ({
        value,
        label: localeNativeLabel(value),
      })),
      "unit-system": [
        { value: "metric", label: settingsT("metric") },
        { value: "imperial", label: settingsT("imperial") },
      ],
      "power-unit": [
        { value: "watts", label: settingsT("watts") },
        { value: "watts_per_kg", label: settingsT("wattsPerKilogram") },
      ],
      "chart-xaxis": [
        { value: "distance", label: settingsT("chartXaxisDistance") },
        { value: "time", label: settingsT("chartXaxisTime") },
      ],
      "time-format": [
        { value: "24h", label: settingsT("timeFormat24h") },
        { value: "12h", label: settingsT("timeFormat12h") },
      ],
    }),
    [settingsT],
  );

  const preferenceValueLabel = (key: Preference) =>
    preferenceOptions[key].find(
      (option) => option.value === currentPreferenceValue[key],
    )?.label;

  const selectPreference = async (value: string) => {
    if (!preference || savingPreference) return;
    setSavingPreference(true);
    try {
      if (preference === "language") {
        const nextLocale = value as Locale;
        persistLocalePreference(nextLocale);
        void updatePreferredLocale(nextLocale).catch(() => undefined);
        router.replace(
          // @ts-expect-error the active localized route owns these params
          { pathname, params },
          { locale: nextLocale },
        );
      } else {
        const category = preference.replaceAll("-", "_");
        await updateSetting(category, value);
        if (preference === "theme") applyTheme(value as Theme);
      }
      setPreference(null);
    } finally {
      setSavingPreference(false);
    }
  };

  const panelContent: Partial<Record<Panel, ReactNode>> = {
    "personal-info": <MobileProfilePanel />,
    zones: <MobileZonesPanel />,
    notifications: <MobileNotificationsPanel />,
    connections: <MobileConnectionsPanel />,
    "auto-update": <MobileAutoUpdatePanel />,
    "review-automation": <MobileReviewAutomationPanel />,
    "best-distance": <MobileBestDistancePanel />,
  };

  return (
    <>
      <MobilePushSidePage
        open={open}
        onOpenChange={onOpenChange}
        className="bg-muted"
      >
        <MobilePage className="space-y-7 px-0 pb-6">
          <h1 className="px-1 pt-1 text-3xl font-semibold">{tabsT("me")}</h1>
          <MobileGroupedList title={t("mobile.account.title")}>
            <MobileButtonRow
              icon={<User />}
              label={t("mobile.account.profile")}
              onClick={() => setPanel("account")}
            />
            <DeploymentAccountNavigation />
            <MobileButtonRow
              icon={<Bell />}
              label={t("mobile.account.notifications")}
              value={
                unreadCount > 0 ? (
                  <span className="block size-2.5 rounded-full bg-red-500" />
                ) : undefined
              }
              onClick={() => setPanel("notifications")}
            />
            <MobileButtonRow
              icon={<Link2 />}
              label={t("mobile.account.connections")}
              onClick={() => setPanel("connections")}
            />
            <MobileButtonRow
              icon={<RefreshCw />}
              label={t("mobile.account.autoUpdate")}
              onClick={() => setPanel("auto-update")}
            />
            <MobileButtonRow
              icon={<MessageSquareText />}
              label={t("mobile.account.reviewAutomation")}
              onClick={() => setPanel("review-automation")}
            />
            <MobileButtonRow
              icon={<Activity />}
              label={t("mobile.account.activities")}
              onClick={() => setPanel("activities")}
            />
            <MobileButtonRow
              icon={<Trophy />}
              label={t("mobile.account.bestDistance")}
              onClick={() => setPanel("best-distance")}
            />
          </MobileGroupedList>

          <MobileGroupedList title={t("mobile.settings.title")}>
            <MobileButtonRow
              icon={<SlidersHorizontal />}
              label={t("mobile.settings.theme")}
              value={preferenceValueLabel("theme")}
              onClick={() => setPreference("theme")}
            />
            <MobileButtonRow
              icon={<Languages />}
              label={t("mobile.settings.language")}
              value={preferenceValueLabel("language")}
              onClick={() => setPreference("language")}
            />
            <MobileButtonRow
              icon={<Ruler />}
              label={t("mobile.settings.units")}
              value={preferenceValueLabel("unit-system")}
              onClick={() => setPreference("unit-system")}
            />
            <MobileButtonRow
              icon={<Zap />}
              label={t("mobile.settings.powerUnit")}
              value={preferenceValueLabel("power-unit")}
              onClick={() => setPreference("power-unit")}
            />
            <MobileButtonRow
              icon={<LineChart />}
              label={t("mobile.settings.chartAxis")}
              value={preferenceValueLabel("chart-xaxis")}
              onClick={() => setPreference("chart-xaxis")}
            />
            <MobileButtonRow
              icon={<Clock3 />}
              label={t("mobile.settings.timeFormat")}
              value={preferenceValueLabel("time-format")}
              onClick={() => setPreference("time-format")}
            />
          </MobileGroupedList>

          {showSignOut ? (
            <MobileGroupedList>
              <MobileButtonRow
                label={
                  signingOut ? t("mobile.signingOut") : t("mobile.signOut")
                }
                disabled={signOutDisabled || signingOut}
                destructive
                onClick={onSignOut}
              />
            </MobileGroupedList>
          ) : null}

          <footer className="space-y-2 px-4 text-center text-mobile-caption text-muted-foreground">
            <p>{t("mobile.version", { version: APP_VERSION })}</p>
            <a
              href="mailto:support@trainingload.ai?subject=Trainingload.ai%20support"
              className="inline-flex min-h-11 items-center underline underline-offset-2"
            >
              {t("mobile.support")} · support@trainingload.ai
            </a>
          </footer>
        </MobilePage>
      </MobilePushSidePage>

      <MobileSheet
        open={panel != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPanel(null);
        }}
        backgroundVariant="grouped"
        fullScreen
        title={panel ? panelTitle[panel] : ""}
        leading={
          panel &&
          ["account-nickname", "account-email", "account-password"].includes(
            panel,
          ) ? (
            <BackButton
              label={settingsT("settings")}
              onClick={() => setPanel("account-settings")}
            />
          ) : panel &&
            ["account-settings", "personal-info", "zones"].includes(panel) ? (
            <BackButton
              label={settingsT("settings")}
              onClick={() => setPanel("account")}
            />
          ) : undefined
        }
      >
        {panel === "account" ? (
          <MobileGroupedList>
            <MobileButtonRow
              tall
              icon={<SlidersHorizontal />}
              label={accountT("innerTitle")}
              onClick={() => setPanel("account-settings")}
            />
            <MobileButtonRow
              tall
              icon={<User />}
              label={profileT("title")}
              onClick={() => setPanel("personal-info")}
            />
            <MobileButtonRow
              tall
              icon={<Zap />}
              label={t("trainingZones.title")}
              onClick={() => setPanel("zones")}
            />
          </MobileGroupedList>
        ) : panel === "account-settings" ? (
          <MobileAccountSettingsPanel onOpen={setPanel} />
        ) : panel === "account-nickname" ? (
          <MobileNicknamePanel onSaved={() => setPanel("account-settings")} />
        ) : panel === "account-email" ? (
          <MobileEmailPanel />
        ) : panel === "account-password" ? (
          <MobilePasswordPanel />
        ) : panel === "activities" ? (
          <MobileMeActivitiesPanel />
        ) : panel ? (
          <div className="[&>h1]:hidden">{panelContent[panel]}</div>
        ) : null}
      </MobileSheet>

      <MobileSheet
        open={preference != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPreference(null);
        }}
        backgroundVariant="grouped"
        title={preference ? preferenceTitles[preference] : ""}
      >
        {preference ? (
          <MobileGroupedList>
            {preferenceOptions[preference].map((option) => {
              const selected =
                option.value === currentPreferenceValue[preference];
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={savingPreference}
                  onClick={() => void selectPreference(option.value)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left last:border-0 disabled:opacity-55",
                    selected && "font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1 text-mobile-subtitle">
                    {option.label}
                  </span>
                  {selected ? (
                    <Check
                      className="size-[17px] text-emerald-600"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </MobileGroupedList>
        ) : null}
      </MobileSheet>
    </>
  );
}
