import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
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

export async function generateMetadata({ params }: PageProps) {
  const { lang } = await params;
  return productReleaseMetadata(lang, "/releases");
}

export default async function ReleasesPage({ params }: PageProps) {
  const { lang } = await params;
  const [t, releases] = await Promise.all([
    getTranslations({ locale: lang, namespace: "productReleases" }),
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
          <h1 className="marketing-title mt-0 text-4xl sm:text-5xl">
            {t("history.heading")}
          </h1>
          <p className="marketing-copy">{t("history.description")}</p>
          <Link
            href={withLocalePath(lang, "/download")}
            className={buttonVariants({
              variant: "outline",
              className: "mt-5 min-h-11 px-4",
            })}
          >
            {t("download.heading")} <ArrowRight aria-hidden="true" />
          </Link>
        </header>

        {releases?.length ? (
          <ol className="mt-8 max-w-3xl divide-y divide-border rounded-feature border border-border bg-card">
            {releases.slice(0, 5).map((release) => {
              const { intro, highlights } = releaseNoteSummary(release.notes);
              return (
                <li key={release.tag} className="px-6 py-6 sm:px-8">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
                    <h2 className="font-mono text-lg font-semibold">
                      v{release.version}
                    </h2>
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
                      className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground"
                    >
                      {intro}
                    </p>
                  )}
                  {highlights.length > 0 && (
                    <ul
                      lang=""
                      className="mt-3 list-disc space-y-1 break-words pl-5 text-sm leading-6 text-muted-foreground"
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
          <p className="mt-7 text-sm text-muted-foreground">
            {releases ? t("history.empty") : t("feedUnavailable")}
          </p>
        )}

        <a
          href={GITHUB_RELEASES_URL}
          className={["mt-6", releaseLinkClass].join(" ")}
        >
          {t("githubHistory")}{" "}
          <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
        </a>
      </div>
    </div>
  );
}
