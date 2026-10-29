import { cn } from "fumadocs-ui/utils/cn";
import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  LifeBuoy,
  Mail,
  MessageCircle,
  PlugZap,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";

const contactEmail = "support@trainingload.ai";

const channelIcons = [LifeBuoy, PlugZap, CreditCard, MessageCircle];

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
    namespace: "contact.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  return {
    title: t("title"),
    description: t("description"),
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/contact`,
      languages: absoluteAlternatesForPath(siteUrl, "/contact"),
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

export default async function ContactPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const tMeta = await getTranslations({
    locale: lang,
    namespace: "contact.metadata",
  });
  const t = await getTranslations({ locale: lang, namespace: "contact.page" });
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const contactChannels = t.raw("channels") as Array<{
    title: string;
    description: string;
    subject: string;
  }>;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: tMeta("title"),
    description: tMeta("description"),
    url: `${siteUrl}${prefix}/contact`,
    mainEntity: {
      "@type": "Organization",
      name: "Trainingload.ai",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: contactEmail,
        availableLanguage: ["English", "Chinese", "Japanese"],
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="bg-white text-neutral-950 dark:bg-neutral-950 dark:text-white">
        <section className="border-b border-neutral-200/80 px-4 py-12 md:px-6 md:py-16 dark:border-white/10">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              {t("eyebrow")}
            </p>
            <h1 className="text-5xl font-black tracking-normal text-neutral-950 dark:text-white md:text-7xl">
              {t("title")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-600 dark:text-neutral-300 md:text-xl">
              {t("subtitle")}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a href={`mailto:${contactEmail}`}>
                <Button className="h-12 w-full rounded-compact bg-emerald-500 px-6 text-sm font-bold text-white hover:bg-emerald-600 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 sm:w-auto">
                  <Mail className="mr-2 size-4" />
                  {t("primaryCta")}
                </Button>
              </a>
              <a href={appUrl}>
                <Button
                  variant="outline"
                  className="h-12 w-full rounded-compact px-6 text-sm font-semibold sm:w-auto"
                >
                  {t("secondaryCta")}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </a>
            </div>
            <p className="mt-5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {contactEmail}
            </p>
          </div>
        </section>

        <section className="bg-neutral-50 px-4 py-12 md:px-6 md:py-16 dark:bg-white/[0.03]">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-black tracking-normal md:text-4xl">
                {t("channelsTitle")}
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-600 dark:text-neutral-300">
                {t("channelsSubtitle")}
              </p>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-overlay border border-neutral-200 bg-neutral-200 dark:border-white/10 dark:bg-white/10 md:grid-cols-2 lg:grid-cols-4">
              {contactChannels.map((channel, index) => {
                const Icon = channelIcons[index] ?? Mail;

                return (
                  <a
                    key={channel.title}
                    href={`mailto:${contactEmail}?subject=${encodeURIComponent(
                      channel.subject,
                    )}`}
                    className={cn(
                      "group bg-white p-6 transition-colors hover:bg-neutral-100",
                      "dark:bg-neutral-950 dark:hover:bg-white/[0.06]",
                    )}
                  >
                    <div className="mb-5 text-neutral-900 dark:text-white">
                      <Icon className="size-5" />
                    </div>
                    <h3 className="text-base font-black">{channel.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                      {channel.description}
                    </p>
                    <span className="mt-5 inline-flex items-center text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      {t("channelCta")}
                      <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 md:px-6 md:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <div>
              <h2 className="text-3xl font-black tracking-normal md:text-4xl">
                {t("bottom.title")}
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-600 dark:text-neutral-300">
                {t("bottom.description")}
              </p>
            </div>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a href={`mailto:${contactEmail}`}>
                <Button className="h-12 w-full rounded-compact bg-emerald-500 px-6 text-sm font-bold text-white hover:bg-emerald-600 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 sm:w-auto">
                  {t("bottom.emailCta")}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </a>
              <Link href={`${prefix}/docs`}>
                <Button
                  variant="outline"
                  className="h-12 w-full rounded-compact px-6 text-sm font-semibold sm:w-auto"
                >
                  {t("bottom.docsCta")}
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
