import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CodeXml,
  Database,
  Download,
  Laptop,
  Scale,
} from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button-variants";
import { withLocalePath } from "@/lib/locale-url";
import { cn } from "@/lib/utils";

const PUBLIC_REPOSITORY_URL =
  "https://github.com/trainingload-ai/trainingloadai";

export type HomeOpenSourceCopy = {
  eyebrow: string;
  title: string;
  body: string;
  repositoryLabel: string;
  licenseLabel: string;
  sourceCta: string;
  docsCta: string;
  items: Array<{
    title: string;
    description: string;
  }>;
};

const itemIcons = [CodeXml, Database, Scale] as const;

export async function HomeOpenSourceSection({
  copy,
  lang,
}: {
  copy: HomeOpenSourceCopy;
  lang: string;
}) {
  const t = await getTranslations({
    locale: lang,
    namespace: "productReleases",
  });
  const downloadPath = withLocalePath(lang, "/download/macos");

  return (
    <section
      id="open-source"
      className="marketing-section scroll-mt-32 border-y border-border/80 bg-card text-foreground"
    >
      <div className="marketing-container grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start lg:gap-16">
        <div className="order-1 lg:order-2">
          <div className="marketing-eyebrow">{copy.eyebrow}</div>
          <h2 className="marketing-title max-w-xl">{copy.title}</h2>
          <p className="marketing-copy max-w-2xl">{copy.body}</p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href={PUBLIC_REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <SiGithub aria-hidden="true" className="size-4" />
              {copy.sourceCta}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
            <Link
              href={withLocalePath(lang, "/docs/self-host")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-input bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {copy.docsCta}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </div>

          <nav aria-labelledby="open-source-install" className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h3
                id="open-source-install"
                className="text-balance font-display text-base font-bold"
              >
                {t("homeTitle")}
              </h3>
              <Link
                href={withLocalePath(lang, "/releases")}
                className="inline-flex min-h-9 items-center gap-2 rounded-control text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("history.heading")}
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-feature border border-border/80 bg-background p-4">
              <div className="flex min-w-0 flex-[1_1_13rem] items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-secondary text-muted-foreground">
                  <Laptop aria-hidden="true" className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold">{t("macos.title")}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t("macos.requirements")}
                  </p>
                </div>
              </div>
              <a
                href={downloadPath}
                className={cn(
                  buttonVariants(),
                  "h-auto min-h-11 max-w-full whitespace-normal px-4 text-center",
                )}
              >
                <Download aria-hidden="true" />
                {t("macos.downloadLatest")}
              </a>
            </div>
          </nav>
        </div>

        <div className="order-2 overflow-hidden rounded-feature border border-border/80 bg-background lg:order-1">
          <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-secondary text-foreground">
                <SiGithub aria-hidden="true" className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {copy.repositoryLabel}
                </p>
                <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">
                  trainingload-ai/trainingloadai
                </p>
              </div>
            </div>
            <span className="w-fit rounded-compact border border-border bg-card px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
              {copy.licenseLabel}
            </span>
          </div>

          <div className="divide-y divide-border/80">
            {copy.items.map((item, index) => {
              const Icon = itemIcons[index] ?? CodeXml;

              return (
                <div
                  key={item.title}
                  className="grid gap-3 px-5 py-5 sm:grid-cols-[2.25rem_1fr] md:px-6 md:py-6"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-control bg-secondary text-muted-foreground">
                    <Icon aria-hidden="true" className="size-[18px]" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
