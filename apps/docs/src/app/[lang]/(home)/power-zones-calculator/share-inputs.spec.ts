import { describe, expect, it } from "vitest";
import { readPowerZonesInputs } from "./share-inputs";

describe("power zones shared inputs", () => {
  it("restores model, reference, and the explicit example flag", () => {
    expect(
      readPowerZonesInputs({
        model: "friel",
        baseType: "cp",
        base: "250",
        example: "1",
      }),
    ).toEqual({
      model: "FRIEL",
      baseType: "CP",
      base: "250",
      example: true,
    });
  });

  it("stays empty when the query has no usable watts", () => {
    expect(readPowerZonesInputs({})).toEqual({
      model: null,
      baseType: null,
      base: null,
      example: false,
    });
    expect(readPowerZonesInputs({ example: "1", model: "coggan" }).example).toBe(
      false,
    );
  });

  it("ignores repeated values and overlong fields", () => {
    expect(
      readPowerZonesInputs({
        model: ["friel", "vance"],
        baseType: "ftp",
        base: "250",
      }),
    ).toEqual({
      model: null,
      baseType: "FTP",
      base: "250",
      example: false,
    });
    expect(readPowerZonesInputs({ base: "1".repeat(33), model: "coggan" })).toEqual(
      {
        model: "COGGAN",
        baseType: null,
        base: null,
        example: false,
      },
    );
  });
});
