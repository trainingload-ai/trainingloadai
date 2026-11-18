import { describe, expect, it } from "vitest";
import { analyzeLactate } from "@trainingloadai/shared/lactate-analysis";
import {
  intensityFromText,
  intensityToText,
  lactateExample,
  lactateResultCsv,
  mapLactateRecording,
  parseLactateRecording,
  RecordingError,
  stagesFromDraft,
} from "./lactate-recording";

describe("local lactate recording", () => {
  it("parses quoted BOM CSV and headerless TSV without dropping rows", () => {
    const csv = parseLactateRecording(
      '\uFEFF"power","lactate","HR"\r\n100,1.2,120\r\n125,1.5,130',
    );
    expect(mapLactateRecording(csv, csv.suggested)[0]).toEqual({
      intensity: "100",
      lactate: "1.2",
      heartRate: "120",
    });
    const tsv = parseLactateRecording("8\t1.1\n10\t1.3\n12\t1.8\n14\t3.1");
    expect(
      stagesFromDraft(
        mapLactateRecording(tsv, tsv.suggested),
        "running",
        "kmh",
      ),
    ).toHaveLength(4);
  });
  it("rejects malformed, oversized and ambiguous columns", () => {
    for (const input of [
      "a,b\n1",
      '"unclosed,2',
      "x".repeat(256 * 1024 + 1),
      "a,b\n".repeat(101),
    ])
      expect(() => parseLactateRecording(input)).toThrow(RecordingError);
    const csv = parseLactateRecording("power,lactate\n100,1.1");
    expect(() =>
      mapLactateRecording(csv, { intensity: 0, lactate: 0, heartRate: -1 }),
    ).toThrow(RecordingError);
    const invalidFirst = parseLactateRecording(
      "100,bad\n125,1.2\n150,1.4\n175,2.5",
    );
    expect(invalidFirst.rows).toHaveLength(4);
    expect(() =>
      stagesFromDraft(
        mapLactateRecording(invalidFirst, invalidFirst.suggested),
        "cycling",
        "watts",
      ),
    ).toThrow();
  });
  it("converts pace units and rejects non-numeric cell expressions", () => {
    expect(intensityFromText("5:00", "pace_km")).toBeCloseTo(12, 10);
    expect(intensityFromText("8:02.8032", "pace_mile")).toBeCloseTo(12, 10);
    expect(intensityFromText("0", "pace_km")).toBe(0);
    expect(intensityFromText("4:99", "pace_km")).toBeNaN();
    expect(intensityFromText("0x100", "watts")).toBeNaN();
    expect(intensityFromText("=100+25", "watts")).toBeNaN();
  });
  it("exports input, method choices, precision and provenance locally", () => {
    const result = analyzeLactate({
      sport: "cycling",
      stages: lactateExample("cycling"),
    });
    const csv = lactateResultCsv(result);
    expect(csv).toContain(
      "reference_commit,2cd3709f6442447b3b9128e325f13fa38570eb17",
    );
    expect(csv).toContain("lt1_method,bsln_05");
    expect(csv).toContain("stage_intensity,lactate_mmol_l,heart_rate_bpm");
    expect(csv).toContain(String(result.methods[0]!.intensity));
  });
  it("keeps running results equivalent through repeated unit conversions", () => {
    const stages = lactateExample("running");
    const expected = analyzeLactate({ sport: "running", stages });
    for (const unit of ["kmh", "pace_km", "pace_mile"] as const) {
      const converted = stages.map((row) => {
        let value = row.intensity;
        for (let i = 0; i < 10; i++)
          value = intensityFromText(intensityToText(value, unit), unit);
        return { ...row, intensity: value };
      });
      const result = analyzeLactate({ sport: "running", stages: converted });
      result.methods.forEach((method, i) =>
        expect(method.intensity!).toBeCloseTo(
          expected.methods[i]!.intensity!,
          5,
        ),
      );
    }
  });
});
