import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GITHUB_RELEASES_URL,
  getDesktopReleases,
  getLatestDesktopDownload,
} from "./product-releases";
import { releaseNoteSummary } from "./release-note-summary";

function githubRelease(tag: string, assetNames: string[], publishedAt: string) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: publishedAt,
    body: "What's new",
    assets: assetNames.map((name) => ({ name, state: "uploaded" })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("desktop releases", () => {
  it.each([
    ["development", { cache: "no-store" }],
    ["production", { next: { revalidate: 300 } }],
  ] as const)(
    "uses the release refresh policy for %s",
    async (environment, options) => {
      vi.stubEnv("NODE_ENV", environment);
      const fetch = vi.fn().mockResolvedValue(Response.json([]));
      vi.stubGlobal("fetch", fetch);

      await getDesktopReleases();

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining(options),
      );
    },
  );

  it("selects the highest stable desktop version with an uploaded DMG and excludes Docker releases", async () => {
    const desktopDmg = "Trainingload.ai-1.1.26-mac-arm64.dmg";
    const olderDmg = "Trainingload.ai-1.1.9-mac-arm64.dmg";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          githubRelease(
            "desktop-v1.1.26",
            [desktopDmg],
            "2026-11-16T12:26:45Z",
          ),
          githubRelease(
            "desktop-v1.1.27",
            ["Trainingload.ai-1.1.27-mac-arm64.zip"],
            "2026-11-18T00:00:00Z",
          ),
          githubRelease(
            "desktop-v1.1.9",
            [olderDmg, `${olderDmg}.sha256`],
            "2026-11-19T00:00:00Z",
          ),
          githubRelease(
            "v1.1.28",
            ["trainingload-selfhost-1.1.28.tar.gz"],
            "2026-11-03T00:00:00Z",
          ),
          {
            ...githubRelease("desktop-v1.1.10", [], "2026-11-09T00:00:00Z"),
            draft: true,
          },
          {
            ...githubRelease("desktop-v1.1.11", [], "2026-11-10T00:00:00Z"),
            prerelease: true,
          },
        ]),
      ),
    );

    const releases = await getDesktopReleases();
    expect(releases).not.toBeNull();
    expect(releases?.map((release) => release.version)).toEqual([
      "1.1.9",
      "1.1.27",
      "1.1.26",
    ]);
    expect(getLatestDesktopDownload(releases!)).toEqual({
      version: "1.1.26",
      releaseUrl: `${GITHUB_RELEASES_URL}/tag/desktop-v1.1.26`,
      archiveUrl: `${GITHUB_RELEASES_URL}/download/desktop-v1.1.26/${desktopDmg}`,
    });
  });

  it("includes desktop releases when the first page has only Docker releases", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([githubRelease("v1.1.26", [], "2026-11-16T12:26:45Z")], {
          headers: {
            Link: '<https://api.github.com/repositories/1/releases?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json([
          githubRelease("desktop-v1.1.9", [], "2026-11-03T00:00:00Z"),
        ]),
      );
    vi.stubGlobal("fetch", fetch);

    expect((await getDesktopReleases())?.[0].version).toBe("1.1.9");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("distinguishes a successful empty feed from an unavailable feed", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    expect(await getDesktopReleases()).toEqual([]);
    expect(await getDesktopReleases()).toBeNull();
  });
});

describe("release notes", () => {
  it("omits the trailing compare URL from GitHub-generated notes", () => {
    expect(
      releaseNoteSummary(
        "## What's Changed\n\n- Fix imports.\n\n**Full Changelog**: https://github.com/example/repo/compare/v1...v2",
      ),
    ).toEqual({
      intro: "",
      highlights: ["Fix imports."],
    });
  });

  it("keeps the opening copy and highlights as plain text", () => {
    expect(
      releaseNoteSummary(
        [
          "## What's new",
          "",
          "A **new** release for [Docker](https://example.com).",
          "",
          "- Verify `install.sh`.",
          "- <em>See</em> the migration notes.",
          "",
          "Read the complete notes on GitHub.",
        ].join("\n"),
      ),
    ).toEqual({
      intro: "A new release for Docker.",
      highlights: ["Verify install.sh.", "See the migration notes."],
    });
  });
});
