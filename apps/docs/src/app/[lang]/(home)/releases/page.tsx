import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { getCloudReleaseNotes } from "@/lib/cloud-release-notes";
import { withLocalePath } from "@/lib/locale-url";
import { productReleaseMetadata } from "@/lib/product-release-metadata";
import {
  GITHUB_RELEASES_URL,
  getDesktopReleases,
} from "@/lib/product-releases";
import { releaseNoteSummary } from "@/lib/release-note-summary";
import { dateLocale } from "@/lib/seo-schema";

type PageProps = { params: Promise<{ lang: string }> };

const releaseLinkClass =
  "inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium underline underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const releaseListClass =
  "mt-5 divide-y divide-border rounded-feature border border-border bg-card";
const notesClass = "mt-3 break-words text-sm leading-6 text-muted-foreground";

export async function generateMetadata({ params }: PageProps) {
  const { lang } = await params;
  return productReleaseMetadata(lang, "/releases");
}

export default async function ReleasesPage({ params }: PageProps) {
  const { lang } = await params;
  const [t, cloud, desktop] = await Promise.all([
    getTranslations({ locale: lang, namespace: "productReleases" }),
    getCloudReleaseNotes(lang),
    getDesktopReleases(),
  ]);
  const formatDate = new Intl.DateTimeFormat(dateLocale(lang), {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return (
    <div className="marketing-section bg-background">
      <div className="marketing-container">
        <header className="max-w-3xl">
          <h1
            id="release-heading"
            className="marketing-title mt-0 text-4xl sm:text-5xl"
          >
            {t("history.heading")}
          </h1>
          <p className="marketing-copy">{t("history.description")}</p>
          <nav
            aria-labelledby="release-heading"
            className="mt-4 flex flex-wrap gap-x-5 gap-y-2"
          >
            <a href="#cloud" className={releaseLinkClass}>
              {t("history.cloudTitle")}
            </a>
            <a href="#macos" className={releaseLinkClass}>
              {t("macos.title")}
            </a>
          </nav>
        </header>

        <section
          id="cloud"
          aria-labelledby="cloud-heading"
          className="mt-10 max-w-3xl scroll-mt-32"
        >
          <h2 id="cloud-heading" className="font-display text-2xl font-bold">
            {t("history.cloudTitle")}
          </h2>
          {cloud.length ? (
            <ol className={releaseListClass}>
              {cloud.map(({ date, language, blocks }, index) => (
                <li key={`${date}-${index}`} className="px-6 py-6 sm:px-8">
                  <h3 className="text-lg font-semibold">
                    <time dateTime={date}>
                      {formatDate.format(new Date(date))}
                    </time>
                  </h3>
                  <div lang={language}>
                    {blocks.map((block, i) =>
                      "paragraph" in block ? (
                        <p key={i} className={notesClass}>
                          {block.paragraph}
                        </p>
                      ) : (
                        <ul
                          key={i}
                          className={`${notesClass} list-disc space-y-1 pl-5`}
                        >
                          {block.bullets.map((bullet, j) => (
                            <li key={j}>{bullet}</li>
                          ))}
                        </ul>
                      ),
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={notesClass}>{t("history.cloudEmpty")}</p>
          )}
        </section>

        <section
          id="macos"
          aria-labelledby="macos-heading"
          className="mt-10 max-w-3xl scroll-mt-32"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="macos-heading" className="font-display text-2xl font-bold">
              {t("macos.title")}
            </h2>
            <Link
              href={withLocalePath(lang, "/download")}
              className={buttonVariants({
                variant: "outline",
                className: "min-h-11 px-4",
              })}
            >
              {t("download.heading")} <ArrowRight aria-hidden="true" />
            </Link>
          </div>

          {desktop?.length ? (
            <ol className={releaseListClass}>
              {desktop.slice(0, 5).map((release) => {
                const { intro, highlights } = releaseNoteSummary(release.notes);
                return (
                  <li key={release.tag} className="px-6 py-6 sm:px-8">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
                      <h3 className="font-mono text-lg font-semibold">
                        v{release.version}
                      </h3>
                      <time
                        dateTime={release.publishedAt}
                        className="text-sm text-muted-foreground"
                      >
                        {formatDate.format(new Date(release.publishedAt))}
                      </time>
                    </div>
                    {intro && (
                      <p
                        lang=""
                        className={`${notesClass} whitespace-pre-line`}
                      >
                        {intro}
                      </p>
                    )}
                    {highlights.length > 0 && (
                      <ul
                        lang=""
                        className={`${notesClass} list-disc space-y-1 pl-5`}
                      >
                        {highlights.map((highlight, index) => (
                          <li key={index}>{highlight}</li>
                        ))}
                      </ul>
                    )}
                    <a
                      href={release.url}
                      className={["mt-4", releaseLinkClass].join(" ")}
                    >
                      {t("versionNotes", {
                        version: release.version,
                        edition: t("macos.title"),
                      })}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    </a>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={notesClass}>
              {desktop ? t("history.empty") : t("feedUnavailable")}
            </p>
          )}

          <a
            href={GITHUB_RELEASES_URL}
            className={["mt-6", releaseLinkClass].join(" ")}
          >
            {t("githubHistory")}{" "}
            <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
          </a>
        </section>
      </div>
    </div>
  );
}
