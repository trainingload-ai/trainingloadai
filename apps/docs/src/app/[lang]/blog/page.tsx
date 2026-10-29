import Link from "next/link";
import {
  blogIndexAlternates,
  blogPageContentLanguage,
  getBlogPagesWithFallback,
  getNativeBlogPages,
} from "@/lib/blog-source";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { localePrefix, withLocalePath } from "@/lib/locale-url";
import { dateLocale, openGraphLocale, schemaLanguage } from "@/lib/seo-schema";
import { i18n } from "@/lib/i18n";

const OPTIMIZED_IMAGE_HOSTS = new Set([
  "pbs.twimg.com",
  "abs.twimg.com",
  "ui-avatars.com",
  "www.google.com",
]);

function shouldOptimizeImage(src: string) {
  if (!src) return false;
  if (src.startsWith("/")) return true;

  try {
    const url = new URL(src);
    return OPTIMIZED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const hasNativeContent = getNativeBlogPages(lang).length > 0;
  const contentLanguage = hasNativeContent ? lang : i18n.defaultLanguage;
  const prefix = localePrefix(contentLanguage);
  const t = await getTranslations({
    locale: contentLanguage,
    namespace: "blog.metadata",
  });
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `${siteUrl}${prefix}/blog`,
      languages: blogIndexAlternates(siteUrl),
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      type: "website",
      locale: openGraphLocale(contentLanguage),
    },
    twitter: {
      title: t("title"),
      description: t("description"),
    },
    robots: hasNativeContent ? undefined : { index: false, follow: true },
  };
}

export default async function BlogPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const posts = getBlogPagesWithFallback(lang).filter(
    (post) => !post.data.draft,
  );
  const t = await getTranslations({ locale: lang, namespace: "blog.page" });

  // Sort posts by date (newest first)
  const sortedPosts = posts.sort((a, b) => {
    const dateA = new Date(a.data.date || 0);
    const dateB = new Date(b.data.date || 0);
    return dateB.getTime() - dateA.getTime();
  });

  const [featuredPost, ...remainingPosts] = sortedPosts;
  const featuredContentLanguage = featuredPost
    ? blogPageContentLanguage(featuredPost, lang)
    : lang;
  const isChinese = lang === "zh";
  const eyebrow = isChinese
    ? "TRAININGLOAD.AI · 博客"
    : "TRAININGLOAD.AI · JOURNAL";
  const editorialTitle = isChinese
    ? "训练、数据与判断"
    : "Training, data, and decisions";
  const editorialDescription = isChinese
    ? "把耐力训练里的指标、方法与产品逻辑讲清楚。"
    : "Clear explanations of endurance metrics, methods, and the thinking behind our product.";
  const latestLabel = isChinese ? "最新文章" : "Latest article";
  const readLabel = isChinese ? "阅读全文" : "Read article";
  const moreLabel = isChinese ? "更多文章" : "More stories";

  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-12 md:px-6 md:py-16 sm:px-6 lg:px-8">
      <header className="grid gap-8 border-b border-neutral-300 pb-10 dark:border-neutral-700 md:grid-cols-12 md:items-end md:pb-14">
        <div className="md:col-span-8">
          <p className="mb-5 font-mono text-xs font-semibold tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
            {eyebrow}
          </p>
          <h1 className="max-w-4xl text-balance text-5xl font-black leading-[0.96] tracking-[-0.045em] text-neutral-950 dark:text-white sm:text-6xl lg:text-7xl">
            {isChinese ? (
              <>
                <span className="block sm:inline">训练、数据</span>
                <span className="block sm:inline">与判断</span>
              </>
            ) : (
              editorialTitle
            )}
          </h1>
        </div>
        <p className="max-w-md text-lg leading-8 text-neutral-600 dark:text-neutral-300 md:col-span-4 md:justify-self-end">
          {editorialDescription}
        </p>
      </header>

      {featuredPost && (
        <section className="mt-10 sm:mt-14" aria-labelledby="latest-post">
          <div className="mb-4 flex items-center justify-between font-mono text-xs tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
            <h2 id="latest-post" className="font-medium uppercase">
              {latestLabel}
            </h2>
            <span aria-hidden="true">01</span>
          </div>

          <Link
            href={withLocalePath(lang, `/blog/${featuredPost.slugs.join("/")}`)}
            className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-4 dark:focus-visible:ring-offset-neutral-950"
          >
            <article
              lang={schemaLanguage(featuredContentLanguage)}
              className="grid gap-7 border-y border-neutral-300 py-6 dark:border-neutral-700 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-center lg:gap-10 xl:grid-cols-[26rem_minmax(0,1fr)] xl:gap-12"
            >
              {typeof featuredPost.data.image === "string" &&
                featuredPost.data.image && (
                  <div className="relative aspect-[40/21] overflow-hidden border border-neutral-300 bg-neutral-900 dark:border-neutral-700">
                    <Image
                      src={featuredPost.data.image}
                      alt={featuredPost.data.title}
                      fill
                      sizes="(min-width: 1280px) 416px, (min-width: 1024px) 384px, 100vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.015] motion-reduce:transition-none"
                      priority
                      unoptimized={
                        !shouldOptimizeImage(featuredPost.data.image)
                      }
                    />
                  </div>
                )}

              <div className="flex min-h-full flex-col justify-between pb-2 lg:py-2">
                <div>
                  <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                    {featuredPost.data.date && (
                      <time
                        dateTime={new Date(
                          featuredPost.data.date,
                        ).toISOString()}
                      >
                        {new Date(featuredPost.data.date).toLocaleDateString(
                          dateLocale(featuredContentLanguage),
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          },
                        )}
                      </time>
                    )}
                    {featuredPost.data.author && (
                      <>
                        <span aria-hidden="true">/</span>
                        <span>{featuredPost.data.author}</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-balance text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-neutral-950 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300 xl:text-4xl">
                    {featuredPost.data.title}
                  </h3>

                  {featuredPost.data.description && (
                    <p className="mt-5 line-clamp-3 text-base leading-7 text-neutral-600 dark:text-neutral-300">
                      {featuredPost.data.description}
                    </p>
                  )}
                </div>

                <div className="mt-6">
                  {featuredPost.data.tags &&
                    featuredPost.data.tags.length > 0 && (
                      <p className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
                        {featuredPost.data.tags.slice(0, 4).join("  /  ")}
                      </p>
                    )}
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-white">
                    {readLabel}
                    <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </article>
          </Link>
        </section>
      )}

      {remainingPosts.length > 0 && (
        <section className="mt-12 md:mt-16" aria-labelledby="more-posts">
          <h2
            id="more-posts"
            className="mb-8 text-2xl font-bold tracking-tight text-neutral-950 dark:text-white"
          >
            {moreLabel}
          </h2>
          <div className="divide-y divide-neutral-300 border-y border-neutral-300 dark:divide-neutral-700 dark:border-neutral-700">
            {remainingPosts.map((post, index) => {
              const date = post.data.date ? new Date(post.data.date) : null;
              const contentLanguage = blogPageContentLanguage(post, lang);

              return (
                <Link
                  key={post.slugs.join("/")}
                  href={withLocalePath(lang, `/blog/${post.slugs.join("/")}`)}
                  className="group grid gap-4 py-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:grid-cols-[3rem_1fr_auto] sm:items-center"
                >
                  <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">
                    {String(index + 2).padStart(2, "0")}
                  </span>
                  <article lang={schemaLanguage(contentLanguage)}>
                    <h3 className="text-xl font-semibold tracking-tight text-neutral-950 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
                      {post.data.title}
                    </h3>
                    {post.data.description && (
                      <p className="mt-2 max-w-3xl text-neutral-600 dark:text-neutral-400">
                        {post.data.description}
                      </p>
                    )}
                  </article>
                  <div className="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
                    {date && (
                      <time dateTime={date.toISOString()}>
                        {date.toLocaleDateString(dateLocale(contentLanguage), {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </time>
                    )}
                    <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {sortedPosts.length === 0 && (
        <div className="py-12 text-center md:py-16">
          <p className="text-neutral-600 dark:text-neutral-400">{t("empty")}</p>
        </div>
      )}
    </main>
  );
}
