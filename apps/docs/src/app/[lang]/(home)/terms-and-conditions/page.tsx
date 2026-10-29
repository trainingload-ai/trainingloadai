import { cn } from "fumadocs-ui/utils/cn";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { tiltWarp } from "@/lib/fonts";

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
    namespace: "terms.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  return {
    title: t("title"),
    description: t("description"),
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/terms-and-conditions`,
      languages: absoluteAlternatesForPath(siteUrl, "/terms-and-conditions"),
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

export default async function TermsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const tMeta = await getTranslations({
    locale: lang,
    namespace: "terms.metadata",
  });
  const t = await getTranslations({ locale: lang, namespace: "terms.page" });
  const lastUpdated = "2026-08-22";
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TermsOfService",
    name: tMeta("title"),
    description: tMeta("description"),
    url: `${siteUrl}${prefix}/terms-and-conditions`,
    dateModified: lastUpdated,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex flex-col items-center min-h-screen py-12 md:py-16 px-4">
        <div className="max-w-3xl w-full">
          <h1
            className={cn(
              "text-4xl md:text-5xl font-bold mb-12 text-center text-neutral-900 dark:text-white",
              tiltWarp.className,
            )}
          >
            {t("title")}
          </h1>

          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <p className="text-lg text-neutral-600 dark:text-neutral-300 mb-8">
              {t("lastUpdated", { date: lastUpdated })}
            </p>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.agreement.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.agreement.body")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.ip.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.ip.body0")}
              </p>
              <p className="text-neutral-600 dark:text-neutral-300 mt-4 leading-relaxed">
                {t("sections.ip.body1")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.accounts.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.accounts.body")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.billingRefunds.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed">
                {t("sections.billingRefunds.body")}
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-600 dark:text-neutral-300">
                <li>{t("sections.billingRefunds.items.0")}</li>
                <li>{t("sections.billingRefunds.items.1")}</li>
                <li>{t("sections.billingRefunds.items.2")}</li>
                <li>{t("sections.billingRefunds.items.3")}</li>
                <li>{t("sections.billingRefunds.items.4")}</li>
                <li>{t("sections.billingRefunds.items.5")}</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.prohibited.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 mb-4">
                {t("sections.prohibited.body")}
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-600 dark:text-neutral-300">
                <li>{t("sections.prohibited.items.0")}</li>
                <li>{t("sections.prohibited.items.1")}</li>
                <li>{t("sections.prohibited.items.2")}</li>
                <li>{t("sections.prohibited.items.3")}</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.liability.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.liability.body")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.thirdParty.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.thirdParty.body")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.healthDisclaimer.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.healthDisclaimer.body")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.termination.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.termination.body")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.governingLaw.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.governingLaw.body")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.updates.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.updates.body")}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">
                {t("sections.contact.title")}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t("sections.contact.bodyPrefix")}{" "}
                <a
                  href="mailto:support@trainingload.ai"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("sections.contact.email")}
                </a>
                {t("sections.contact.bodySuffix")}
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
