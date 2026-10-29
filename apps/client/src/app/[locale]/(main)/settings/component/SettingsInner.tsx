"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeNativeLabel, routing, type Locale } from "@/i18n/routing";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updatePreferredLocale } from "@/api/settings";
import {
  useStore,
  type ChartXaxis,
  type PowerUnit,
  type Theme,
  type TimeFormat,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { persistLocalePreference } from "@/lib/locale-preference";
import {
  ArrowRight,
  ChartNoAxesColumn,
  Clock3,
  Gauge,
  Globe2,
  Languages,
  Palette,
  Ruler,
  Save,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { SelfHostAiSettings } from "./SelfHostAiSettings";

function SettingsPanel({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-foreground dark:bg-muted/45">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  children,
  value,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  children: ReactNode;
  value?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-neutral-100 px-3 py-3 dark:bg-muted/45 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground dark:bg-black/20">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{label}</h3>
            {value ? (
              <span className="rounded-md bg-background px-1.5 py-0.5 text-mobile-caption pc:text-[11px] font-medium text-muted-foreground dark:bg-black/20">
                {value}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="w-full shrink-0 sm:w-[280px] lg:w-[320px]">
        {children}
      </div>
    </div>
  );
}

export function SettingsInner() {
  const t = useTranslations("settings");
  const usageT = useTranslations("UsagePage");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [, startTransition] = useTransition();
  const publicDemo = usePublicDemo();
  const { setTheme: applyTheme } = useTheme();
  const {
    systemUnit,
    powerUnit,
    chartXaxis,
    timeFormat,
    theme,
    updateSetting,
    loadSettings,
  } = useStore();

  const [tempUnitSystem, setTempUnitSystem] = useState<"metric" | "imperial">(
    systemUnit,
  );
  const [tempPowerUnit, setTempPowerUnit] = useState<PowerUnit>(powerUnit);
  const [tempChartXaxis, setTempChartXaxis] = useState<ChartXaxis>(chartXaxis);
  const [tempTimeFormat, setTempTimeFormat] = useState<TimeFormat>(timeFormat);
  const [tempTheme, setTempTheme] = useState<Theme>(theme);
  const [tempLocale, setTempLocale] = useState<Locale>(locale);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!publicDemo.active) void loadSettings();
  }, [loadSettings, publicDemo.active]);

  useEffect(() => {
    setTempUnitSystem(systemUnit);
  }, [systemUnit]);

  useEffect(() => {
    setTempPowerUnit(powerUnit);
  }, [powerUnit]);

  useEffect(() => {
    setTempChartXaxis(chartXaxis);
  }, [chartXaxis]);

  useEffect(() => {
    setTempTimeFormat(timeFormat);
  }, [timeFormat]);

  useEffect(() => {
    setTempTheme(theme);
  }, [theme]);

  useEffect(() => {
    setTempLocale(locale);
  }, [locale]);

  const hasChanges =
    tempUnitSystem !== systemUnit ||
    tempPowerUnit !== powerUnit ||
    tempChartXaxis !== chartXaxis ||
    tempTimeFormat !== timeFormat ||
    tempTheme !== theme ||
    tempLocale !== locale;

  const handleSave = async () => {
    if (publicDemo.active || !hasChanges) return;

    try {
      setIsSaving(true);
      const settingUpdates: Array<Promise<void>> = [];
      if (tempUnitSystem !== systemUnit) {
        settingUpdates.push(updateSetting("unit_system", tempUnitSystem));
      }
      if (tempPowerUnit !== powerUnit) {
        settingUpdates.push(updateSetting("power_unit", tempPowerUnit));
      }
      if (tempChartXaxis !== chartXaxis) {
        settingUpdates.push(updateSetting("chart_xaxis", tempChartXaxis));
      }
      if (tempTimeFormat !== timeFormat) {
        settingUpdates.push(updateSetting("time_format", tempTimeFormat));
      }
      if (tempTheme !== theme) {
        settingUpdates.push(updateSetting("theme", tempTheme));
      }
      await Promise.all(settingUpdates);
      if (tempTheme !== theme) applyTheme(tempTheme);

      if (tempLocale && tempLocale !== locale) {
        persistLocalePreference(tempLocale);
        startTransition(() => {
          void updatePreferredLocale(tempLocale).catch(() => {});
          router.replace(
            // @ts-expect-error current route params match pathname
            { pathname, params },
            { locale: tempLocale },
          );
        });
      }

      toast.success(t("settingsUpdated"));
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(t("failedToUpdateSettings"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-4">
      <div className="order-1 flex flex-col gap-2 md:col-start-2 md:row-start-1 md:order-none">
        <Link
          href="/usage"
          className="group flex items-center justify-between gap-3 rounded-md bg-neutral-100 px-3 py-3 transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
          aria-label={usageT("open")}
        >
          <span className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground dark:bg-black/20">
              <WalletCards className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {usageT("navTitle")}
              </span>
              <span className="mt-1 block text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                {usageT("navDescription")}
              </span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      </div>

      <main className="order-2 flex min-w-0 flex-col gap-4 md:col-start-1 md:row-start-1 md:order-none md:gap-5">
        <SettingsPanel
          icon={Globe2}
          title={t("application")}
          description={t("description")}
        >
          <div className="space-y-3">
            <SettingRow
              icon={Palette}
              label={t("theme")}
              description={t("themeDescription")}
              value={
                tempTheme === "light"
                  ? t("light")
                  : tempTheme === "dark"
                    ? t("dark")
                    : t("system")
              }
            >
              <Select
                disabled={publicDemo.active}
                value={tempTheme}
                onValueChange={(value: Theme) => setTempTheme(value)}
              >
                <SelectTrigger
                  size="default"
                  className="w-full bg-background shadow-none dark:bg-black/20"
                >
                  <SelectValue placeholder={t("selectTheme")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t("light")}</SelectItem>
                  <SelectItem value="dark">{t("dark")}</SelectItem>
                  <SelectItem value="system">{t("system")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              icon={Languages}
              label={t("language")}
              description={t("languageDescription")}
              value={localeNativeLabel(tempLocale)}
            >
              <Select
                disabled={publicDemo.active}
                value={tempLocale}
                onValueChange={(value) => setTempLocale(value as Locale)}
              >
                <SelectTrigger
                  size="default"
                  className="w-full bg-background shadow-none dark:bg-black/20"
                >
                  <SelectValue placeholder={t("selectLanguage")} />
                </SelectTrigger>
                <SelectContent>
                  {routing.locales.map((option) => (
                    <SelectItem key={option} value={option}>
                      {localeNativeLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              icon={ChartNoAxesColumn}
              label={t("chartXaxis")}
              description={t("chartXaxisDescription")}
              value={
                tempChartXaxis === "time"
                  ? t("chartXaxisTime")
                  : t("chartXaxisDistance")
              }
            >
              <Select
                disabled={publicDemo.active}
                value={tempChartXaxis}
                onValueChange={(value: ChartXaxis) => setTempChartXaxis(value)}
              >
                <SelectTrigger
                  size="default"
                  className="w-full bg-background shadow-none dark:bg-black/20"
                >
                  <SelectValue placeholder={t("selectChartXaxis")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="distance">
                    {t("chartXaxisDistance")}
                  </SelectItem>
                  <SelectItem value="time">{t("chartXaxisTime")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              icon={Clock3}
              label={t("timeFormat")}
              description={t("timeFormatDescription")}
              value={
                tempTimeFormat === "12h"
                  ? t("timeFormat12h")
                  : t("timeFormat24h")
              }
            >
              <Select
                disabled={publicDemo.active}
                value={tempTimeFormat}
                onValueChange={(value: TimeFormat) => setTempTimeFormat(value)}
              >
                <SelectTrigger
                  size="default"
                  className="w-full bg-background shadow-none dark:bg-black/20"
                >
                  <SelectValue placeholder={t("selectTimeFormat")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{t("timeFormat24h")}</SelectItem>
                  <SelectItem value="12h">{t("timeFormat12h")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </SettingsPanel>

        <SettingsPanel
          icon={Ruler}
          title={t("units")}
          description={t("unitSystemDescription")}
        >
          <div className="space-y-3">
            <SettingRow
              icon={Ruler}
              label={t("unitSystem")}
              description={t("unitSystemDescription")}
              value={
                tempUnitSystem === "imperial" ? t("imperial") : t("metric")
              }
            >
              <Select
                disabled={publicDemo.active}
                value={tempUnitSystem}
                onValueChange={(value: "metric" | "imperial") =>
                  setTempUnitSystem(value)
                }
              >
                <SelectTrigger
                  size="default"
                  className="w-full bg-background shadow-none dark:bg-black/20"
                >
                  <SelectValue placeholder={t("selectUnitSystem")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">{t("metric")}</SelectItem>
                  <SelectItem value="imperial">{t("imperial")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow
              icon={Gauge}
              label={t("powerUnit")}
              description={t("powerUnitDescription")}
              value={
                tempPowerUnit === "watts_per_kg"
                  ? t("wattsPerKilogram")
                  : t("watts")
              }
            >
              <Select
                disabled={publicDemo.active}
                value={tempPowerUnit}
                onValueChange={(value: PowerUnit) => setTempPowerUnit(value)}
              >
                <SelectTrigger
                  size="default"
                  className="w-full bg-background shadow-none dark:bg-black/20"
                >
                  <SelectValue placeholder={t("selectPowerUnit")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="watts">{t("watts")}</SelectItem>
                  <SelectItem value="watts_per_kg">
                    {t("wattsPerKilogram")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </SettingsPanel>

        <SelfHostAiSettings />

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={publicDemo.active || !hasChanges || isSaving}
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? t("updating") : t("update")}
          </Button>
        </div>
      </main>
    </div>
  );
}
