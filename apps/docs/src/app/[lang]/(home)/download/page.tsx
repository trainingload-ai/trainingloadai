import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, Download, Laptop } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { withLocalePath } from "@/lib/locale-url";
import { productReleaseMetadata } from "@/lib/product-release-metadata";
import { cn } from "@/lib/utils";
import {
  GITHUB_RELEASES_URL,
  getDesktopReleases,
  getLatestDesktopDownload,
} from "@/lib/product-releases";

type PageProps = { params: Promise<{ lang: string }> };

const textLink =
  "rounded-sm text-sm font-medium underline underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export async function generateMetadata({ params }: PageProps) {
  const { lang } = await params;
  return productReleaseMetadata(lang, "/download");
}

export default async function DownloadPage({ params }: PageProps) {
  const { lang } = await params;
  const [t, releases] = await Promise.all([
    getTranslations({ locale: lang, namespace: "productReleases" }),
    getDesktopReleases(),
  ]);
  const download = getLatestDesktopDownload(releases ?? []);

  return (
    <div className="marketing-section bg-background">
      <div className="marketing-container">
        <header className="max-w-3xl">
          <h1 className="marketing-title mt-0 text-4xl sm:text-5xl">
            {t("download.heading")}
          </h1>
          <p className="marketing-copy">{t("download.description")}</p>
        </header>

        <section
          id="macos"
          aria-labelledby="macos-title"
          className="mt-8 flex max-w-3xl scroll-mt-32 items-start gap-4 rounded-feature border border-border bg-card p-6 sm:gap-5 sm:p-8"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-secondary text-muted-foreground sm:size-12">
            <Laptop aria-hidden="true" className="size-5 sm:size-6" />
          </span>
          <div className="min-w-0">
            <h2 id="macos-title" className="font-display text-2xl font-bold">
              {t("macos.title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("macos.requirements")}
            </p>
            <div className="mt-5">
              {download ? (
                <>
                  <p className="mb-3 font-mono text-sm text-muted-foreground">
                    {t("version", { version: download.version })}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <a
                      href={download.archiveUrl}
                      className={cn(
                        buttonVariants(),
                        "h-auto min-h-11 max-w-full whitespace-normal px-4 text-center",
                      )}
                    >
                      <Download aria-hidden="true" />
                      {t("macos.download")}
                    </a>
                    <a
                      href={download.releaseUrl}
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        textLink,
                      )}
                    >
                      {t("versionNotes", {
                        version: download.version,
                        edition: t("macos.title"),
                      })}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  {releases ? t("macos.noDownload") : t("feedUnavailable")}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3">
          <Link href={withLocalePath(lang, "/releases")} className={textLink}>
            {t("history.heading")}
          </Link>
          {releases === null && (
            <a href={GITHUB_RELEASES_URL} className={textLink}>
              {t("githubHistory")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
