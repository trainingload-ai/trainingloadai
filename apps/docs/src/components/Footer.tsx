import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Apple, ArrowRight, ArrowUpRight } from "lucide-react";
import { withLocalePath } from "@/lib/locale-url";
import { IOS_APP_STORE_URL } from "@/lib/app-links";

type FooterLink = { href: string; title: string };

const linkClassName =
  "inline-block py-1 text-sm leading-6 text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-secondary motion-reduce:transition-none";

function FooterLinkGroup({
  id,
  title,
  links,
  more,
}: {
  id: string;
  title: string;
  links: FooterLink[];
  more?: FooterLink;
}) {
  return (
    <nav aria-labelledby={id} className="flex min-w-0 flex-col items-start">
      <h3 id={id} className="mb-3 text-sm font-semibold text-foreground">
        {title}
      </h3>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={linkClassName}>
              {link.title}
            </Link>
          </li>
        ))}
      </ul>
      {more && (
        <Link
          href={more.href}
          className="group mt-auto inline-flex items-center gap-2 pb-1 pt-4 text-sm font-semibold leading-6 text-foreground transition-colors hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-secondary motion-reduce:transition-none"
        >
          {more.title}
          <ArrowRight
            className="size-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Link>
      )}
    </nav>
  );
}

export async function Footer({ lang }: { lang: string }) {
  const t = await getTranslations({ locale: lang, namespace: "footer" });
  const year = new Date().getFullYear();
  const localizedLink = (href: string, title: string): FooterLink => ({
    href: withLocalePath(lang, href),
    title,
  });
  // Keep global navigation at the category level. Each hub and the catalog
  // link to the individual levels and long-tail guides.
  const runningPlans = [
    localizedLink("/couch-to-5k-training-plan", t("navigation.first5k")),
    localizedLink("/5k-training-plan", t("navigation.fiveK")),
    localizedLink("/10k-training-plan", t("navigation.tenK")),
    localizedLink("/half-marathon-training-plan", t("navigation.halfMarathon")),
    localizedLink("/marathon-training-plan", t("navigation.marathon")),
  ];
  const otherSports = [
    localizedLink("/cycling-training-plan", t("navigation.cycling")),
    localizedLink("/swim-training-plan", t("navigation.swimming")),
    localizedLink("/ironman-70-3-training-plan", t("navigation.triathlon703")),
    localizedLink(
      "/olympic-triathlon-training-plan",
      t("navigation.olympicTriathlon"),
    ),
    localizedLink("/brick-workout", t("navigation.brickWorkout")),
  ];
  const tools = [
    localizedLink(
      "/running-pace-calculator",
      t("toolLinks.runningPaceCalculator"),
    ),
    localizedLink("/vdot-calculator", t("toolLinks.vdotCalculator")),
    localizedLink(
      "/heart-rate-zones-calculator",
      t("toolLinks.heartRateZonesCalculator"),
    ),
    localizedLink("/ftp-calculator", t("toolLinks.estimateCp")),
    localizedLink("/training-load-calculator", t("trainingLoad")),
    localizedLink("/converter", t("navigation.fileConverter")),
  ];
  const resources = [
    localizedLink("/features", t("features")),
    localizedLink("/pricing", t("pricing")),
    localizedLink("/docs", t("documentation")),
    localizedLink("/free-ai-workout-review", t("navigation.freeReview")),
    localizedLink("/rpe-scale", t("navigation.rpeScale")),
    localizedLink("/alternatives", t("navigation.appComparisons")),
  ];

  return (
    <footer className="bg-background px-4 pb-4 pt-4 md:px-6 md:pb-6">
      <div className="mx-auto grid max-w-[1440px] gap-8 rounded-feature bg-secondary px-5 py-8 text-foreground ring-1 ring-border/70 sm:px-8 md:py-10 xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-12 xl:px-10">
        <div className="flex max-w-sm flex-col items-start">
          <Link
            href={withLocalePath(lang, "/")}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-secondary"
          >
            <Image
              src="/LOGO_DARK.svg"
              alt="Trainingload.ai"
              width={120}
              height={16}
              className="h-auto w-[120px] dark:hidden"
            />
            <Image
              src="/LOGO_LIGHT.svg"
              alt=""
              aria-hidden="true"
              width={120}
              height={16}
              className="hidden h-auto w-[120px] dark:block"
            />
          </Link>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            {t("brandDescription")}
          </p>
          <a
            href={IOS_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-6 inline-flex items-center gap-3 rounded-control bg-card px-3 py-2.5 text-foreground ring-1 ring-border transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <Apple className="size-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[10px] leading-none text-muted-foreground">
                {t("appStoreMeta")}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold leading-snug">
                {t("appStoreCta")}
                <ArrowUpRight
                  className="size-3.5 shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </span>
            </span>
          </a>
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            {t("copyright", { year })}
          </p>
        </div>

        <div className="min-w-0 border-t border-border pt-8 xl:border-t-0 xl:pt-0">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            <FooterLinkGroup
              id="footer-running-plans"
              title={t("navigation.runningPlans")}
              links={runningPlans}
              more={localizedLink("/plan", t("navigation.allPlans"))}
            />
            <FooterLinkGroup
              id="footer-other-sports"
              title={t("navigation.otherSports")}
              links={otherSports}
            />
            <FooterLinkGroup
              id="footer-tools"
              title={t("navigation.popularTools")}
              links={tools}
              more={localizedLink("/tools", t("navigation.allTools"))}
            />
            <FooterLinkGroup
              id="footer-resources"
              title={t("resources")}
              links={resources}
            />
          </div>

          <nav
            aria-label={t("company")}
            className="mt-8 border-t border-border pt-4"
          >
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {[
                localizedLink("/contact", t("contact")),
                localizedLink("/privacy", t("privacyPolicy")),
                localizedLink("/terms-and-conditions", t("termsAndConditions")),
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClassName}>
                    {link.title}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="mailto:support@trainingload.ai"
                  className={linkClassName}
                >
                  {t("support")}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
