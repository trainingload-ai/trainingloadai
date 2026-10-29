import { i18n } from "@/lib/i18n";
import { getLLMText, source } from "@/lib/source";

const LOCALES = new Set<string>(i18n.languages);
const SAFE_SEGMENT = /^[a-z0-9-]+$/i;

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai"
  ).replace(/\/+$/, "");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ lang: string; slug?: string[] }> },
) {
  const { lang, slug = [] } = await context.params;
  if (
    !LOCALES.has(lang) ||
    slug.some((segment) => !SAFE_SEGMENT.test(segment))
  ) {
    return new Response("Not Found", { status: 404 });
  }

  let contentLanguage = lang;
  let page = source.getPage(slug, contentLanguage);
  if (!page && lang !== i18n.defaultLanguage) {
    contentLanguage = i18n.defaultLanguage;
    page = source.getPage(slug, contentLanguage);
  }
  if (!page) return new Response("Not Found", { status: 404 });

  const siteUrl = getSiteUrl();
  const markdown = await getLLMText(page, siteUrl);
  const canonical = `${siteUrl}${page.url}`;

  return new Response(markdown, {
    headers: {
      "cache-control": "public, max-age=3600, s-maxage=86400",
      "content-language": contentLanguage,
      "content-type": "text/markdown; charset=utf-8",
      link: `<${canonical}>; rel="canonical"`,
      "x-robots-tag": "noindex, follow",
    },
  });
}
