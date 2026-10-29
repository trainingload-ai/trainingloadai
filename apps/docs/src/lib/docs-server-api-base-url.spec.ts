import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDocsServerApiBaseUrl } from "./docs-server-api-base-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDocsServerApiBaseUrl", () => {
  it("prefers the runtime-only internal URL", () => {
    vi.stubEnv("DOCS_INTERNAL_API_URL", "http://server:3001/");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.trainingload.ai");

    expect(getDocsServerApiBaseUrl()).toBe("http://server:3001");
  });

  it("keeps the managed public URL as a server fallback", () => {
    vi.stubEnv("DOCS_INTERNAL_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.trainingload.ai/");

    expect(getDocsServerApiBaseUrl()).toBe("https://api.trainingload.ai");
  });

  it("rejects credentials and non-HTTP schemes", () => {
    vi.stubEnv("DOCS_INTERNAL_API_URL", "http://user:pass@server:3001");
    expect(() => getDocsServerApiBaseUrl()).toThrow("DOCS_INTERNAL_API_URL");

    vi.stubEnv("DOCS_INTERNAL_API_URL", "file:///tmp/api");
    expect(() => getDocsServerApiBaseUrl()).toThrow("DOCS_INTERNAL_API_URL");

    vi.stubEnv("DOCS_INTERNAL_API_URL", "http://server:3001/base");
    expect(() => getDocsServerApiBaseUrl()).toThrow("DOCS_INTERNAL_API_URL");
  });
});
