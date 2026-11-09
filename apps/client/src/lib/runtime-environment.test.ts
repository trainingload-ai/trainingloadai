import { afterEach, describe, expect, it } from "vitest";
import {
  getRuntimePlatform,
  resolveRuntimeEnvironment,
} from "./runtime-environment";

afterEach(() => {
  delete window.trainingloadDesktop;
});

describe("runtime environment", () => {
  it.each([
    ["cloud", "web", false],
    ["self-host", "web", false],
    ["self-host", "desktop", true],
    ["cloud", "desktop", false],
  ] as const)(
    "scopes desktop self-host presentation to %s / %s",
    (edition, platform, expected) => {
      expect(
        resolveRuntimeEnvironment(edition, platform).isDesktopSelfHost,
      ).toBe(expected);
    },
  );

  it("defaults to web without a versioned desktop bridge", () => {
    expect(getRuntimePlatform()).toBe("web");
    Object.defineProperty(window, "trainingloadDesktop", {
      configurable: true,
      value: { platform: "darwin" },
    });
    expect(getRuntimePlatform()).toBe("web");
  });

  it("recognizes the desktop platform independently of the operating system", () => {
    Object.defineProperty(window, "trainingloadDesktop", {
      configurable: true,
      value: {
        schemaVersion: 1,
        runtimePlatform: "desktop",
        platform: "win32",
      },
    });
    expect(getRuntimePlatform()).toBe("desktop");
  });
});
