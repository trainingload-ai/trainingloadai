import { describe, expect, it } from "vitest";

import {
  applyVo2Search,
  beepVo2maxFromLevel,
  calculateVo2,
  cooperVo2maxFromDistanceMeters,
  createVo2Draft,
  raceVo2max,
  restingHrVo2max,
  rockportVo2max,
  round1,
  vo2SearchFromDraft,
} from "./vo2-field";

describe("vo2 field formulas", () => {
  it("matches the published field-test examples used in the FAQ", () => {
    expect(round1(cooperVo2maxFromDistanceMeters(2800))).toBe(51.3);
    expect(round1(beepVo2maxFromLevel(10, 30).vo2max)).toBe(50.6);
    expect(round1(beepVo2maxFromLevel(10, 30).speedKmh)).toBe(13);
    expect(round1(restingHrVo2max(60, 190))).toBe(48.5);
    expect(round1(raceVo2max({ distanceM: 5000, timeMin: 20 }))).toBe(49.8);
    expect(
      round1(
        rockportVo2max({
          age: 30,
          sex: "male",
          weightKg: 70,
          timeMin: 14.5,
          hrBpm: 150,
        }),
      ),
    ).toBe(44.9);
  });

  it("uses the Léger one-minute stage schedule and published age convention", () => {
    expect(beepVo2maxFromLevel(1, 18).speedKmh).toBe(8.5);
    expect(beepVo2maxFromLevel(2, 18).speedKmh).toBe(9);
    expect(round1(beepVo2maxFromLevel(10, 15).vo2max)).toBe(54.4);
    expect(beepVo2maxFromLevel(10, 45)).toEqual(beepVo2maxFromLevel(10, 18));
  });

  it("uses age in the Beep estimate and keeps shuttle count as a record only", () => {
    const draft = {
      ...createVo2Draft(),
      method: "beep" as const,
      age: "15",
      sex: "female" as const,
      beepLevel: "10",
      beepShuttle: "1",
    };
    const result = calculateVo2(draft);
    const otherShuttle = calculateVo2({ ...draft, beepShuttle: "5" });
    expect(result.ok).toBe(true);
    expect(otherShuttle.ok).toBe(true);
    if (!result.ok || !otherShuttle.ok) return;
    expect(result.value.vo2max).toBe(54.4);
    expect(otherShuttle.value.vo2max).toBe(result.value.vo2max);
    expect(otherShuttle.value.detail).toMatchObject({
      shuttle: 5,
      speedKmh: 13,
    });
  });

  it("requires age and sex, then classifies the first Cooper result", () => {
    const missing = calculateVo2(createVo2Draft());
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe("age");

    const draft = createVo2Draft();
    draft.age = "30";
    draft.sex = "male";
    const result = calculateVo2(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.vo2max).toBe(51.3);
    expect(result.value.fitness.levelKey).toBe("veryGood");
    expect(result.value.fitness.bandIndex).toBe(1);
    expect(result.value.fitness.thresholds.veryGood).toBe(48.3);
    expect(result.value.detail).toEqual({ kind: "cooper", distanceM: 2800 });
  });

  it("uses 220 − age when max heart rate is blank", () => {
    const draft = createVo2Draft();
    draft.method = "restingHr";
    draft.age = "30";
    draft.sex = "female";
    draft.restingHr = "60";
    draft.maxHr = "";
    const result = calculateVo2(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.vo2max).toBe(48.5);
    expect(result.value.detail).toMatchObject({
      kind: "restingHr",
      maxHr: 190,
      maxHrSource: "estimated",
    });
    expect(result.value.fitness.levelKey).toBe("excellent");
  });

  it("keeps race output as VO2 and round-trips the share link", () => {
    const draft = createVo2Draft();
    draft.method = "race";
    draft.age = "35";
    draft.sex = "male";
    draft.raceDistance = "10k";
    draft.raceHours = "0";
    draft.raceMin = "40";
    draft.raceSec = "00";
    const result = calculateVo2(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.vo2max).toBe(51.9);

    const restored = applyVo2Search(vo2SearchFromDraft(draft));
    expect(restored).not.toBeNull();
    const again = calculateVo2(restored!);
    expect(again).toEqual(result);
  });
});

describe("VO2 scorecard share restoration", () => {
  it.each(["cooper", "rockport", "beep", "restingHr", "race"] as const)(
    "restores the %s inputs and result before rendering",
    (method) => {
      const draft = {
        ...createVo2Draft(),
        method,
        age: "35",
        sex: "female" as const,
      };
      const restored = applyVo2Search(vo2SearchFromDraft(draft));
      expect(restored).not.toBeNull();
      const result = calculateVo2(draft);
      expect(result.ok).toBe(true);
      expect(calculateVo2(restored!)).toEqual(result);
    },
  );

  it("does not produce a scorecard from an invalid shared profile", () => {
    const restored = applyVo2Search(
      "?method=cooper&age=invalid&sex=male&distance=2800",
    );
    expect(restored).not.toBeNull();
    expect(calculateVo2(restored!)).toEqual({ ok: false, error: "age" });
  });
});
