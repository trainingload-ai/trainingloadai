"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronRight } from "lucide-react";
import type { UserProfile } from "@/api/settings";
import type { SportType } from "@/api/activities";
import { useUpdateUserProfile, useUserProfile } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";
import { MobileGroupedList } from "./MobileGroupedList";
import { MobileSheet } from "./MobileSheet";

type SportTab = "DEFAULT" | "RUN" | "CYCLING" | "SWIM";
type EditorKind = "number" | "date" | "text" | "single" | "multi";
type FieldConfig = {
  key: keyof UserProfile;
  label: string;
  value?: UserProfile[keyof UserProfile];
  kind: EditorKind;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
};

function displayValue(field: FieldConfig, notSet: string) {
  const value = field.value;
  if (Array.isArray(value)) {
    if (!value.length) return notSet;
    return value.map((item) => field.options?.find((option) => option.value === item)?.label ?? item).join(" · ");
  }
  if (value == null || value === "") return notSet;
  const option = field.options?.find((item) => item.value === String(value));
  return `${option?.label ?? String(value)}${field.unit ? ` ${field.unit}` : ""}`;
}

function ProfileSection({ title, fields, notSet, onOpen }: { title: string; fields: FieldConfig[]; notSet: string; onOpen: (field: FieldConfig) => void }) {
  if (!fields.length) return null;
  return (
    <section className="mb-5 space-y-2">
      <h2 className="px-1 text-mobile-caption font-medium text-muted-foreground">{title}</h2>
      <MobileGroupedList>
        {fields.map((field) => {
          const value = displayValue(field, notSet);
          return (
            <button key={field.key} type="button" onClick={() => onOpen(field)} className="flex min-h-[50px] w-full items-center gap-3 border-b border-border/60 px-4 text-left last:border-0 active:bg-muted/65">
              <span className="min-w-0 flex-1 truncate text-mobile-subtitle">{field.label}</span>
              <span className={cn("max-w-[52%] truncate text-right text-mobile-body", value === notSet ? "text-muted-foreground/70" : "text-muted-foreground")}>{value}</span>
              <ChevronRight className="size-[13px] shrink-0 text-muted-foreground/45" />
            </button>
          );
        })}
      </MobileGroupedList>
    </section>
  );
}

export function MobileProfilePanel() {
  const locale = useLocale();
  const t = useTranslations("UserProfile");
  const [sport, setSport] = useState<SportTab>("DEFAULT");
  const [editing, setEditing] = useState<FieldConfig | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [multiDraft, setMultiDraft] = useState<string[]>([]);
  const profileQuery = useUserProfile(sport === "DEFAULT" ? undefined : sport as SportType);
  const update = useUpdateUserProfile();
  const profile = profileQuery.data ?? {};
  const zh = locale === "zh" || locale === "zh-hant";
  const labels = {
    hint: zh ? "管理基础资料、区间模型与负荷来源优先级。" : "Manage basic profile data, zone models, and load-source priority.",
    basic: zh ? "基础信息" : "Basic information",
    heart: zh ? "心率" : "Heart rate",
    power: zh ? "功率" : "Power",
    pace: zh ? "配速" : "Pace",
    models: zh ? "模型与负荷" : "Models and load",
    notSet: zh ? "未设置" : "Not set",
    save: zh ? "保存" : "Save",
    saving: zh ? "保存中…" : "Saving…",
  };

  useEffect(() => {
    if (!editing) return;
    const value = editing.value;
    if (Array.isArray(value)) {
      setMultiDraft(value.map(String));
      setDraft("");
    } else {
      setDraft(value == null ? "" : String(value));
      setMultiDraft([]);
    }
  }, [editing]);

  const option = (key: string, value: string) => t(`fields.${key}.options.${value}`);
  const fieldGroups = useMemo(() => {
    const basic: FieldConfig[] = sport === "DEFAULT" ? [
      { key: "weight", label: t("fields.weight.label"), value: profile.weight, kind: "number", unit: "kg", min: 20, max: 400, step: 0.1 },
      { key: "height", label: t("fields.height.label"), value: profile.height, kind: "number", unit: "cm", min: 80, max: 260, step: 0.1 },
      { key: "birthDate", label: t("fields.birthDate.label"), value: profile.birthDate, kind: "date" },
      { key: "gender", label: t("fields.gender.label"), value: profile.gender, kind: "single", options: ["male", "female", "other"].map((value) => ({ value, label: option("gender", value) })) },
      { key: "timezone", label: t("fields.timezone.label"), value: profile.timezone, kind: "text" },
    ] : [];
    const heart: FieldConfig[] = [
      { key: "maxHeartRate", label: t("fields.maxHeartRate.label"), value: profile.maxHeartRate, kind: "number", unit: "bpm", min: 30, max: 255 },
      { key: "restingHeartRate", label: t("fields.restingHeartRate.label"), value: profile.restingHeartRate, kind: "number", unit: "bpm", min: 20, max: 200 },
      { key: "lthr", label: t("fields.lactateThresholdHeartRate.label"), value: profile.lthr, kind: "number", unit: "bpm", min: 30, max: 255 },
    ];
    const power: FieldConfig[] = sport === "RUN" || sport === "CYCLING" ? [
      { key: "ftp", label: "FTP", value: profile.ftp, kind: "number", unit: "W", min: 1, max: 2500 },
      { key: "cp", label: "CP", value: profile.cp, kind: "number", unit: "W", min: 1, max: 2500 },
      { key: "wPrime", label: "W′", value: profile.wPrime, kind: "number", unit: "J", min: 1, max: 200000 },
      { key: "Pmax", label: "Pmax", value: profile.Pmax, kind: "number", unit: "W", min: 1, max: 5000 },
    ] : [];
    const pace: FieldConfig[] = sport === "RUN" || sport === "SWIM" ? [
      { key: "cs", label: `CS /${sport === "SWIM" ? "100m" : "km"}`, value: profile.cs, kind: "number", unit: "s", min: 1 },
      { key: "tp", label: `TP /${sport === "SWIM" ? "100m" : "km"}`, value: profile.tp, kind: "number", unit: "s", min: 1 },
    ] : [];
    const models: FieldConfig[] = [
      { key: "heartRateZoneModel", label: t("fields.heartRateZoneModel.label"), value: profile.heartRateZoneModel ?? "MHR", kind: "single", options: [
        { value: "MHR", label: option("heartRateZoneModel", "mhr") },
        { value: "FRIEL", label: option("heartRateZoneModel", "friel") },
        { value: "KARVONEN", label: option("heartRateZoneModel", "karvonen") },
      ] },
      ...(sport === "DEFAULT" || sport === "RUN" || sport === "CYCLING" ? [{ key: "powerZoneModel" as const, label: t("fields.powerZoneModel.label"), value: profile.powerZoneModel, kind: "single" as const, options: [
        { value: "FRIEL", label: option("powerZoneModel", "friel") },
        { value: "VANCE", label: option("powerZoneModel", "vance") },
        { value: "STRYD", label: option("powerZoneModel", "stryd") },
      ] }] : []),
      ...(sport === "DEFAULT" || sport === "RUN" || sport === "SWIM" ? [{ key: "paceZoneModel" as const, label: t("fields.paceZoneModel.label"), value: profile.paceZoneModel, kind: "single" as const, options: [
        { value: "FRIEL", label: option("paceZoneModel", "friel") },
        { value: "DANIELS", label: option("paceZoneModel", "daniels") },
      ] }] : []),
      ...(sport === "RUN" ? [
        { key: "defaultVdotSource" as const, label: t("fields.defaultVdotSource.label"), value: profile.defaultVdotSource === "STANDARD" ? "STANDARD" : "FACTOR", kind: "single" as const, options: ["FACTOR", "STANDARD"].map((value) => ({ value, label: option("defaultVdotSource", value) })) },
        { key: "vo2maxCorrectionFactor" as const, label: t("fields.vo2maxCorrectionFactor.label"), value: profile.vo2maxCorrectionFactor ?? 1, kind: "number" as const, unit: "×", min: 0.01, max: 1.2, step: 0.01 },
      ] : []),
      { key: "loadSources", label: t("fields.loadSources.label"), value: profile.loadSources, kind: "multi", options: ["POWER", "HEART_RATE", "PACE", "SESSIONRPE"].map((value) => ({ value, label: option("loadSources", value) })) },
    ];
    return { basic, heart, power, pace, models };
  }, [profile, sport, t]);

  const save = async () => {
    if (!editing) return;
    let value: string | number | string[] = draft.trim();
    if (editing.kind === "number") value = Number(draft);
    if (editing.kind === "multi") value = multiDraft;
    await update.mutateAsync({ [editing.key]: value } as Partial<UserProfile>);
    setEditing(null);
  };

  if (profileQuery.isLoading) {
    return <div className="mx-4 h-[420px] animate-pulse rounded-surface bg-muted" />;
  }
  if (profileQuery.isError) {
    return <button type="button" onClick={() => void profileQuery.refetch()} className="min-h-[260px] w-full px-6 text-mobile-body text-red-500">{t("loadError")}</button>;
  }

  return (
    <>
      <div className="space-y-4">
        <p className="px-1 text-mobile-caption text-muted-foreground">{labels.hint}</p>
        <div className="grid h-9 grid-cols-4 rounded-lg bg-muted p-0.5 text-mobile-control">
          {(["DEFAULT", "RUN", "CYCLING", "SWIM"] as SportTab[]).map((value) => (
            <button key={value} type="button" onClick={() => setSport(value)} className={cn("rounded-xs", sport === value && "bg-background font-medium shadow-sm")}>{t(`tabs.${value === "DEFAULT" ? "default" : value.toLowerCase()}`)}</button>
          ))}
        </div>
        <div>
          <ProfileSection title={labels.basic} fields={fieldGroups.basic} notSet={labels.notSet} onOpen={setEditing} />
          <ProfileSection title={labels.heart} fields={fieldGroups.heart} notSet={labels.notSet} onOpen={setEditing} />
          <ProfileSection title={labels.power} fields={fieldGroups.power} notSet={labels.notSet} onOpen={setEditing} />
          <ProfileSection title={labels.pace} fields={fieldGroups.pace} notSet={labels.notSet} onOpen={setEditing} />
          <ProfileSection title={labels.models} fields={fieldGroups.models} notSet={labels.notSet} onOpen={setEditing} />
        </div>
      </div>

      <MobileSheet
        open={editing != null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        backgroundVariant="grouped"
        fullScreen
        title={editing?.label ?? ""}
      >
        {editing ? (
          <div className="flex min-h-[calc(96dvh-5rem)] flex-col pb-6">
            {editing.kind === "single" || editing.kind === "multi" ? (
              <MobileGroupedList>
                {editing.options?.map((item) => {
                  const selected = editing.kind === "multi" ? multiDraft.includes(item.value) : draft === item.value;
                  return (
                    <button key={item.value} type="button" onClick={() => editing.kind === "multi" ? setMultiDraft((current) => current.includes(item.value) ? current.filter((value) => value !== item.value) : [...current, item.value]) : setDraft(item.value)} className="flex min-h-[52px] w-full items-center gap-3 border-b border-border/60 px-4 text-left last:border-0">
                      <span className="flex-1 text-mobile-subtitle">{item.label}</span>{selected ? <Check className="size-4 text-emerald-600" /> : <span className="size-4" />}
                    </button>
                  );
                })}
              </MobileGroupedList>
            ) : (
              <section className="space-y-2">
                <label className="px-1 text-mobile-caption font-medium text-muted-foreground">{editing.label}</label>
                <div className="flex min-h-[58px] items-center rounded-surface bg-card px-4">
                  <input
                    autoFocus
                    type={editing.kind === "number" ? "number" : editing.kind === "date" ? "date" : "text"}
                    value={draft}
                    min={editing.min}
                    max={editing.max}
                    step={editing.step}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-mobile-headline outline-none"
                  />
                  {editing.unit ? <span className="text-mobile-body text-muted-foreground">{editing.unit}</span> : null}
                </div>
              </section>
            )}
            <button type="button" disabled={update.isPending || (editing.kind === "multi" ? false : !draft.trim())} onClick={() => void save()} className="mt-auto min-h-12 w-full rounded-control-lg bg-zinc-900 text-mobile-subtitle font-semibold text-white disabled:opacity-45 dark:bg-zinc-100 dark:text-zinc-900">
              {update.isPending ? labels.saving : labels.save}
            </button>
          </div>
        ) : null}
      </MobileSheet>
    </>
  );
}
