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
import "./home.css";
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
    <main className="home-page">
      <JsonLd id="home-structured-data" data={structuredData} />
      <section className="home-container home-hero">
        <div className="home-hero-copy">
          <h1>
            {heroTitleLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>
          <p className="home-lead">
            {heroVisible.subtitleBefore}
            {heroVisible.subtitleHighlight}
            {heroVisible.subtitleAfter}
          </p>
          <div className="home-actions">
            <Link href={appUrl} className="home-button">
              {heroVisible.startCta}
            </Link>
            <TrackedLink
              href={`${prefix}/plan`}
              eventName="home_plan_hub_click"
              eventProperties={{ placement: "hero" }}
              className="home-text-link"
            >
              {heroVisible.planCta}
            </TrackedLink>
          </div>
          <p className="home-support">{heroVisible.iphoneSupport}</p>
        </div>
        <div className="home-hero-stage">
          <HomeHeroDemoPreview
            key={demoUrl}
            copy={heroVisible.demoPreview}
            demoUrl={demoUrl}
            lang={lang}
          />
        </div>
      </section>
      <div className="home-container home-logo-band">
        <HomeHeroWorksWith
          label={heroVisible.worksWith.label}
          moreLabel={heroVisible.worksWith.more}
        />
      </div>

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

      <section className="home-surface">
        <div className="home-container home-split home-split-tight">
          <div className="home-split-copy">
            <h2>{t("platforms.title")}</h2>
            <p className="home-lead">{t("platforms.eyebrow")}</p>
            <p className="home-copy">{t("platforms.subtitle")}</p>
          </div>
          <HomePlatformShowcase
            comingSoonLabel={t("platforms.comingSoonLabel")}
          />
        </div>
      </section>

      <section id="faq" className="home-faq">
        <div className="home-container home-faq-grid">
          <div>
            <h2>{t("faq.title")}</h2>
            <p className="home-copy">{t("faq.subtitle")}</p>
          </div>

          <div className="home-faq-list">
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

      <section className="home-close">
        <div className="home-container">
          <div className="home-close-panel">
            <div>
              <h2>{t("bottomCta.title")}</h2>
              <p className="home-copy">{t("bottomCta.subtitle")}</p>
              <p className="home-close-note">{bottomTrialNote}</p>
            </div>
            <div className="home-close-actions">
              <Link href={`${prefix}/plan`} className="home-button">
                {t("bottomCta.button")}
              </Link>
              <Link href={appUrl} className="home-text-link">
                {t("bottomCta.secondaryButton")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
