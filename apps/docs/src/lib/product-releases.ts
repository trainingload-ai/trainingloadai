import { z } from "zod";

export const GITHUB_RELEASES_URL =
  "https://github.com/trainingload-ai/trainingloadai/releases";
const GITHUB_RELEASES_API =
  "https://api.github.com/repos/trainingload-ai/trainingloadai/releases";

const releaseResponse = z.array(
  z.object({
    tag_name: z.string(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    published_at: z.string().nullable(),
    body: z.string().nullable(),
    assets: z.array(z.object({ name: z.string(), state: z.string() })),
  }),
);

type DesktopRelease = {
  tag: string;
  version: string;
  publishedAt: string;
  url: string;
  notes: string;
  assets: ReadonlySet<string>;
};

export async function getDesktopReleases(): Promise<DesktopRelease[] | null> {
  try {
    const releases: DesktopRelease[] = [];
    const signal = AbortSignal.timeout(3500);
    const caching =
      process.env.NODE_ENV === "development"
        ? { cache: "no-store" as const }
        : { next: { revalidate: 300 } };

    for (let page = 1; ; page++) {
      const response = await fetch(
        `${GITHUB_RELEASES_API}?per_page=100&page=${page}`,
        {
          headers: { Accept: "application/vnd.github+json" },
          ...caching,
          signal,
        },
      );
      if (!response.ok) return null;

      for (const release of releaseResponse.parse(await response.json())) {
        const tag = release.tag_name;
        const match = /^desktop-v(\d+\.\d+\.\d+)$/.exec(tag);
        if (
          !match ||
          release.draft ||
          release.prerelease ||
          !release.published_at
        ) {
          continue;
        }
        if (!Number.isFinite(Date.parse(release.published_at))) continue;

        releases.push({
          tag,
          version: match[1],
          publishedAt: release.published_at,
          url: `${GITHUB_RELEASES_URL}/tag/${tag}`,
          notes: release.body ?? "",
          assets: new Set(
            release.assets
              .filter((asset) => asset.state === "uploaded")
              .map((asset) => asset.name),
          ),
        });
      }
      if (!response.headers.get("link")?.includes('rel="next"')) break;
    }

    return releases.sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );
  } catch {
    return null;
  }
}

export function getLatestDesktopDownload(releases: readonly DesktopRelease[]) {
  const newestFirst = releases.toSorted((a, b) =>
    b.version.localeCompare(a.version, "en", { numeric: true }),
  );
  for (const release of newestFirst) {
    const archive = `Trainingload.ai-${release.version}-mac-arm64.dmg`;
    if (!release.assets.has(archive)) continue;

    return {
      version: release.version,
      releaseUrl: release.url,
      archiveUrl: `${GITHUB_RELEASES_URL}/download/${release.tag}/${archive}`,
    };
  }
}
