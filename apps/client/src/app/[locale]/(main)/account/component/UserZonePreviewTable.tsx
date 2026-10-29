"use client";

import { useTranslations } from "next-intl";
import {
  useZoneModelPreviews,
  type ZonePreviewSport,
  type ZonePreviewType,
} from "@/api/use-zone-model-previews";
import type {
  PaceZoneModel,
  HeartRateZoneModel,
  PowerZoneModel,
} from "@/api/settings";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  formatZonePaceRange,
  getZoneNameKey,
  formatNumericZoneRange,
} from "./user-pace-zone-table-model";

type Props =
  | { sport: "RUN" | "SWIM"; zoneType: "PACE"; model: PaceZoneModel }
  | {
      sport: ZonePreviewSport;
      zoneType: "HEART_RATE";
      model: HeartRateZoneModel;
    }
  | {
      sport: "UNKNOWN" | "RUN" | "CYCLING";
      zoneType: "POWER";
      model: PowerZoneModel;
    };

export function UserZonePreviewTable({ sport, model, zoneType }: Props) {
  const t = useTranslations("UserProfile");
  const query = useZoneModelPreviews(sport, zoneType);
  const preview = query.data?.models[model];
  const table = (key: string) => t(`zonePreview.${key}`);
  const benchmark = preview?.benchmark;
  const basisKeys: Record<string, string> = {
    TP: "fields.tp.label",
    CS: "fields.cs.label",
    VO2MAX: "fields.vo2max.label",
    MHR: "fields.maxHeartRate.label",
    LTHR: "fields.lactateThresholdHeartRate.label",
    FTP: "fields.ftp.label",
    CP: "fields.cp.label",
    HRR: "zonePreview.hrr",
    CUSTOM: "zonePreview.custom",
  };
  const basisKey =
    typeof benchmark === "string" && Object.hasOwn(basisKeys, benchmark)
      ? basisKeys[benchmark]
      : undefined;
  const basisLabel = basisKey
    ? t(basisKey).replace(/\s*[（(](?:bpm|W)[）)]/g, "")
    : table("unknown");
  const basis =
    preview?.benchmarkSource === "ESTIMATED_MAX_HR"
      ? t("zonePreview.estimated", { basis: basisLabel })
      : basisLabel;
  const zones = [...(preview?.zones ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const unit =
    zoneType === "HEART_RATE"
      ? "bpm"
      : zoneType === "POWER"
        ? "W"
        : sport === "SWIM"
          ? "min/100m"
          : "min/km";
  const rangeKeys: Record<ZonePreviewType, string> = {
    HEART_RATE: "heartRateRange",
    POWER: "powerRange",
    PACE: "range",
  };

  return (
    <section
      className="min-w-0 space-y-2"
      aria-label={table("title")}
      aria-busy={query.isFetching}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3
          className="min-w-0 truncate text-sm font-medium"
          title={table("title")}
        >
          {table("title")}
        </h3>
        {!query.isPending && !query.isError && query.data ? (
          <p
            className="min-w-0 truncate text-right text-xs text-muted-foreground"
            title={t("zonePreview.basis", { basis })}
          >
            {t("zonePreview.basis", { basis })}
          </p>
        ) : null}
      </div>
      {query.isPending ? (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          {table("loading")}
        </p>
      ) : query.isError ? (
        <div role="alert" className="space-y-2 py-2 text-sm">
          <p>{table("error")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            {table("retry")}
          </Button>
        </div>
      ) : zones.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          {table("empty")}
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-md border md:max-h-80">
          <Table aria-label={table("title")}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{table("zone")}</TableHead>
                <TableHead scope="col" className="text-right">
                  {table(rangeKeys[zoneType])} ({unit})
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.map((zone, index) => {
                const nameKey = getZoneNameKey(zone.name);
                const zoneId =
                  zone.name.match(/^Z\d+[a-z]?(?=\s|$)/)?.[0] ??
                  `Z${zone.order ?? index + 1}`;
                return (
                  <TableRow key={`${zone.order ?? index}-${zone.name}`}>
                    <TableCell className="whitespace-normal">
                      {nameKey
                        ? `${zoneId} ${table(`names.${nameKey}`)}`
                        : zone.name || `Z${zone.order ?? index + 1}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {zoneType === "PACE"
                        ? formatZonePaceRange(zone, sport)
                        : formatNumericZoneRange(zone)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {query.data?.hasSavedSetting ? (
        <p role="status" className="text-xs text-muted-foreground">
          {table("savedOverride")}
        </p>
      ) : null}
    </section>
  );
}
