import Link from "next/link";
import { CodeXml, Database, Scale } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";

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

export function HomeOpenSourceSection({
  copy,
  prefix,
}: {
  copy: HomeOpenSourceCopy;
  prefix: string;
}) {
  return (
    <section>
      <div className="home-container home-split">
        <div className="home-split-copy">
          <h2>{copy.title}</h2>
          <p className="home-meta-line">
            {copy.eyebrow.split(/\s*·\s*/).map((part) => (
              <span key={part}>{part}</span>
            ))}
          </p>
          <p className="home-copy">{copy.body}</p>

          <div className="home-actions">
            <a
              href={PUBLIC_REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="home-button"
            >
              <SiGithub aria-hidden="true" className="mr-2 size-4" />
              {copy.sourceCta}
            </a>
            <Link href={`${prefix}/docs/self-host`} className="home-text-link">
              {copy.docsCta}
            </Link>
          </div>
        </div>

        <div className="home-frame">
          <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-secondary text-foreground">
                <SiGithub aria-hidden="true" className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  {copy.repositoryLabel}
                </p>
                <code className="mt-1 block truncate text-sm font-semibold text-foreground">
                  trainingload-ai/trainingloadai
                </code>
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
