import { loader } from "fumadocs-core/source";
import { blog } from "@/.source";
import { i18n, SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { absoluteAlternatesForLocales } from "@/lib/locale-url";

export const blogSource = loader({
  i18n,
  baseUrl: "/blog",
  source: blog.toFumadocsSource?.() ?? blog,
});

export function getNativeBlogPage(slug: string[], lang: string) {
  const page = blogSource.getPage(slug, lang);
  return page?.path.startsWith(`${lang}/`) ? page : undefined;
}

export function getBlogPageWithFallback(slug: string[], lang: string) {
  const nativePage = getNativeBlogPage(slug, lang);
  if (nativePage) {
    return {
      page: nativePage,
      contentLanguage: lang,
      isFallback: false,
    };
  }

  const fallbackPage = getNativeBlogPage(slug, i18n.defaultLanguage);
  if (!fallbackPage) return undefined;

  return {
    page: fallbackPage,
    contentLanguage: i18n.defaultLanguage,
    isFallback: lang !== i18n.defaultLanguage,
  };
}

export function getNativeBlogPages(lang: string) {
  return [...blogSource.getPages(lang)].filter((page) =>
    page.path.startsWith(`${lang}/`),
  );
}

export function getNativeBlogLanguages() {
  return SEO_INDEXED_LANGUAGES.filter(
    (lang) => getNativeBlogPages(lang).length > 0,
  );
}

export function getBlogPagesWithFallback(lang: string) {
  const nativePages = getNativeBlogPages(lang);
  if (lang === i18n.defaultLanguage) return nativePages;

  const nativeBySlug = new Map(
    nativePages.map((page) => [page.slugs.join("/"), page]),
  );
  const fallbackPages = getNativeBlogPages(i18n.defaultLanguage);
  const fallbackSlugs = new Set(
    fallbackPages.map((page) => page.slugs.join("/")),
  );

  return [
    ...fallbackPages.map(
      (page) => nativeBySlug.get(page.slugs.join("/")) ?? page,
    ),
    ...nativePages.filter((page) => !fallbackSlugs.has(page.slugs.join("/"))),
  ];
}

export function blogIndexAlternates(siteUrl: string) {
  return absoluteAlternatesForLocales(
    siteUrl,
    "/blog",
    getNativeBlogLanguages(),
  );
}

export function blogPageContentLanguage(
  page: ReturnType<typeof blogSource.getPages>[number],
  requestedLanguage: string,
) {
  return page.path.startsWith(`${requestedLanguage}/`)
    ? requestedLanguage
    : i18n.defaultLanguage;
}

export function generateNativeBlogParams() {
  return blogSource
    .generateParams()
    .filter((params) => getNativeBlogPage(params.slug, params.lang));
}

export function generateBlogParamsWithFallback() {
  const uniqueSlugs = new Map<string, string[]>();

  for (const params of blogSource.generateParams()) {
    const slug = Array.isArray(params.slug) ? params.slug : [];
    uniqueSlugs.set(slug.join("/"), slug);
  }

  return i18n.languages.flatMap((lang) =>
    [...uniqueSlugs.values()]
      .filter((slug) => getBlogPageWithFallback(slug, lang))
      .map((slug) => ({ lang, slug })),
  );
}

/** Build hreflang entries only for native translations of a blog post. */
export function blogAlternatesForSlug(siteUrl: string, slug: string[]) {
  const translatedLanguages = SEO_INDEXED_LANGUAGES.filter((lang) =>
    getNativeBlogPage(slug, lang),
  );
  const defaultLanguage =
    translatedLanguages.find((lang) => lang === i18n.defaultLanguage) ??
    translatedLanguages[0];
  const articlePath = `/blog/${slug.join("/")}`;

  return absoluteAlternatesForLocales(
    siteUrl,
    articlePath,
    translatedLanguages,
    defaultLanguage ?? null,
  );
}
