"use client";

import { AlertTriangle, Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type {
  TrackFileConversionReport,
  TrackFileFormat,
  TrackFileInspection,
} from "@shared/track-file-contract";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { conversionHasNoGps } from "@/lib/conversion-download";

export function ConversionInputNotice({
  inspection,
  targetFormat,
}: {
  inspection: TrackFileInspection | null;
  targetFormat: TrackFileFormat;
}) {
  const t = useTranslations("conversionQuality");
  if (!inspection) return null;
  const missingGps = conversionHasNoGps(inspection, targetFormat);
  const omitted =
    targetFormat === "gpx" && inspection.activity?.coordinateCount !== undefined
      ? inspection.activity.recordCount - inspection.activity.coordinateCount
      : 0;
  if (!missingGps && omitted === 0 && inspection.warnings.length === 0)
    return null;
  return (
    <Alert variant={missingGps ? "destructive" : "default"}>
      <AlertTriangle aria-hidden />
      <AlertTitle>
        {t(missingGps ? "noGpsTitle" : "inputWarningTitle")}
      </AlertTitle>
      <AlertDescription>
        {missingGps ? (
          <p>{t("noGps", { total: inspection.activity?.recordCount ?? 0 })}</p>
        ) : null}
        {!missingGps && omitted > 0 ? (
          <p>
            {t("pointsOmitted", {
              count: omitted,
              total: inspection.activity!.recordCount,
            })}
          </p>
        ) : null}
        {inspection.warnings.length > 0 ? (
          <p>{t("sourceWarnings", { count: inspection.warnings.length })}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function ConversionReviewNotice({
  report,
  onDownload,
  onCancel,
  awaitingConfirmation,
}: {
  report: TrackFileConversionReport;
  onDownload: () => void;
  onCancel: () => void;
  awaitingConfirmation: boolean;
}) {
  const t = useTranslations("conversionQuality");
  const locale = useLocale();
  return (
    <Alert>
      <AlertTriangle aria-hidden />
      <AlertTitle>
        {t(awaitingConfirmation ? "reviewTitle" : "downloadedWithWarnings")}
      </AlertTitle>
      <AlertDescription>
        {awaitingConfirmation ? <p>{t("reviewBody")}</p> : null}
        <ul className="flex list-disc flex-col gap-2 pl-4">
          {report.files.flatMap((file, fileIndex) =>
            file.warnings.map((warning) => {
              let message: string;
              switch (warning.code) {
                case "POINTS_OMITTED":
                  message = t("pointsOmitted", warning);
                  break;
                case "METRICS_NOT_PRESERVED":
                  message = t("metricsNotPreserved", {
                    metrics: new Intl.ListFormat(locale, {
                      type: "conjunction",
                    }).format(
                      warning.metrics.map((metric) => t(`metrics.${metric}`)),
                    ),
                  });
                  break;
                case "SOURCE_WARNINGS":
                  message = t("sourceWarnings", warning);
                  break;
                case "OUTPUT_WARNINGS":
                  message = t("outputWarnings", warning);
                  break;
                case "NON_ACTIVITY_DATA_OMITTED":
                  message = t("nonActivityDataOmitted");
                  break;
              }
              return (
                <li key={`${fileIndex}-${warning.code}`}>
                  {report.files.length > 1 ? `${fileIndex + 1}. ` : ""}
                  {message}
                </li>
              );
            }),
          )}
        </ul>
        {awaitingConfirmation ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={onDownload}
              className="h-auto min-h-8 max-w-full whitespace-normal text-left"
            >
              <Download data-icon="inline-start" />
              {t("downloadAnyway")}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("cancel")}
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
