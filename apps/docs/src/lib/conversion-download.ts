import {
  TRACK_FILE_CONVERSION_REPORT_HEADER,
  type TrackFileConversionReport,
  type TrackFileFormat,
} from "@shared/track-file-contract";
import { z } from "zod";
import { ToolRequestError } from "./tool-request-error";

const format = z.enum(["fit", "gpx", "tcx"]);
const count = z.number().int().nonnegative();
const warning = z.discriminatedUnion("code", [
  z.object({ code: z.literal("POINTS_OMITTED"), count, total: count }),
  z.object({
    code: z.literal("METRICS_NOT_PRESERVED"),
    metrics: z
      .array(
        z.enum([
          "heartRate",
          "cadence",
          "power",
          "altitude",
          "distance",
          "speed",
          "temperature",
          "runningDynamics",
          "swimming",
        ]),
      )
      .min(1)
      .max(9),
  }),
  z.object({ code: z.literal("SOURCE_WARNINGS"), count }),
  z.object({ code: z.literal("OUTPUT_WARNINGS"), count }),
  z.object({ code: z.literal("NON_ACTIVITY_DATA_OMITTED") }),
]);
const reportSchema = z.object({
  version: z.literal(1),
  targetFormat: format,
  files: z
    .array(
      z.object({
        sourceFormat: format,
        inputRecords: count.positive(),
        outputRecords: count.positive(),
        warnings: z.array(warning).max(5),
      }),
    )
    .min(1)
    .max(10),
});

export function invalidConversionResponse(message: string): ToolRequestError {
  return new ToolRequestError(message, {
    status: 502,
    serverCode: "TRACK_FILE_OUTPUT_INVALID",
    errorCategory: "CONVERSION",
    errorOrigin: "SERVICE",
    retryable: false,
  });
}

export function readConversionReport(
  headers: Headers,
  targetFormat: TrackFileFormat,
  invalidMessage: string,
): TrackFileConversionReport {
  const value = headers.get(TRACK_FILE_CONVERSION_REPORT_HEADER);
  if (!value || value.length > 8192)
    throw invalidConversionResponse(invalidMessage);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidConversionResponse(invalidMessage);
  }
  const result = reportSchema.safeParse(parsed);
  if (!result.success || result.data.targetFormat !== targetFormat) {
    throw invalidConversionResponse(invalidMessage);
  }
  return result.data;
}

export function conversionNeedsReview(
  report: TrackFileConversionReport,
): boolean {
  return report.files.some((file) => file.warnings.length > 0);
}

export function conversionHasNoGps(
  inspection: { activity?: { coordinateCount?: number } } | null,
  targetFormat: TrackFileFormat,
): boolean {
  return targetFormat === "gpx" && inspection?.activity?.coordinateCount === 0;
}

export function downloadConversionBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Let the browser consume the URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
