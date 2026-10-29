import { cn } from "fumadocs-ui/utils/cn";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { tiltWarp } from "@/lib/fonts";

type PolicySection = {
  title: string;
  body: string;
  items?: string[];
  note?: string;
};

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function PolicySectionBlock({ section }: { section: PolicySection }) {
  return (
    <section className="scroll-mt-24 border-t border-neutral-200 pt-8 first:border-t-0 first:pt-0 dark:border-neutral-800">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900 dark:text-white">
        {section.title}
      </h2>
      <p className="leading-7 text-neutral-600 dark:text-neutral-300">
        {section.body}
      </p>
      {section.items?.length ? (
        <ul className="mt-4 list-disc space-y-3 pl-6 text-neutral-600 dark:text-neutral-300">
          {section.items.map((item) => (
            <li key={item} className="pl-1 leading-7">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {section.note ? (
        <p className="mt-4 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          {section.note}
        </p>
      ) : null}
    </section>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const t = await getTranslations({
    locale: lang,
    namespace: "privacy.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  return {
    title: t("title"),
    description: t("description"),
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/privacy`,
      languages: absoluteAlternatesForPath(siteUrl, "/privacy"),
    },
    openGraph: {
      title: t("openGraph.title"),
      description: t("openGraph.description"),
      type: "website",
    },
    twitter: {
      title: t("openGraph.title"),
      description: t("openGraph.description"),
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const tMeta = await getTranslations({
    locale: lang,
    namespace: "privacy.metadata",
  });
  const t = await getTranslations({ locale: lang, namespace: "privacy.page" });
  const lastUpdated = "2026-09-10";
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);

  const sections: PolicySection[] = [
    {
      title: t("sections.scope.title"),
      body: t("sections.scope.body"),
    },
    {
      title: t("sections.dataWeCollect.title"),
      body: t("sections.dataWeCollect.body"),
      items: toStringList(t.raw("sections.dataWeCollect.items")),
    },
    {
      title: t("sections.sources.title"),
      body: t("sections.sources.body"),
      items: toStringList(t.raw("sections.sources.items")),
    },
    {
      title: t("sections.howWeUse.title"),
      body: t("sections.howWeUse.body"),
      items: toStringList(t.raw("sections.howWeUse.items")),
    },
    {
      title: t("sections.connectedServices.title"),
      body: t("sections.connectedServices.body"),
      items: toStringList(t.raw("sections.connectedServices.items")),
      note: t("sections.connectedServices.note"),
    },
    {
      title: t("sections.ai.title"),
      body: t("sections.ai.body"),
      items: toStringList(t.raw("sections.ai.items")),
      note: t("sections.ai.note"),
    },
    {
      title: t("sections.sharing.title"),
      body: t("sections.sharing.body"),
      items: toStringList(t.raw("sections.sharing.items")),
      note: t("sections.sharing.note"),
    },
    {
      title: t("sections.analytics.title"),
      body: t("sections.analytics.body"),
      items: toStringList(t.raw("sections.analytics.items")),
    },
    {
      title: t("sections.retention.title"),
      body: t("sections.retention.body"),
      items: toStringList(t.raw("sections.retention.items")),
    },
    {
      title: t("sections.security.title"),
      body: t("sections.security.body"),
      items: toStringList(t.raw("sections.security.items")),
    },
    {
      title: t("sections.transfers.title"),
      body: t("sections.transfers.body"),
      items: toStringList(t.raw("sections.transfers.items")),
    },
    {
      title: t("sections.legalBasis.title"),
      body: t("sections.legalBasis.body"),
      items: toStringList(t.raw("sections.legalBasis.items")),
    },
    {
      title: t("sections.rights.title"),
      body: t("sections.rights.body"),
      items: toStringList(t.raw("sections.rights.items")),
    },
    {
      title: t("sections.children.title"),
      body: t("sections.children.body"),
    },
    {
      title: t("sections.updates.title"),
      body: t("sections.updates.body"),
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PrivacyPolicy",
    name: tMeta("title"),
    description: tMeta("description"),
    url: `${siteUrl}${prefix}/privacy`,
    dateModified: lastUpdated,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen px-4 py-12 md:px-6 md:py-16">
        <article className="mx-auto w-full max-w-3xl">
          <header className="mb-12">
            <h1
              className={cn(
                "text-4xl font-bold text-neutral-900 md:text-5xl dark:text-white",
                tiltWarp.className,
              )}
            >
              {t("title")}
            </h1>
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
              {t("lastUpdated", { date: lastUpdated })}
            </p>
            <p className="mt-6 text-lg leading-8 text-neutral-600 dark:text-neutral-300">
              {t("overview.body")}
            </p>
            <div className="mt-6 border-y border-neutral-200 py-5 dark:border-neutral-800">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900 dark:text-white">
                {t("overview.title")}
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                {toStringList(t.raw("overview.items")).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </header>

          <div className="space-y-10">
            {sections.map((section) => (
              <PolicySectionBlock key={section.title} section={section} />
            ))}

            <section className="border-t border-neutral-200 pt-8 dark:border-neutral-800">
              <h2 className="mb-4 text-2xl font-bold text-neutral-900 dark:text-white">
                {t("sections.notices.title")}
              </h2>
              <p className="leading-7 text-neutral-600 dark:text-neutral-300">
                {t("sections.notices.body")}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {[
                  [
                    "https://www.garmin.com/en-US/privacy/connect/policy/",
                    "Garmin",
                  ],
                  ["https://www.coros.com/privacy", "COROS"],
                  [
                    "https://app.intervals.icu/privacy-policy.html",
                    "Intervals.icu",
                  ],
                  ["https://www.strava.com/legal/privacy", "Strava"],
                  ["https://www.wahoofitness.com/privacy-policy", "Wahoo"],
                  ["https://www.suunto.com/Privacy-Policy/", "Suunto"],
                  ["https://www.revenuecat.com/privacy", "RevenueCat"],
                  ["https://posthog.com/privacy", "PostHog"],
                  ["https://sentry.io/privacy/", "Sentry"],
                  ["https://policies.google.com/privacy", "Google"],
                  [
                    "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html",
                    "DeepSeek Privacy",
                  ],
                  [
                    "https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html",
                    "DeepSeek Terms",
                  ],
                ].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </section>

            <section className="border-t border-neutral-200 pt-8 dark:border-neutral-800">
              <h2 className="mb-4 text-2xl font-bold text-neutral-900 dark:text-white">
                {t("sections.contact.title")}
              </h2>
              <p className="leading-7 text-neutral-600 dark:text-neutral-300">
                {t("sections.contact.bodyPrefix")}{" "}
                <a
                  href={`mailto:${t("sections.contact.email")}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {t("sections.contact.email")}
                </a>
                {t("sections.contact.bodySuffix")}
              </p>
            </section>
          </div>
        </article>
      </main>
    </>
  );
}
