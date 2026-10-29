import { describe, expect, it } from "vitest";
import { HeartRateZoneModel } from "@/api/settings";
import {
  getCurrentHeartRateZoneModel,
  getHeartRateZoneModelOptions,
} from "./user-profile-sport-fields-model";

describe("heart rate model selection", () => {
  it("defaults to MHR while preserving existing choices", () => {
    expect(getCurrentHeartRateZoneModel(undefined)).toBe(
      HeartRateZoneModel.MHR,
    );
    for (const model of Object.values(HeartRateZoneModel))
      expect(getCurrentHeartRateZoneModel(model)).toBe(model);
  });
  it("offers all three models with localized labels", () => {
    const options = getHeartRateZoneModelOptions((key) => key);
    expect(options.map((option) => option.value)).toEqual([
      HeartRateZoneModel.MHR,
      HeartRateZoneModel.KARVONEN,
      HeartRateZoneModel.FRIEL,
    ]);
    expect(options[0].label).toBe("fields.heartRateZoneModel.options.mhr");
  });
});
