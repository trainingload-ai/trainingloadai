import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TrackedLink } from "@/components/TrackedLink";
import { McpTerminalDemo } from "./McpTerminalDemo";
import { getMcpTerminalCopy } from "./mcp-terminal-copy";

export async function HomeMcpShowcase({
  lang,
  prefix,
}: {
  lang: string;
  prefix: string;
}) {
  const t = await getTranslations({
    locale: lang,
    namespace: "home.mcpShowcase",
  });
  const points = t.raw("points") as string[];

  return (
    <section
      id="mcp"
      className="marketing-section bg-background text-foreground"
    >
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] lg:items-center lg:gap-14">
        <div>
          <div className="marketing-eyebrow font-mono">{t("eyebrow")}</div>
          <h2 className="font-display mt-3 max-w-xl text-balance text-3xl font-bold leading-[1.08] tracking-[-0.025em] md:text-[2.5rem]">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-muted-foreground md:text-base">
            {t("description")}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <TrackedLink
              href={`${prefix}/features/mcp`}
              eventName="home_mcp_feature_click"
              eventProperties={{ placement: "mcp_showcase" }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-brand px-5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("primary")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </TrackedLink>
            <Link
              href={`${prefix}/docs/mcp/connect`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-input bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("secondary")}
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span
                  className="size-1.5 rounded-full bg-brand"
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative isolate -mx-4 overflow-hidden rounded-none px-4 py-8 sm:mx-0 sm:rounded-overlay sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--brand) 46%, transparent) 1px, transparent 1.35px)",
              backgroundSize: "24px 24px",
              maskImage:
                "radial-gradient(ellipse 118% 112% at 0% 100%, #000 0%, rgba(0,0,0,0.96) 18%, rgba(0,0,0,0.72) 40%, rgba(0,0,0,0.34) 64%, transparent 88%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 118% 112% at 0% 100%, #000 0%, rgba(0,0,0,0.96) 18%, rgba(0,0,0,0.72) 40%, rgba(0,0,0,0.34) 64%, transparent 88%)",
            }}
          />
          <McpTerminalDemo
            copy={getMcpTerminalCopy(lang)}
            href={`${prefix}/features/mcp`}
            variant="compact"
          />
        </div>
      </div>
    </section>
  );
}
