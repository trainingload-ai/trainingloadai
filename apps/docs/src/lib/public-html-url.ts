import { i18n } from "@/lib/i18n";
import { localePrefix } from "@/lib/locale-url";

const MARKDOWN_PUBLIC_EXT = /\.(?:md|mdx)$/i;
const LOCALES = new Set<string>(i18n.languages);

/** Machine-readable AI endpoints. Keep them off the sitemap and hreflang set. */
export const MACHINE_READABLE_MARKDOWN_PATHS = [
  "/pricing.md",
  "/tools.md",
] as const;

const MACHINE_READABLE_MARKDOWN_PATH_SET = new Set<string>(
  MACHINE_READABLE_MARKDOWN_PATHS,
);

export function ensureLeadingSlash(pathname: string) {
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function hasMarkdownPublicExtension(pathname: string) {
  return MARKDOWN_PUBLIC_EXT.test(pathname.split("/").pop() ?? "");
}

export function isMachineReadableMarkdownPath(pathname: string) {
  return MACHINE_READABLE_MARKDOWN_PATH_SET.has(ensureLeadingSlash(pathname));
}

export function splitLocalePrefix(pathname: string) {
  const normalized = ensureLeadingSlash(pathname);
  const segments = normalized.split("/").filter(Boolean);
  const first = segments[0];
  if (first && LOCALES.has(first)) {
    return {
      locale: first,
      pathWithoutLocale: `/${segments.slice(1).join("/")}` || "/",
    };
  }
  return { locale: i18n.defaultLanguage, pathWithoutLocale: normalized };
}

export function stripMarkdownPublicExtension(pathname: string) {
  const normalized = ensureLeadingSlash(pathname);
  if (!hasMarkdownPublicExtension(normalized)) return normalized;
  const stripped = normalized.replace(MARKDOWN_PUBLIC_EXT, "");
  return stripped === "" ? "/" : stripped;
}

/**
 * Docs `.md` / `.mdx` URLs are an accidental public surface. Redirect them to
 * the extensionless HTML route, including localized prefixes.
 */
export function publicHtmlPathFromMarkdown(pathname: string) {
  const normalized = ensureLeadingSlash(pathname);
  if (!hasMarkdownPublicExtension(normalized)) return null;
  if (isMachineReadableMarkdownPath(normalized)) return null;

  const { locale, pathWithoutLocale } = splitLocalePrefix(normalized);
  const hasExplicitLocale = normalized !== pathWithoutLocale;

  if (isMachineReadableMarkdownPath(pathWithoutLocale)) {
    if (!hasExplicitLocale) return null;
    const htmlPath = stripMarkdownPublicExtension(pathWithoutLocale);
    const prefix = localePrefix(locale);
    return htmlPath === "/" ? prefix || "/" : `${prefix}${htmlPath}`;
  }

  if (!hasMarkdownPublicExtension(pathWithoutLocale)) return null;

  const cleanPath = stripMarkdownPublicExtension(pathWithoutLocale);
  const prefix = localePrefix(locale);
  if (cleanPath === "/") return prefix || "/";
  return `${prefix}${cleanPath}`;
}

export function docsMarkdownApiPath(lang: string, slug?: string[]) {
  const tail = slug?.length ? `/${slug.join("/")}` : "";
  return `/api/docs-markdown/${lang}${tail}`;
}

export function isIndexableSitemapUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    if (hasMarkdownPublicExtension(pathname)) return false;
    if (isMachineReadableMarkdownPath(pathname)) return false;
    return true;
  } catch {
    return false;
  }
}
