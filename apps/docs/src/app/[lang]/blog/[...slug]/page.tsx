import { notFound } from "next/navigation";
import {
  blogAlternatesForSlug,
  generateBlogParamsWithFallback,
  getBlogPageWithFallback,
} from "@/lib/blog-source";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { Pre } from "fumadocs-ui/components/codeblock";
import { JsonLd } from "@/components/JsonLd";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { localePrefix } from "@/lib/locale-url";
import { dateLocale, openGraphLocale, schemaLanguage } from "@/lib/seo-schema";
import { getMDXComponents } from "@/mdx-components";
import { ZoomableImage } from "@/components/ZoomableImage";
import { BlogArticleLink } from "@/components/BlogArticleLink";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

function resolveAbsoluteUrl(siteUrl: string, input: string) {
  if (!input) return input;
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  if (input.startsWith("/")) return `${siteUrl}${input}`;
  return `${siteUrl}/${input}`;
}

export function generateStaticParams() {
  return generateBlogParamsWithFallback();
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string[]; lang: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const resolved = getBlogPageWithFallback(params.slug, params.lang);
  if (!resolved) return {};
  const { page, contentLanguage, isFallback } = resolved;

  const siteUrl = getSiteUrl();
  const canonicalPrefix = localePrefix(contentLanguage);
  const url = `${siteUrl}${canonicalPrefix}/blog/${params.slug.join("/")}`;
  const publishedTime = page.data.date
    ? new Date(page.data.date).toISOString()
    : undefined;
  const ogImageRaw = page.data.image || "/og/home.jpg?v=20260912";
  const ogImage = resolveAbsoluteUrl(siteUrl, ogImageRaw);

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: url,
      languages: blogAlternatesForSlug(siteUrl, params.slug),
    },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      type: "article",
      publishedTime,
      authors: page.data.author ? [page.data.author] : undefined,
      url,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: page.data.title,
        },
      ],
      siteName: "Trainingload.ai",
      locale: openGraphLocale(contentLanguage),
    },
    twitter: {
      card: "summary_large_image",
      title: page.data.title,
      description: page.data.description,
      images: [ogImage],
    },
    keywords: page.data.tags
      ? [
          ...page.data.tags,
          "endurance training",
          "training analytics",
          "Trainingload.ai",
        ]
      : ["endurance training", "training analytics", "Trainingload.ai"],
    authors: page.data.author ? [{ name: page.data.author }] : undefined,
    robots: isFallback ? { index: false, follow: true } : undefined,
  };
}

export default async function BlogPostPage(props: {
  params: Promise<{ slug: string[]; lang: string }>;
}) {
  const params = await props.params;
  const { lang } = params;
  const siteUrl = getSiteUrl();
  const prefix = localePrefix(lang);
  const resolved = getBlogPageWithFallback(params.slug, lang);
  const t = await getTranslations({ locale: lang, namespace: "blog.page" });

  if (!resolved) {
    notFound();
  }

  const { page, contentLanguage } = resolved;
  const canonicalPrefix = localePrefix(contentLanguage);
  const url = `${siteUrl}${canonicalPrefix}/blog/${params.slug.join("/")}`;

  const MDXContent = page.data.body;
  const date = page.data.date ? new Date(page.data.date) : null;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    headline: page.data.title,
    description: page.data.description,
    url,
    inLanguage: schemaLanguage(contentLanguage),
    datePublished: date?.toISOString(),
    dateModified: date?.toISOString(),
    author: {
      "@type": "Person",
      name: page.data.author || "Trainingload.ai Team",
    },
    publisher: {
      "@type": "Organization",
      name: "Trainingload.ai",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/LOGO_LIGHT.svg`,
      },
    },
    image: page.data.image
      ? resolveAbsoluteUrl(siteUrl, page.data.image)
      : undefined,
    keywords: page.data.tags?.join(", "),
  };

  return (
    <>
      <JsonLd id="structured-data" data={structuredData} />
      <article
        lang={schemaLanguage(contentLanguage)}
        className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16 sm:px-6 lg:px-8"
      >
        <Link
          href={`${prefix}/blog`}
          className="mb-10 inline-flex items-center font-mono text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
        >
          <ChevronLeft className="mr-1 size-4" />
          {t("backToBlog")}
        </Link>

        <header className="mb-10">
          {page.data.tags && page.data.tags.length > 0 && (
            <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
              {page.data.tags.slice(0, 4).join("  /  ")}
            </p>
          )}

          <h1 className="max-w-4xl text-balance text-4xl font-black leading-[1.02] tracking-[-0.04em] text-neutral-950 dark:text-white sm:text-5xl md:text-6xl">
            {page.data.title}
          </h1>

          {page.data.description && (
            <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-600 dark:text-neutral-300 sm:text-xl">
              {page.data.description}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-neutral-300 pt-5 font-mono text-xs uppercase tracking-[0.07em] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            {date && (
              <time className="whitespace-nowrap" dateTime={date.toISOString()}>
                {date.toLocaleDateString(dateLocale(contentLanguage), {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            )}

            {page.data.author && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="whitespace-nowrap">
                  {t("by")} {page.data.author}
                </span>
              </>
            )}
          </div>
        </header>

        {page.data.image && (
          <ZoomableImage
            src={page.data.image}
            alt={page.data.title}
            className="mb-12 aspect-[40/21] h-auto w-full rounded-control border border-neutral-200 object-cover dark:border-neutral-800"
          />
        )}

        <div
          className="prose prose-lg prose-neutral mx-auto max-w-4xl dark:prose-invert
        prose-code:before:content-none prose-code:after:content-none
        prose-p:leading-8 prose-li:leading-8 prose-headings:scroll-mt-40 prose-headings:tracking-[-0.025em]
        prose-h2:mt-10 prose-h2:text-3xl prose-h2:font-bold prose-h2:leading-tight
        prose-blockquote:border-emerald-600 prose-blockquote:text-xl prose-blockquote:font-medium prose-blockquote:not-italic dark:prose-blockquote:border-emerald-400
        [&_pre]:my-5 [&_pre]:overflow-x-auto [&_table]:w-full [&_table]:min-w-[42rem]"
        >
          <MDXContent
            components={getMDXComponents({
              pre: ({ children }: { children?: ReactNode }) => (
                <Pre className="!w-full max-w-full overflow-x-auto rounded-compact border border-neutral-200 bg-white dark:border-border dark:bg-card">
                  {children}
                </Pre>
              ),
              code: ({
                className,
                ...props
              }: ComponentPropsWithoutRef<"code">) => {
                // Check if this code is inside a pre tag (code block)
                const isCodeBlock = className?.includes("language-");
                if (isCodeBlock) {
                  return <code className={className} {...props} />;
                }
                // Inline code
                return (
                  <code
                    className="bg-white dark:bg-card px-1.5 py-0.5 rounded text-sm"
                    {...props}
                  />
                );
              },
              a: ({ href, ...props }: ComponentPropsWithoutRef<"a">) => {
                if (!href) return <a {...props} />;

                return (
                  <BlogArticleLink
                    {...props}
                    href={href}
                    contentLanguage={contentLanguage}
                    sourceBlogSlug={params.slug.join("/")}
                  />
                );
              },
            })}
          />
        </div>
      </article>
    </>
  );
}
