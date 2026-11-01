import { describe, expect, it } from "vitest";
import {
  TRACK_FILE_CONVERSION_REPORT_HEADER,
  type TrackFileConversionReport,
} from "@shared/track-file-contract";
import {
  conversionHasNoGps,
  conversionNeedsReview,
  readConversionReport,
} from "./conversion-download";

const report: TrackFileConversionReport = {
  version: 1,
  targetFormat: "gpx",
  files: [
    { sourceFormat: "fit", inputRecords: 10, outputRecords: 10, warnings: [] },
  ],
};
const headers = (value: unknown) =>
  new Headers({ [TRACK_FILE_CONVERSION_REPORT_HEADER]: JSON.stringify(value) });

describe("conversion download gate", () => {
  it("accepts a verified clean report without requiring a loss confirmation", () => {
    expect(
      conversionNeedsReview(
        readConversionReport(headers(report), "gpx", "Invalid output"),
      ),
    ).toBe(false);
  });

  it("requires confirmation for any reported loss or parser warning", () => {
    for (const warning of [
      { code: "POINTS_OMITTED", count: 2, total: 10 },
      { code: "METRICS_NOT_PRESERVED", metrics: ["heartRate"] },
      { code: "SOURCE_WARNINGS", count: 1 },
      { code: "OUTPUT_WARNINGS", count: 1 },
      { code: "NON_ACTIVITY_DATA_OMITTED" },
    ]) {
      const parsed = readConversionReport(
        headers({
          ...report,
          files: [{ ...report.files[0], warnings: [warning] }],
        }),
        "gpx",
        "Invalid output",
      );
      expect(conversionNeedsReview(parsed)).toBe(true);
    }
  });

  it("blocks missing, malformed, future, empty, and wrong-format reports", () => {
    const invalid = [
      new Headers(),
      new Headers({ [TRACK_FILE_CONVERSION_REPORT_HEADER]: "broken JSON" }),
      headers({ ...report, version: 2 }),
      headers({ ...report, files: [] }),
      headers({ ...report, targetFormat: "fit" }),
      headers({ ...report, files: [{ ...report.files[0], outputRecords: 0 }] }),
      headers({
        ...report,
        files: [
          { ...report.files[0], warnings: [{ code: "UNKNOWN_WARNING" }] },
        ],
      }),
    ];
    for (const value of invalid)
      expect(() =>
        readConversionReport(value, "gpx", "Invalid output"),
      ).toThrow();
  });

  it.each([
    "转换结果未通过校验",
    "Le fichier converti n’a pas pu être vérifié",
    "변환 결과를 검증하지 못했습니다",
  ])("uses the caller locale for a browser-generated error: %s", (message) => {
    expect(() => readConversionReport(new Headers(), "gpx", message)).toThrow(
      message,
    );
  });

  it("blocks GPX with no GPS while keeping indoor TCX available", () => {
    const inspection = { activity: { coordinateCount: 0 } };
    expect(conversionHasNoGps(inspection, "gpx")).toBe(true);
    expect(conversionHasNoGps(inspection, "tcx")).toBe(false);
    expect(
      conversionHasNoGps({ activity: { coordinateCount: 1 } }, "gpx"),
    ).toBe(false);
    expect(conversionHasNoGps(null, "gpx")).toBe(false);
  });
});
