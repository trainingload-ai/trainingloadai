import { beforeEach, describe, expect, it } from "vitest";
import {
  Encoder,
  Profile,
  type ActivityMesg,
  type FileIdMesg,
  type RecordMesg,
  type SessionMesg,
} from "@garmin/fitsdk";
import {
  describeFitFieldForTest,
  exportFitDataForTest,
  getFitPageForTest,
  parseFitFileForTest,
} from "./fit-view-worker";

const RECORD_COUNT = 250;

function semicircles(degrees: number) {
  return Math.round((degrees * 2 ** 31) / 180);
}

function buildActivityFit(
  recordCount = RECORD_COUNT,
  includeLatePowerField = false,
) {
  const encoder = new Encoder();
  const startedAt = new Date("2026-01-01T08:00:00.000Z");
  const endedAt = new Date(startedAt.getTime() + recordCount * 1_000);

  const fileIdMesg: FileIdMesg = {
    manufacturer: "development",
    product: 1,
    timeCreated: startedAt,
    type: "activity",
  };
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileIdMesg);

  for (let index = 0; index < recordCount; index += 1) {
    const recordMesg: RecordMesg = {
      timestamp: new Date(startedAt.getTime() + index * 1_000),
      positionLat: semicircles(31.2304 + Math.sin(index / 28) * 0.00025),
      positionLong: semicircles(121.4737 + index * 0.00001),
      enhancedAltitude: 12 + Math.sin(index / 36) * 8,
      heartRate: 120 + (index % 30),
      cadence: 80 + (index % 5),
      distance: index * 10,
    };
    if (includeLatePowerField && index === recordCount - 1) {
      recordMesg.power = 321;
    }
    encoder.onMesg(Profile.MesgNum.RECORD, recordMesg);
  }

  const sessionMesg: SessionMesg = {
    timestamp: endedAt,
    startTime: startedAt,
    sport: "running",
    totalElapsedTime: recordCount,
    totalTimerTime: recordCount,
    totalDistance: (recordCount - 1) * 10,
    avgHeartRate: 134,
    maxHeartRate: 149,
    totalCalories: 200,
  };
  encoder.onMesg(Profile.MesgNum.SESSION, sessionMesg);

  const activityMesg: ActivityMesg = {
    timestamp: endedAt,
    totalTimerTime: recordCount,
    numSessions: 1,
    type: "manual",
    event: "activity",
    eventType: "stop",
  };
  encoder.onMesg(Profile.MesgNum.ACTIVITY, activityMesg);

  const bytes = encoder.close();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("FIT viewer worker model", () => {
  beforeEach(() => {
    const buffer = buildActivityFit();
    parseFitFileForTest("activity.fit", buffer.byteLength, buffer);
  });

  it("builds a human-readable overview before exposing raw messages", () => {
    const buffer = buildActivityFit();
    const model = parseFitFileForTest(
      "activity.fit",
      buffer.byteLength,
      buffer,
    );

    expect(model.diagnostics.integrityPassed).toBe(true);
    expect(model.identity.type).toBe("activity");
    expect(model.identity.sport).toBe("running");
    expect(model.summary.records).toBe(RECORD_COUNT);
    expect(model.summary.distanceMeters).toBe((RECORD_COUNT - 1) * 10);
    expect(model.visualization.route3d).toHaveLength(RECORD_COUNT);
    expect(model.visualization.trends).toHaveLength(RECORD_COUNT);
    expect(model.visualization.route3d.at(-1)?.xM).toBeGreaterThan(
      model.visualization.route3d[0].xM,
    );
    expect(model.visualization.trends[1].speedMps).toBe(10);
    expect(model.groups.map((group) => group.key)).toEqual([
      "fileIdMesgs",
      "activityMesgs",
      "sessionMesgs",
      "recordMesgs",
    ]);
    expect(
      model.groups.find((group) => group.key === "recordMesgs"),
    ).toMatchObject({
      key: "recordMesgs",
      messageNumber: Profile.MesgNum.RECORD,
      profileDefined: true,
      count: RECORD_COUNT,
    });
    expect(model.diagnostics.sdkProfileVersion).toBe(
      `${Profile.version.major}.${Profile.version.minor}.${Profile.version.patch}`,
    );
  });

  it("returns stable 100-row pages for the message browser", () => {
    const firstPage = getFitPageForTest("recordMesgs", "", 1, 100);
    const secondPage = getFitPageForTest("recordMesgs", "", 2, 100);
    const finalPage = getFitPageForTest("recordMesgs", "", 3, 100);

    expect(firstPage.rows).toHaveLength(100);
    expect(secondPage.rows).toHaveLength(100);
    expect(finalPage.rows).toHaveLength(50);
    expect(firstPage.total).toBe(RECORD_COUNT);
    expect(firstPage.rows.at(-1)?.timestamp).not.toEqual(
      secondPage.rows[0]?.timestamp,
    );
  });

  it("searches within the selected message group and exports that group", () => {
    const result = getFitPageForTest("recordMesgs", "149", 1, 100);
    const csv = exportFitDataForTest("csv", "recordMesgs");

    expect(result.total).toBeGreaterThan(0);
    expect(
      result.rows.every((row) => JSON.stringify(row).includes("149")),
    ).toBe(true);
    expect(csv.fileName).toBe("activity.record.csv");
    expect(csv.mimeType).toContain("text/csv");
    expect(csv.content).toContain("heartRate");
  });

  it("keeps columns stable and exports fields first seen after row 1,000", () => {
    const buffer = buildActivityFit(1_201, true);
    parseFitFileForTest("long-activity.fit", buffer.byteLength, buffer);

    const firstPage = getFitPageForTest("recordMesgs", "", 1, 100);
    const finalPage = getFitPageForTest("recordMesgs", "", 13, 100);
    const csv = exportFitDataForTest("csv", "recordMesgs");

    expect(firstPage.fields.map((field) => field.key)).toContain("power");
    expect(finalPage.fields).toEqual(firstPage.fields);
    expect(finalPage.rows).toHaveLength(1);
    expect(csv.content.split("\n", 1)[0]).toContain("power");
  });

  it("maps field numbers only within their FIT message profile", () => {
    expect(describeFitFieldForTest("recordMesgs", "distance")).toMatchObject({
      key: "distance",
      number: 5,
      units: "m",
      source: "profile",
    });
    expect(describeFitFieldForTest("recordMesgs", "107")).toEqual({
      key: "107",
      number: 107,
      units: null,
      type: null,
      source: "unknown",
    });
    expect(describeFitFieldForTest("recordMesgs", "developerFields")).toEqual({
      key: "developerFields",
      number: null,
      units: null,
      type: null,
      source: "developer",
    });
  });

  it("keeps the official FIT Profile units for record metrics", () => {
    expect(describeFitFieldForTest("recordMesgs", "positionLat").units).toBe(
      "semicircles",
    );
    expect(describeFitFieldForTest("recordMesgs", "enhancedSpeed").units).toBe(
      "m/s",
    );
    expect(
      describeFitFieldForTest("recordMesgs", "enhancedAltitude").units,
    ).toBe("m");
    expect(describeFitFieldForTest("recordMesgs", "heartRate").units).toBe(
      "bpm",
    );
    expect(describeFitFieldForTest("recordMesgs", "power").units).toBe("watts");
    expect(describeFitFieldForTest("recordMesgs", "cadence").units).toBe("rpm");
    expect(
      describeFitFieldForTest("recordMesgs", "fractionalCadence").units,
    ).toBe("rpm");
    expect(describeFitFieldForTest("recordMesgs", "grade").units).toBe("%");
    expect(describeFitFieldForTest("recordMesgs", "temperature").units).toBe(
      "C",
    );
  });
});
