import { describe, expect, it } from "vitest";
import { fitSwimEfforts, readSwimFile } from "./css-file";
import { calculateCss } from "./css";

describe("swim file records", () => {
  it("separates continuous pool bouts at rests and excludes their time", () => {
    const active = (time: number) => ({
      lengthType: "active",
      totalTimerTime: time,
    });
    const efforts = fitSwimEfforts({
      sessionMesgs: [{ sport: "swimming", poolLength: 25 }],
      lengthMesgs: [
        ...Array.from({ length: 16 }, () => active(22.5)),
        { lengthType: "idle", totalTimerTime: 300 },
        ...Array.from({ length: 8 }, () => active(20)),
      ],
    });
    expect(efforts.map(({ distance, timeSec }) => [distance, timeSec])).toEqual(
      [
        [400, 360],
        [200, 160],
      ],
    );
    expect(calculateCss(efforts[0], efforts[1], "meters")?.pacePer100mSec).toBe(
      100,
    );
  });

  it("keeps decoded yard-pool lengths in metres and handles numeric FIT enums", () => {
    const efforts = fitSwimEfforts({
      sessionMesgs: [{ sport: 5, poolLength: 22.86 }],
      lengthMesgs: [
        { lengthType: 1, totalTimerTime: 20 },
        { lengthType: 1, totalTimerTime: 21 },
        { lengthType: 0, totalTimerTime: 60 },
        { lengthType: 1, totalTimerTime: 22 },
      ],
    });
    expect(efforts.map(({ distance }) => distance)).toEqual([45.72, 22.86]);
    expect(efforts[0].timeSec).toBe(41);
  });

  it("uses lap timer time before elapsed time and filters incomplete laps", () => {
    const efforts = fitSwimEfforts({
      lapMesgs: [
        { totalDistance: 400, totalTimerTime: 360, totalElapsedTime: 480 },
        { totalDistance: 200, totalElapsedTime: 160 },
        { totalDistance: 0, totalTimerTime: 60 },
        { totalDistance: 100, totalTimerTime: NaN },
      ],
    });
    expect(efforts.map(({ timeSec, timing }) => [timeSec, timing])).toEqual([
      [360, "timer"],
      [160, "elapsed"],
    ]);
  });

  it("can use two whole-activity summaries without prescribing maximal tests", () => {
    const a = fitSwimEfforts({
      sessionMesgs: [
        { sport: "swimming", totalDistance: 600, totalTimerTime: 750 },
      ],
    })[0];
    const b = fitSwimEfforts({
      sessionMesgs: [
        { sport: "swimming", totalDistance: 300, totalTimerTime: 330 },
      ],
    })[0];
    expect(a.kind).toBe("activity");
    expect(calculateCss(a, b, "meters")?.pacePer100mSec).toBe(140);
  });

  it("does not pool records from known non-swim or mixed-sport files", () => {
    expect(() =>
      fitSwimEfforts({ sessionMesgs: [{ sport: "running" }] }),
    ).toThrow("sport");
    expect(() =>
      fitSwimEfforts({
        sessionMesgs: [{ sport: "swimming" }, { sport: "cycling" }],
      }),
    ).toThrow("sport");
  });

  it("rejects empty, oversized, and unsupported files before decoding", async () => {
    await expect(readSwimFile(new File([], "empty.fit"))).rejects.toThrow(
      "size",
    );
    await expect(
      readSwimFile(
        new File([new Uint8Array(20 * 1024 * 1024 + 1)], "large.fit"),
      ),
    ).rejects.toThrow("size");
    await expect(readSwimFile(new File(["data"], "file.txt"))).rejects.toThrow(
      "format",
    );
  });
});
