import { beforeEach, describe, expect, it } from "vitest";

import {
  APP_ENTRY_ATTRIBUTION_STORAGE_KEY,
  type SignUpAttribution,
} from "@/lib/app-entry-analytics";
import { getWebRegistrationAttribution } from "@/lib/registration-attribution";

function storeAttribution(value: SignUpAttribution) {
  window.sessionStorage.setItem(
    APP_ENTRY_ATTRIBUTION_STORAGE_KEY,
    JSON.stringify(value),
  );
}

describe("web registration attribution", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/en/signup");
  });

  it("preserves the acquisition channel for ordinary web signup", () => {
    storeAttribution({
      source_context: "other",
      source_page: "/zh/signup",
      signup_source: "organic",
    });

    expect(getWebRegistrationAttribution("EMAIL")).toEqual({
      registrationPlatform: "WEB",
      registrationMethod: "EMAIL",
      acquisitionSource: "ORGANIC",
    });
  });
});
