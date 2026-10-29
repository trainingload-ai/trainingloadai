import type { MetadataRoute } from "next";
import { i18n, isSeoIndexedLanguage, SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { source } from "@/lib/source";
import {
  blogAlternatesForSlug,
  blogIndexAlternates,
  blogSource,
  generateNativeBlogParams,
  getNativeBlogLanguages,
  getNativeBlogPages,
} from "@/lib/blog-source";
import {
  absoluteAlternatesForLocales,
  localePrefix,
  withLocalePath,
} from "@/lib/locale-url";
import {
  VDOT_CONTENT_LOCALES,
  vdotContentAlternates,
} from "@/lib/vdot-plan-content";
import { isIndexableSitemapUrl } from "@/lib/public-html-url";
import { stat } from "node:fs/promises";
import { join } from "node:path";

// Regenerate the sitemap at least once per day without inventing a new
// lastModified timestamp for pages whose content did not change.
export const revalidate = 86_400;

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

function ensureLeadingSlash(pathname: string) {
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function toBasePathFromPublicPath(publicPathname: string) {
  const normalized = ensureLeadingSlash(publicPathname);
  for (const lang of i18n.languages) {
    const prefix = localePrefix(lang);
    if (!prefix) continue;
    if (normalized === prefix) return "/";
    if (normalized.startsWith(`${prefix}/`)) {
      return `/${normalized.slice(prefix.length + 1)}`;
    }
  }
  return normalized;
}

function alternatesForPublicPath(siteUrl: string, publicPathname: string) {
  const base = toBasePathFromPublicPath(publicPathname);
  return {
    languages: absoluteAlternatesForLocales(
      siteUrl,
      base,
      SEO_INDEXED_LANGUAGES,
    ),
  };
}

const REVIEWED_DOC_LOCALES = new Set<string>(SEO_INDEXED_LANGUAGES);

function docsSlugFromBasePath(basePathname: string) {
  const parts = basePathname.split("/").filter(Boolean);
  if (parts[0] !== "docs") return null;
  return parts.slice(1);
}

function hasNativeDocsPage(lang: string, slug: string[]) {
  return source.getPage(slug, lang)?.path.startsWith(`${lang}/`) ?? false;
}

function reviewedDocsAlternates(siteUrl: string, publicPathname: string) {
  const base = toBasePathFromPublicPath(publicPathname);
  const slug = docsSlugFromBasePath(base);
  if (!slug) return alternatesForPublicPath(siteUrl, publicPathname);
  const reviewedLocales = [...REVIEWED_DOC_LOCALES].filter((locale) =>
    hasNativeDocsPage(locale, slug),
  );

  return {
    languages: absoluteAlternatesForLocales(siteUrl, base, reviewedLocales),
  };
}

function getChangeFreqAndPriority(pathname: string) {
  if (pathname === "/")
    return { changeFrequency: "daily" as const, priority: 1.0 };
  if (pathname === "/docs")
    return { changeFrequency: "weekly" as const, priority: 0.9 };
  if (pathname.startsWith("/docs/"))
    return { changeFrequency: "weekly" as const, priority: 0.8 };
  if (pathname === "/blog")
    return { changeFrequency: "weekly" as const, priority: 0.8 };
  if (pathname.startsWith("/blog/"))
    return { changeFrequency: "monthly" as const, priority: 0.7 };
  if (pathname === "/tools")
    return { changeFrequency: "weekly" as const, priority: 0.85 };
  if (pathname === "/free-ai-workout-review")
    return { changeFrequency: "weekly" as const, priority: 0.92 };
  if (pathname === "/training-load")
    return { changeFrequency: "weekly" as const, priority: 0.9 };
  if (pathname === "/ai-training-plan")
    return { changeFrequency: "weekly" as const, priority: 0.9 };
  if (pathname === "/ai-marathon-training-plan")
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (pathname === "/ai-half-marathon-training-plan")
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (pathname === "/ai-coach")
    return { changeFrequency: "weekly" as const, priority: 0.9 };
  if (
    pathname === "/ai-coach/running-coach" ||
    pathname === "/ai-coach/cycling-coach"
  )
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (pathname === "/training-analysis")
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (pathname === "/alternatives")
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (pathname === "/plan")
    return { changeFrequency: "weekly" as const, priority: 0.9 };
  if (pathname === "/rpe-scale")
    return { changeFrequency: "monthly" as const, priority: 0.88 };
  if (pathname === "/couch-to-5k-training-plan")
    return { changeFrequency: "weekly" as const, priority: 0.92 };
  if (
    pathname === "/5k-training-plan" ||
    pathname === "/5k-training-plan/intermediate"
  )
    return { changeFrequency: "weekly" as const, priority: 0.92 };
  if (pathname === "/marathon-training-plan")
    return { changeFrequency: "weekly" as const, priority: 0.93 };
  if (
    pathname === "/10k-training-plan" ||
    pathname === "/half-marathon-training-plan"
  )
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (
    pathname === "/cycling-training-plan" ||
    pathname === "/ironman-70-3-training-plan" ||
    pathname === "/olympic-triathlon-training-plan" ||
    pathname === "/brick-workout" ||
    pathname === "/swim-training-plan"
  )
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (pathname === "/features/pmc-fitness-chart")
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (pathname === "/features/power-curve")
    return { changeFrequency: "weekly" as const, priority: 0.84 };
  if (pathname === "/features/power-rankings")
    return { changeFrequency: "weekly" as const, priority: 0.84 };
  if (pathname === "/features/custom-zones")
    return { changeFrequency: "weekly" as const, priority: 0.84 };
  if (pathname === "/features/cp-ftp-lthr-estimator")
    return { changeFrequency: "weekly" as const, priority: 0.84 };
  if (pathname === "/features/effective-vo2max-trend")
    return { changeFrequency: "weekly" as const, priority: 0.84 };
  if (pathname === "/features/best-efforts")
    return { changeFrequency: "weekly" as const, priority: 0.84 };
  if (pathname === "/features/mcp")
    return { changeFrequency: "weekly" as const, priority: 0.88 };
  if (pathname === "/features/fitness-fatigue-form")
    return { changeFrequency: "weekly" as const, priority: 0.86 };
  if (pathname.startsWith("/tools/"))
    return { changeFrequency: "monthly" as const, priority: 0.8 };
  // calculators / landing pages
  if (
    pathname === "/ftp-calculator" ||
    pathname === "/critical-power-calculator" ||
    pathname === "/lactate-threshold-calculator" ||
    pathname === "/converter" ||
    pathname === "/fit-to-gpx" ||
    pathname === "/gpx-to-fit" ||
    pathname === "/tcx-to-gpx" ||
    pathname === "/gpx-to-tcx" ||
    pathname === "/fit-to-tcx" ||
    pathname === "/tcx-to-fit" ||
    pathname === "/fit-course-converter" ||
    pathname === "/fit-file-viewer" ||
    pathname === "/max-heart-rate-calculator" ||
    pathname === "/heart-rate-zones-calculator" ||
    pathname === "/zone-2-heart-rate-calculator" ||
    pathname === "/css-calculator" ||
    pathname === "/vo2-max-calculator" ||
    pathname === "/vdot-calculator" ||
    pathname === "/running-pace-calculator" ||
    pathname === "/race-time-predictor" ||
    pathname === "/daniels-running-formula" ||
    pathname === "/power-zones-calculator" ||
    pathname === "/tss-calculator" ||
    pathname === "/training-load-calculator" ||
    pathname === "/workout-editor"
  ) {
    return { changeFrequency: "monthly" as const, priority: 0.8 };
  }
  return { changeFrequency: "monthly" as const, priority: 0.6 };
}

function isReviewedDocsSitemapEntry(lang: string, slug: string[]) {
  if (!REVIEWED_DOC_LOCALES.has(lang)) return false;
  return hasNativeDocsPage(lang, slug);
}

const STATIC_LAST_MODIFIED: Partial<Record<string, string>> = {
  "/5k-to-10k-training-plan": "2026-10-15",
  "/couch-to-10k-training-plan": "2026-10-15",
  "/10k-training-plan/improve": "2026-10-15",
  "/10k-training-plan/target": "2026-10-15",
  "/half-marathon-training-plan/improve": "2026-10-15",
  "/half-marathon-training-plan/target": "2026-10-15",
  "/marathon-training-plan/improve": "2026-10-15",
  "/marathon-training-plan/target": "2026-10-15",
  "/": "2026-08-28",
  "/rpe-scale": "2026-08-28",
  "/daniels-running-formula": "2026-08-25",
  "/plan": "2026-08-25",
  "/couch-to-5k-training-plan": "2026-10-15",
  "/5k-training-plan": "2026-10-15",
  "/5k-training-plan/intermediate": "2026-10-15",
  "/10k-training-plan": "2026-10-15",
  "/half-marathon-training-plan": "2026-10-15",
  "/marathon-training-plan": "2026-10-15",
  "/cycling-training-plan": "2026-09-18",
  "/ironman-70-3-training-plan": "2026-09-18",
  "/ai-training-plan": "2026-09-06",
  "/ai-marathon-training-plan": "2026-09-06",
  "/ai-half-marathon-training-plan": "2026-09-06",
  "/tss-calculator": "2026-09-18",
  "/training-load-calculator": "2026-09-18",
  "/zone-2-heart-rate-calculator": "2026-09-28",
  "/brick-workout": "2026-09-18",
  "/olympic-triathlon-training-plan": "2026-09-18",
  "/swim-training-plan": "2026-09-18",
  "/css-calculator": "2026-09-18",
  "/race-time-predictor": "2026-10-26",
  "/running-pace-calculator": "2026-10-26",
};

async function safeStatMtimeMs(filePath: string) {
  try {
    const s = await stat(filePath);
    return s.mtimeMs;
  } catch {
    return null;
  }
}

function docFileCandidates(lang: string, slug: string[]) {
  const base = join(process.cwd(), "content", "docs", lang);
  if (slug.length === 0) {
    return [join(base, "index.mdx")];
  }
  const rel = join(...slug);
  return [join(base, `${rel}.mdx`), join(base, rel, "index.mdx")];
}

function blogFileCandidates(lang: string, slug: string[]) {
  const base = join(process.cwd(), "content", "blog", lang);
  const rel = slug.length ? join(...slug) : "";
  return [join(base, `${rel}.mdx`), join(base, rel, "index.mdx")];
}

async function resolveLastModifiedFromFiles(
  candidates: string[],
  fallback: Date,
) {
  let best: number | null = null;
  for (const fp of candidates) {
    const m = await safeStatMtimeMs(fp);
    if (m != null && (best == null || m > best)) best = m;
  }
  return best != null ? new Date(best) : fallback;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const entries: MetadataRoute.Sitemap = [];

  const now = new Date();
  entries.push(
    // Root path serves default-locale homepage; keep it discoverable.
    {
      url: `${siteUrl}/`,
      lastModified: new Date(`${STATIC_LAST_MODIFIED["/"]}T00:00:00.000Z`),
      alternates: alternatesForPublicPath(siteUrl, "/"),
      ...getChangeFreqAndPriority("/"),
    },
  );

  const staticPaths = [
    "",
    "/features",
    "/training-load",
    "/ai-training-plan",
    "/ai-marathon-training-plan",
    "/ai-half-marathon-training-plan",
    "/ai-coach",
    "/ai-coach/running-coach",
    "/ai-coach/cycling-coach",
    "/training-analysis",
    "/alternatives",
    "/plan",
    "/rpe-scale",
    "/couch-to-5k-training-plan",
    "/5k-training-plan",
    "/5k-training-plan/intermediate",
    "/5k-to-10k-training-plan",
    "/couch-to-10k-training-plan",
    "/10k-training-plan",
    "/10k-training-plan/improve",
    "/10k-training-plan/target",
    "/half-marathon-training-plan",
    "/half-marathon-training-plan/improve",
    "/half-marathon-training-plan/target",
    "/marathon-training-plan",
    "/marathon-training-plan/improve",
    "/marathon-training-plan/target",
    "/cycling-training-plan",
    "/ironman-70-3-training-plan",
    "/olympic-triathlon-training-plan",
    "/brick-workout",
    "/swim-training-plan",
    "/features/pmc-fitness-chart",
    "/features/power-curve",
    "/features/power-rankings",
    "/features/custom-zones",
    "/features/cp-ftp-lthr-estimator",
    "/features/effective-vo2max-trend",
    "/features/best-efforts",
    "/features/mcp",
    "/features/fitness-fatigue-form",
    "/tools",
    "/free-ai-workout-review",
    "/pricing",
    "/ftp-calculator",
    "/critical-power-calculator",
    "/lactate-threshold-calculator",
    "/converter",
    "/fit-to-gpx",
    "/gpx-to-fit",
    "/tcx-to-gpx",
    "/gpx-to-tcx",
    "/fit-to-tcx",
    "/tcx-to-fit",
    "/fit-course-converter",
    "/fit-file-viewer",
    "/max-heart-rate-calculator",
    "/heart-rate-zones-calculator",
    "/zone-2-heart-rate-calculator",
    "/css-calculator",
    "/vo2-max-calculator",
    "/vdot-calculator",
    "/running-pace-calculator",
    "/race-time-predictor",
    "/power-zones-calculator",
    "/tss-calculator",
    "/training-load-calculator",
    "/workout-editor",
    "/contact",
    "/privacy",
    "/terms-and-conditions",
    "/docs",
  ];

  for (const lang of SEO_INDEXED_LANGUAGES) {
    for (const path of staticPaths) {
      // as-needed locale prefix:
      // - default locale (en): "/docs"
      // - other locales (zh): "/zh/docs"
      const urlPath = withLocalePath(lang, path || "/");
      const pathname =
        path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;

      // Prefer real content mtime for docs index.
      const lastModified =
        pathname === "/docs"
          ? await resolveLastModifiedFromFiles(docFileCandidates(lang, []), now)
          : STATIC_LAST_MODIFIED[pathname]
            ? new Date(`${STATIC_LAST_MODIFIED[pathname]}T00:00:00.000Z`)
            : undefined;
      entries.push({
        url: `${siteUrl}${urlPath}`,
        ...(lastModified ? { lastModified } : {}),
        alternates: alternatesForPublicPath(siteUrl, urlPath),
        ...getChangeFreqAndPriority(pathname),
      });
    }
  }

  for (const lang of getNativeBlogLanguages()) {
    const posts = getNativeBlogPages(lang);
    const latestPublishedAt = posts.reduce<Date | null>((latest, post) => {
      const publishedAt = post.data.date ? new Date(post.data.date) : null;
      if (!publishedAt || Number.isNaN(publishedAt.getTime())) return latest;
      return !latest || publishedAt > latest ? publishedAt : latest;
    }, null);
    const urlPath = withLocalePath(lang, "/blog");

    entries.push({
      url: `${siteUrl}${urlPath}`,
      lastModified: latestPublishedAt ?? now,
      alternates: {
        languages: blogIndexAlternates(siteUrl),
      },
      ...getChangeFreqAndPriority("/blog"),
    });
  }

  for (const path of ["/daniels-running-formula"]) {
    for (const lang of VDOT_CONTENT_LOCALES) {
      const urlPath = `${localePrefix(lang)}${path}`;
      entries.push({
        url: `${siteUrl}${urlPath}`,
        lastModified: new Date(`${STATIC_LAST_MODIFIED[path]!}T00:00:00.000Z`),
        alternates: {
          languages: vdotContentAlternates(siteUrl, path),
        },
        ...getChangeFreqAndPriority(path),
      });
    }
  }

  for (const p of generateNativeBlogParams()) {
    const slug = Array.isArray(p.slug) ? p.slug : [];
    if (!isSeoIndexedLanguage(p.lang)) continue;
    const prefix = localePrefix(p.lang);
    const pathname = `/blog/${slug.join("/")}`;
    const page = blogSource.getPage(slug, p.lang);
    const fmDate = page?.data?.date ? new Date(page.data.date) : null;
    const lastModified =
      fmDate && !Number.isNaN(fmDate.getTime())
        ? fmDate
        : await resolveLastModifiedFromFiles(
            blogFileCandidates(p.lang, slug),
            now,
          );
    const urlPath = `${prefix}/blog/${slug.join("/")}`;
    entries.push({
      url: `${siteUrl}${urlPath}`,
      lastModified,
      alternates: {
        languages: blogAlternatesForSlug(siteUrl, slug),
      },
      ...getChangeFreqAndPriority(pathname),
    });
  }

  for (const p of source.generateParams()) {
    const slug = Array.isArray(p.slug) ? p.slug : [];
    if (!isReviewedDocsSitemapEntry(p.lang, slug)) continue;

    const tail = slug.length > 0 ? `/${slug.join("/")}` : "";
    const prefix = localePrefix(p.lang);
    const pathname = tail ? `/docs${tail}` : "/docs";
    const lastModified = await resolveLastModifiedFromFiles(
      docFileCandidates(p.lang, slug),
      now,
    );
    const urlPath = `${prefix}/docs${tail}`;
    entries.push({
      url: `${siteUrl}${urlPath}`,
      lastModified,
      alternates: reviewedDocsAlternates(siteUrl, urlPath),
      ...getChangeFreqAndPriority(pathname),
    });
  }

  const deduped = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const item of entries) {
    if (!isIndexableSitemapUrl(item.url)) continue;
    deduped.set(item.url, item);
  }
  return [...deduped.values()];
}
