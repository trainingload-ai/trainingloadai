import { source } from "@/lib/source";
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { getMDXComponents } from "@/mdx-components";
import { LLMCopyButton, ViewOptions } from "@/components/page-actions";
import {
  absoluteAlternatesForLocales,
  absoluteLocalizedUrl,
  localePrefix,
} from "@/lib/locale-url";
import type { Metadata } from "next";
import { openGraphLocale, schemaLanguage } from "@/lib/seo-schema";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { docsMarkdownApiPath } from "@/lib/public-html-url";
import { DocsTableOfContentsPopover } from "@/components/DocsTableOfContentsPopover";
import { JsonLd } from "@/components/JsonLd";
import type * as PageTree from "fumadocs-core/page-tree";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

const REVIEWED_DOC_LOCALES = new Set<string>(SEO_INDEXED_LANGUAGES);

function OmitDuplicateDocsTitle() {
  return null;
}

function hasNativeDocsPage(lang: string, slug?: string[]) {
  return source.getPage(slug, lang)?.path.startsWith(`${lang}/`) ?? false;
}

function isMetricsDocsPath(slug?: string[]) {
  return slug?.[0] === "metrics";
}

function isReviewedDocsLocale(lang: string, slug?: string[]) {
  if (!REVIEWED_DOC_LOCALES.has(lang)) return false;
  return hasNativeDocsPage(lang, slug);
}

function docsAlternatesForPath(
  siteUrl: string,
  docsPath: string,
  slug?: string[],
) {
  const reviewedLocales = [...REVIEWED_DOC_LOCALES].filter((locale) =>
    hasNativeDocsPage(locale, slug),
  );

  return absoluteAlternatesForLocales(
    siteUrl,
    docsPath,
    reviewedLocales,
    reviewedLocales.includes("en") ? "en" : null,
  );
}

function normalizeKeywords(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  const keywords = raw.filter(
    (item): item is string => typeof item === "string",
  );
  return keywords.length > 0 ? keywords : undefined;
}

function docsNodeId(url: string, name: string) {
  return `${url}#${name}`;
}

function metricSchemaNode({
  lang,
  slug,
  url,
  title,
  description,
  keywords,
}: {
  lang: string;
  slug?: string[];
  url: string;
  title: string;
  description?: string;
  keywords?: string[];
}) {
  if (!isReviewedDocsLocale(lang, slug) || !isMetricsDocsPath(slug)) {
    return null;
  }

  if (slug?.length === 1) {
    return {
      "@type": "DefinedTermSet",
      "@id": docsNodeId(url, "defined-term-set"),
      name: title,
      url,
      inLanguage: schemaLanguage(lang),
      ...(description ? { description } : {}),
    };
  }

  return {
    "@type": "DefinedTerm",
    "@id": docsNodeId(url, "defined-term"),
    name: title,
    url,
    inLanguage: schemaLanguage(lang),
    ...(description ? { description } : {}),
    ...(keywords ? { alternateName: keywords } : {}),
    inDefinedTermSet: {
      "@id": docsNodeId(
        getDocsAbsoluteUrl(lang, "/docs/metrics"),
        "defined-term-set",
      ),
    },
  };
}

function getDocsPath(slug?: string[]) {
  const segments = slug ?? [];
  return segments.length > 0 ? `/docs/${segments.join("/")}` : "/docs";
}

function getDocsAbsoluteUrl(lang: string, docsPath: string) {
  return absoluteLocalizedUrl(getSiteUrl(), lang, docsPath);
}

function flattenPageTree(nodes: PageTree.Node[]): PageTree.Item[] {
  return nodes.flatMap((node) => {
    if (node.type === "folder") {
      return [
        ...(node.index ? [node.index] : []),
        ...flattenPageTree(node.children),
      ];
    }
    return node.type === "page" ? [node] : [];
  });
}

function getAdjacentDocsPages(lang: string, docsPath: string) {
  const pages = flattenPageTree(source.getPageTree(lang).children);
  const currentUrl = `${localePrefix(lang)}${docsPath}`;
  const index = pages.findIndex((item) => item.url === currentUrl);

  if (index < 0) return {};

  return {
    previous: pages[index - 1],
    next: pages[index + 1],
  };
}


function getBreadcrumbItems(
  lang: string,
  slug: string[] | undefined,
  pageTitle: string,
) {
  const siteUrl = getSiteUrl();
  const prefix = localePrefix(lang);
  const segments = slug ?? [];
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Docs",
      item: `${siteUrl}${prefix}/docs`,
    },
  ];

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    items.push({
      "@type": "ListItem",
      position: index + 2,
      name: isLast
        ? pageTitle
        : segment
            .split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
      item: `${siteUrl}${prefix}/docs/${segments.slice(0, index + 1).join("/")}`,
    });
  });

  return items;
}

export default async function Page(props: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { slug, lang } = await props.params;
  const page = source.getPage(slug, lang);
  if (!page) notFound();

  const MDXContent = page.data.body;
  const docsPath = getDocsPath(slug);
  const markdownUrl = docsMarkdownApiPath(lang, slug);
  const url = getDocsAbsoluteUrl(lang, docsPath);
  const keywords = normalizeKeywords(page.data.keywords);
  const mainEntity = metricSchemaNode({
    lang,
    slug,
    url,
    title: page.data.title,
    description: page.data.description,
    keywords,
  });
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": docsNodeId(url, "article"),
        headline: page.data.title,
        description: page.data.description,
        keywords,
        url,
        inLanguage: schemaLanguage(lang),
        ...(mainEntity ? { mainEntity: { "@id": mainEntity["@id"] } } : {}),
        author: {
          "@type": "Organization",
          name: "Trainingload.ai Team",
        },
        publisher: {
          "@type": "Organization",
          name: "Trainingload.ai",
          logo: {
            "@type": "ImageObject",
            url: `${getSiteUrl()}/og/home.jpg?v=20260912`,
          },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: getBreadcrumbItems(lang, slug, page.data.title),
      },
      mainEntity,
    ].filter(Boolean),
  };

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContentPopover={{
        component: <DocsTableOfContentsPopover title={page.data.title} />,
      }}
      breadcrumb={{ enabled: false }}
      footer={{ items: getAdjacentDocsPages(lang, docsPath) }}
    >
      <JsonLd id="docs-structured-data" data={structuredData} />
      <DocsTitle className="font-display text-[2rem] font-bold tracking-[-0.025em] md:text-[2.5rem]">
        {page.data.title}
      </DocsTitle>
      <DocsDescription className="max-w-3xl text-[15px] leading-7 text-muted-foreground md:text-base">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row items-center gap-2 border-b border-border pb-6 pt-2">
        <LLMCopyButton markdownUrl={markdownUrl} />
        <ViewOptions markdownUrl={markdownUrl} />
      </div>
      <DocsBody className="docs-prose">
        <MDXContent
          components={getMDXComponents({
            // DocsTitle already renders the page's single h1. Every docs MDX
            // file repeats its document title as a Markdown h1, so omit that
            // duplicate from the rendered article body.
            h1: OmitDuplicateDocsTitle,
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ lang: string; slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const { lang, slug } = params;
  const siteUrl = getSiteUrl();

  // Docs index: /{lang}/docs
  if (!slug || slug.length === 0) {
    const canonical = `${siteUrl}${localePrefix(lang)}/docs`;
    const isReviewedLocale = isReviewedDocsLocale(lang, slug);
    const indexPage = source.getPage([], lang);
    const keywords = normalizeKeywords(indexPage?.data.keywords);
    const hasExplicitSeoTitle = Boolean(indexPage?.data.seoTitle);
    const hasExplicitSeoDescription = Boolean(indexPage?.data.seoDescription);
    const seo = optimizeSeoText({
      locale: lang,
      context: "docs",
      optimizeShortTitle: !hasExplicitSeoTitle,
      optimizeShortDescription: !hasExplicitSeoDescription,
      title:
        indexPage?.data.seoTitle ??
        indexPage?.data.title ??
        "Trainingload.ai Documentation",
      description:
        indexPage?.data.seoDescription ??
        indexPage?.data.description ??
        "Trainingload.ai documentation for training load, metrics, plans, and AI-assisted workout review.",
    });
    return {
      title: seo.title,
      description: seo.description,
      keywords,
      alternates: {
        canonical,
        languages: docsAlternatesForPath(siteUrl, "/docs", slug),
      },
      robots: isReviewedLocale
        ? undefined
        : {
            index: false,
            follow: true,
          },
      openGraph: {
        title: seo.title,
        description: seo.description,
        type: "website",
        url: canonical,
      },
    };
  }

  const page = source.getPage(slug, lang);
  if (!page) notFound();

  const docsPath = getDocsPath(slug);
  const canonical = getDocsAbsoluteUrl(lang, docsPath);
  const keywords = normalizeKeywords(page.data.keywords);
  const isReviewedLocale = isReviewedDocsLocale(lang, slug);
  const hasExplicitSeoTitle = Boolean(page.data.seoTitle);
  const hasExplicitSeoDescription = Boolean(page.data.seoDescription);
  const seo = optimizeSeoText({
    locale: lang,
    context: "docs",
    optimizeShortTitle: !hasExplicitSeoTitle,
    optimizeShortDescription: !hasExplicitSeoDescription,
    title: page.data.seoTitle ?? page.data.title,
    description:
      page.data.seoDescription ??
      page.data.description ??
      `${page.data.title} documentation for Trainingload.ai.`,
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    alternates: {
      canonical,
      languages: docsAlternatesForPath(siteUrl, docsPath, slug),
    },
    robots: isReviewedLocale
      ? undefined
      : {
          index: false,
          follow: true,
        },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "article",
      url: canonical,
      siteName: "Trainingload.ai",
      locale: openGraphLocale(lang),
      images: [
        {
          url: `${siteUrl}/og/home.jpg?v=20260912`,
          width: 2400,
          height: 1260,
          alt: page.data.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [`${siteUrl}/og/home.jpg?v=20260912`],
    },
  };
}
