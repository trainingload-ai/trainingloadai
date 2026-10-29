import { describe, expect, it } from "vitest";
import type { V2ActivityListItem } from "@/api/v2-activities";
import { THIRD_PARTY_PROVIDER_BRANDS } from "@/components/third-party/provider-favicon";
import {
  DEV_ALL_PROVIDERS_ACTIVITY,
  injectDevelopmentActivityFixture,
} from "./dev-activity-feed-fixture";

describe("development activity feed fixture", () => {
  it("仅在 development 环境注入，并且不会重复注入", () => {
    const items: V2ActivityListItem[] = [];
    const injected = injectDevelopmentActivityFixture(items, "development");

    expect(injected[0]).toBe(DEV_ALL_PROVIDERS_ACTIVITY);
    expect(injectDevelopmentActivityFixture(injected, "development")).toBe(
      injected,
    );
    expect(injectDevelopmentActivityFixture(items, "production")).toBe(items);
  });

  it("包含全部第三方品牌，并同时覆盖入站和出站展示", () => {
    const expectedProviders = Object.keys(THIRD_PARTY_PROVIDER_BRANDS).sort();
    const mappings = DEV_ALL_PROVIDERS_ACTIVITY.thirdPartyMappings;

    expect(mappings.map((mapping) => mapping.provider).sort()).toEqual(
      expectedProviders,
    );
    expect(
      mappings.every((mapping) => mapping.syncDirection === "BIDIRECTIONAL"),
    ).toBe(true);
  });
});
