import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

function requestDownload(lang: string) {
  return GET(new Request("https://www.trainingload.ai/download/macos"), {
    params: Promise.resolve({ lang }),
  });
}

describe("latest macOS download", () => {
  it("redirects directly to the current public DMG without caching the destination", async () => {
    const filename = "Trainingload.ai-1.3.2-mac-arm64.dmg";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          {
            tag_name: "desktop-v1.3.2",
            draft: false,
            prerelease: false,
            published_at: "2026-11-19T10:06:45Z",
            body: null,
            assets: [filename, `${filename}.sha256`].map((name) => ({
              name,
              state: "uploaded",
            })),
          },
        ]),
      ),
    );

    const response = await requestDownload("zh");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://github.com/trainingload-ai/trainingloadai/releases/download/desktop-v1.3.2/${filename}`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["en", Response.json([]), "/download#macos"],
    ["zh", new Response(null, { status: 503 }), "/zh/download#macos"],
  ])(
    "redirects %s to the download page when no DMG can be resolved",
    async (lang, upstream, location) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));

      const response = await requestDownload(lang);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(location);
    },
  );
});
