import {
  APP_SESSION_STARTED_STORAGE_KEY,
  buildAppSessionStartedProperties,
  buildSignUpAttribution,
  createAppSessionStartClaimer,
  readSignUpAttribution,
  rememberSignUpAttribution,
  resolveAppEntrySource,
} from "@/lib/app-entry-analytics";
import { buildToolAppUrl } from "@shared/product-analytics";

function source(
  url: string,
  referrer = "",
  origin = "https://app.trainingload.ai",
) {
  const parsed = new URL(url, origin);
  return resolveAppEntrySource({
    searchParams: parsed.searchParams,
    referrer,
    origin,
  });
}

describe("app entry analytics", () => {
  it("builds a stable cross-site tool attribution URL", () => {
    const url = new URL(
      buildToolAppUrl({
        locale: "en",
        toolId: "free_ai_workout_review",
        ctaPlacement: "result_sidebar",
        destination: "signup",
      }),
    );

    expect(url.origin).toBe("https://app.trainingload.ai");
    expect(url.pathname).toBe("/en/signup");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: "docs-tool",
      tool: "free_ai_workout_review",
      cta: "result_sidebar",
    });
  });

  it("classifies known docs entries without exposing raw query values", () => {
    expect(
      source(
        "/en?from=docs-tool&tool=free_ai_workout_review&cta=result_sidebar",
      ),
    ).toBe("docs_tool");
    expect(source("/en/ai-coach?from=docs-ai-coach")).toBe("docs");

    const properties = buildAppSessionStartedProperties({
      pathname: "/en/signup",
      authenticated: false,
      searchParams: new URLSearchParams(
        "from=docs-tool&tool=free_ai_workout_review&cta=result_sidebar&email=private@example.com",
      ),
      referrer: "https://www.trainingload.ai/tool?user=private",
      origin: "https://app.trainingload.ai",
    });

    expect(properties).toEqual({
      event_schema_version: "1.0",
      landing_path: "/en/signup",
      auth_state: "anonymous",
      entry_source: "docs_tool",
      source_tool_id: "free_ai_workout_review",
      cta_placement: "result_sidebar",
    });
    expect(JSON.stringify(properties)).not.toContain("private");
  });

  it("drops unknown tool and CTA values instead of forwarding them", () => {
    const properties = buildAppSessionStartedProperties({
      pathname: "/en/signup",
      authenticated: true,
      searchParams: new URLSearchParams(
        "from=docs-tool&tool=attacker-controlled&cta=anything",
      ),
      referrer: "",
      origin: "https://app.trainingload.ai",
    });

    expect(properties).toEqual({
      event_schema_version: "1.0",
      landing_path: "/en/signup",
      auth_state: "authenticated",
      entry_source: "docs_tool",
      source_tool_id: undefined,
      cta_placement: undefined,
    });
  });

  it("persists only the first safe signup attribution for an auth redirect", () => {
    const storage = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const entry = buildAppSessionStartedProperties({
      pathname: "/en/signup",
      authenticated: false,
      searchParams: new URLSearchParams(
        "from=docs-tool&tool=activity_file_converter_gpx-to-fit&cta=result",
      ),
      referrer: "https://trainingload.ai/en/gpx-to-fit",
      origin: "https://app.trainingload.ai",
    });

    rememberSignUpAttribution(buildSignUpAttribution(entry), sessionStorage);
    rememberSignUpAttribution(
      {
        signup_source: "direct",
        source_context: "other",
        source_page: "/should-not-replace",
      },
      sessionStorage,
    );

    expect(readSignUpAttribution(sessionStorage)).toEqual({
      cta_name: "start_free",
      signup_source: "docs_tool",
      source_context: "tool_page",
      source_page: "/en/signup",
      tool_name: "gpx_to_fit",
    });
  });

  it("classifies campaigns and referrers with explicit precedence", () => {
    expect(source("/?utm_medium=email")).toBe("email");
    expect(source("/?utm_medium=paid_social")).toBe("paid");
    expect(source("/?utm_source=partner")).toBe("campaign");
    expect(source("/", "https://www.google.com/search?q=training")).toBe(
      "organic",
    );
    expect(source("/", "https://example.com/article?id=1")).toBe("referral");
    expect(source("/", "https://app.trainingload.ai/en/calendar")).toBe(
      "internal",
    );
    expect(source("/", "")).toBe("direct");
    expect(source("/", "not a url")).toBe("unknown");
  });

  it("claims a browser session once and persists the marker", () => {
    const claim = createAppSessionStartClaimer();
    const storage = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    expect(claim(sessionStorage)).toBe(true);
    expect(storage.get(APP_SESSION_STARTED_STORAGE_KEY)).toBe("1");
    expect(claim(sessionStorage)).toBe(false);
  });

  it("falls back to an in-memory guard when sessionStorage is blocked", () => {
    const claim = createAppSessionStartClaimer();
    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(claim(blockedStorage)).toBe(true);
    expect(claim(blockedStorage)).toBe(false);
  });
});
