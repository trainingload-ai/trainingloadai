import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { JsonLd } from "@/components/JsonLd";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import {
  absoluteAlternatesForPath,
  absoluteLocalizedUrl,
  localePrefix,
} from "@/lib/locale-url";
import {
  itemListSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";
import { PricingPreviewSection } from "@/components/PricingPreviewSection";
import { TrackedLink } from "@/components/TrackedLink";
import {
  HomeHeroWorksWith,
  HomePlatformShowcase,
} from "./_components/HomeIntegrationLogos";
import {
  HomeProductShowcase,
  type HomeProductShowcaseModule,
} from "./_components/HomeProductShowcase";
import {
  HomeHeroDemoPreview,
  type HomeHeroDemoCopy,
} from "./_components/HomeHeroDemoPreview";
import { HomeMcpShowcase } from "./_components/HomeMcpShowcase";
import {
  HOME_RUNNING_PLAN_ROUTES,
  HomeTrainingPlanSpotlight,
  type HomeTrainingPlanSpotlightCopy,
} from "./_components/HomeTrainingPlanSpotlight";
import {
  HOME_OPEN_GRAPH_IMAGE_PATH,
  homeOpenGraphImage,
  homeTwitterImage,
} from "@/lib/social-metadata";
import { newUserGiftValues } from "@/lib/offer-content";
import { IOS_APP_STORE_URL } from "@/lib/app-links";
import { publicDemoDestination } from "@/lib/public-demo-url";
import {
  HomeOpenSourceSection,
  type HomeOpenSourceCopy,
} from "./_components/HomeOpenSourceSection";

type HomeFaq = {
  q: string;
  a: string;
};

type HeroVisibleCopy = {
  eyebrow: string;
  subtitleBefore: string;
  subtitleHighlight: string;
  subtitleAfter: string;
  planCta: string;
  startCta: string;
  demoPreview: HomeHeroDemoCopy;
  iphoneSupport: string;
  worksWith: { label: string; more: string };
};

type FeatureMatrixItemCopy = {
  title: string;
  description: string;
};

type PageModuleCopy = {
  name: string;
  title: string;
  description: string;
  points: string[];
  cta?: string;
};

const PAGE_MODULE_ORDER = [2, 1, 3, 0] as const;

const homePrimaryButtonClass =
  "h-11 w-full border-0 px-5 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:bg-primary/90 dark:shadow-none sm:w-auto";

const homeOutlineButtonClass =
  "h-11 w-full border-input bg-card px-5 text-sm font-medium hover:bg-muted hover:text-foreground sm:w-auto";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "home.metadata" });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const pageUrl = absoluteLocalizedUrl(siteUrl, lang, "/");
  const ogImageUrl = `${siteUrl}${HOME_OPEN_GRAPH_IMAGE_PATH}`;
  // X caches card images aggressively. Bump the versioned URL when the asset changes.
  const twitterImageUrl = ogImageUrl;
  const seo = optimizeSeoText({
    locale: lang,
    context: "product",
    title: t("title"),
    description: t("description"),
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: pageUrl,
      images: [homeOpenGraphImage(ogImageUrl)],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [homeTwitterImage(twitterImageUrl)],
    },
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, "/"),
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const [t, tPlans, tNav] = await Promise.all([
    getTranslations({ locale: lang, namespace: "home" }),
    getTranslations({ locale: lang, namespace: "runningPlanPages.collection" }),
    getTranslations({ locale: lang, namespace: "nav" }),
  ]);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const pageUrl = absoluteLocalizedUrl(siteUrl, lang, "/");
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const demoUrl = publicDemoDestination(lang).href;
  const inLanguage = schemaLanguage(lang);

  const heroTitleLines = t.raw("hero.titleLines") as string[];
  const faqs = t.raw("faq.items") as HomeFaq[];
  const visibleFaqs = faqs.slice(0, 6);

  const heroVisible = t.raw("heroVisible") as HeroVisibleCopy;
  const planSpotlight = t.raw("planSpotlight") as HomeTrainingPlanSpotlightCopy;
  const openSource = t.raw("openSource") as HomeOpenSourceCopy;
  const gift = newUserGiftValues(process.env);
  const bottomTrialNote = t("bottomTrialNote", {
    days: gift.accessDays,
  });
  const featureMatrixRaw = t.raw("featureMatrix") as {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: FeatureMatrixItemCopy[];
  };
  const featureMatrix = featureMatrixRaw;

  const pageModulesRaw = t.raw("pageModules") as {
    eyebrow: string;
    title: string;
    subtitle: string;
    modules: PageModuleCopy[];
  };
  const pageModules = {
    ...pageModulesRaw,
    modules: PAGE_MODULE_ORDER.map((sourceIndex) => ({
      ...pageModulesRaw.modules[sourceIndex],
      sourceIndex,
    })),
  };
  const productShowcaseModules: HomeProductShowcaseModule[] =
    pageModules.modules.map((module) => {
      const destinations = {
        0: {
          href: `${prefix}/ai-coach`,
          cta: module.cta ?? tNav("aiPlans"),
          eventName: "home_ai_coach_click",
        },
        1: {
          href: appUrl,
          cta: module.cta ?? t("hero.cta"),
          eventName: "home_app_click",
        },
        2: {
          href: `${prefix}/plan`,
          cta: module.cta ?? tPlans("cardPrimary"),
          eventName: "home_plan_hub_click",
        },
        3: {
          href: `${prefix}/training-load`,
          cta: module.cta ?? tNav("trainingLoad"),
          eventName: "home_training_load_click",
        },
      } as const;
      const destination =
        destinations[module.sourceIndex as keyof typeof destinations];

      return {
        ...module,
        ...destination,
      };
    });

  const organizationId = schemaId(siteUrl, "organization");
  const websiteId = schemaId(siteUrl, "website");
  const appId = schemaId(siteUrl, "app");
  const webpageId = schemaId(pageUrl, "webpage");
  const faqId = schemaId(pageUrl, "faq");

  const structuredData = schemaGraph([
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "Trainingload.ai",
      url: siteUrl,
      logo: `${siteUrl}/LOGO.png`,
      sameAs: ["https://github.com/trainingload-ai/trainingloadai"],
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: "Trainingload.ai",
      url: siteUrl,
      publisher: { "@id": organizationId },
      inLanguage,
    },
    {
      "@type": "WebApplication",
      "@id": appId,
      name: "Trainingload.ai",
      url: appUrl,
      description: t("hero.subtitle"),
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, iOS",
      installUrl: IOS_APP_STORE_URL,
      isAccessibleForFree: true,
      publisher: { "@id": organizationId },
      inLanguage,
      featureList: featureMatrix.items.map((item) => item.title),
    },
    {
      "@type": "WebPage",
      "@id": webpageId,
      url: pageUrl,
      name: heroTitleLines.join(" "),
      description: t("hero.subtitle"),
      isPartOf: { "@id": websiteId },
      about: { "@id": appId },
      mainEntity: { "@id": appId },
      inLanguage,
    },
    {
      "@type": "FAQPage",
      "@id": faqId,
      url: `${pageUrl}#faq`,
      isPartOf: { "@id": webpageId },
      inLanguage,
      mainEntity: visibleFaqs.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    },
    itemListSchema({
      id: schemaId(pageUrl, "free-running-plans"),
      items: HOME_RUNNING_PLAN_ROUTES.map((route, index) => ({
        name: planSpotlight.plans[index]?.title ?? route,
        description: planSpotlight.plans[index]?.meta ?? planSpotlight.subtitle,
        url: `${siteUrl}${prefix}${route}`,
      })),
    }),
  ]);

  return (
    <main className="overflow-x-hidden bg-background text-foreground">
      <JsonLd id="home-structured-data" data={structuredData} />
      <section className="relative overflow-hidden bg-card px-4 pb-12 pt-10 text-foreground md:px-6 md:pb-16 md:pt-14">
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-5xl text-center">
            <Link
              href={`${prefix}/plan`}
              className="inline-flex rounded-full bg-brand px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-brand-foreground transition-colors hover:bg-brand/85"
            >
              {heroVisible.eyebrow}
            </Link>

            <h1 className="font-display mx-auto mt-8 max-w-4xl text-balance text-[2.75rem] font-bold leading-[1.02] tracking-[-0.035em] text-foreground md:text-[3.75rem] lg:text-[4.25rem]">
              <span className="flex flex-col items-center gap-1 md:gap-2">
                <span>{heroTitleLines[0]}</span>
                <span className="mx-auto inline-block bg-brand px-2 text-brand-foreground">
                  {heroTitleLines[1]}
                </span>
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-7 text-muted-foreground md:text-base">
              {heroVisible.subtitleBefore}
              <span className="font-semibold text-brand">
                {heroVisible.subtitleHighlight}
              </span>
              {heroVisible.subtitleAfter}
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <TrackedLink
                href={`${prefix}/plan`}
                eventName="home_plan_hub_click"
                eventProperties={{ placement: "hero" }}
                className="group inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-control border border-input bg-card px-5 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px sm:w-auto"
              >
                {heroVisible.planCta}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </TrackedLink>
              <Link href={appUrl} className="w-full sm:w-auto">
                <Button
                  variant="brand"
                  className="group min-h-11 w-full shrink-0 gap-2 px-5 text-sm font-semibold active:translate-y-px sm:w-auto"
                >
                  {heroVisible.startCta}
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </Button>
              </Link>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              {heroVisible.iphoneSupport}
            </p>
          </div>

          <div className="mx-auto mt-10 w-full max-w-5xl border-t border-border/80 pt-7">
            <HomeHeroWorksWith
              label={heroVisible.worksWith.label}
              moreLabel={heroVisible.worksWith.more}
            />
          </div>

          <div className="relative mx-auto mt-10 max-w-6xl md:mt-12">
            <HomeHeroDemoPreview
              key={demoUrl}
              copy={heroVisible.demoPreview}
              demoUrl={demoUrl}
              lang={lang}
            />
          </div>
        </div>
      </section>

      <HomeTrainingPlanSpotlight copy={planSpotlight} prefix={prefix} />

      <HomeProductShowcase
        copy={{
          eyebrow: pageModules.eyebrow,
          title: pageModules.title,
          subtitle: pageModules.subtitle,
        }}
        lang={lang}
        modules={productShowcaseModules}
      />

      <HomeMcpShowcase lang={lang} prefix={prefix} />

      <HomeOpenSourceSection copy={openSource} prefix={prefix} />

      <section className="marketing-section bg-secondary/70 text-foreground">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="marketing-eyebrow">{t("platforms.eyebrow")}</div>
            <h2 className="marketing-title">{t("platforms.title")}</h2>
            <p className="marketing-copy mx-auto max-w-2xl">
              {t("platforms.subtitle")}
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-6xl">
            <HomePlatformShowcase
              comingSoonLabel={t("platforms.comingSoonLabel")}
            />
          </div>
        </div>
      </section>

      <section id="faq" className="marketing-section w-full bg-background">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(240px,0.34fr)_1fr] lg:items-start lg:gap-10">
          <div className="lg:sticky lg:top-24">
            <div className="marketing-eyebrow">FAQ</div>
            <h2 className="marketing-title">{t("faq.title")}</h2>
            <p className="marketing-copy">{t("faq.subtitle")}</p>
          </div>

          <div className="rounded-overlay bg-card px-5 shadow-xs ring-1 ring-border/70 md:px-6">
            <Accordion type="single" collapsible className="w-full">
              {visibleFaqs.map((item, i) => (
                <AccordionItem key={item.q} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-base text-foreground md:text-lg">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <PricingPreviewSection lang={lang} appUrl={appUrl} />

      <section className="client-demo-radius marketing-section bg-background">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-feature bg-brand p-7 text-brand-foreground sm:p-8 md:p-10 lg:p-12">
            <div className="relative z-10 flex flex-col items-center justify-center text-center">
              <h2 className="font-display text-2xl font-bold tracking-[-0.025em] text-brand-foreground md:text-3xl lg:text-[2.5rem]">
                {t("bottomCta.title")}
              </h2>
              <p className="mx-auto mt-4 max-w-[560px] text-sm leading-6 text-brand-foreground/70 md:text-base md:leading-7">
                {t("bottomCta.subtitle")}
              </p>
              <div className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row md:mt-8 md:gap-5">
                <Link href={`${prefix}/plan`} className="w-full sm:w-auto">
                  <Button className={homePrimaryButtonClass}>
                    {t("bottomCta.button")}
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
                <Link href={appUrl} className="w-full sm:w-auto">
                  <Button variant="outline" className={homeOutlineButtonClass}>
                    {t("bottomCta.secondaryButton")}
                  </Button>
                </Link>
              </div>
              <p className="mt-5 text-sm text-brand-foreground/70">
                {bottomTrialNote}
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
