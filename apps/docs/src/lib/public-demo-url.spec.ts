import { afterEach, describe, expect, it } from "vitest";

import {
  getPublicDemoHost,
  getPublicDemoOrigin,
  publicDemoDestination,
} from "./public-demo-url";

const originalDemoHost = process.env.NEXT_PUBLIC_DEMO_HOST;

afterEach(() => {
  if (originalDemoHost === undefined) {
    delete process.env.NEXT_PUBLIC_DEMO_HOST;
  } else {
    process.env.NEXT_PUBLIC_DEMO_HOST = originalDemoHost;
  }
});

describe("public Demo URLs", () => {
  it("uses HTTP and the configured port for local Demo links", () => {
    process.env.NEXT_PUBLIC_DEMO_HOST = "localhost:3002";

    expect(getPublicDemoOrigin()).toBe("http://localhost:3002");
    expect(publicDemoDestination("zh", "/calendar")).toEqual({
      address: "localhost:3002/calendar",
      href: "http://localhost:3002/zh/calendar",
    });
  });

  it("falls back to the production Demo host for invalid configuration", () => {
    process.env.NEXT_PUBLIC_DEMO_HOST = "https://unsafe.example/path";

    expect(getPublicDemoHost()).toBe("demo.trainingload.ai");
    expect(publicDemoDestination("en", "plans/")).toEqual({
      address: "demo.trainingload.ai/plans",
      href: "https://demo.trainingload.ai/en/plans",
    });
  });
});
