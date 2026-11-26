import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/JsonLd";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Footprints,
  Goal,
  Route,
  ShieldCheck,
} from "lucide-react";
import { RunningPlanSchedule } from "@/components/RunningPlanSchedule";
import { RunningPlanIntentGuide } from "@/components/RunningPlanIntentGuide";
import { TrackedLink } from "@/components/TrackedLink";
import { localePrefix } from "@/lib/locale-url";
import { formatNewUserGiftCredits, newUserGiftValues } from "@/lib/offer-content";
import {
  breadcrumbSchema,
  howToSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";
import type { RunningPlan } from "@/lib/running-plan-pages";
import { getRunningPlanSchedule } from "@/lib/running-plan-schedules";
import { FiveKProductPreview } from "@/app/[lang]/(home)/5k-training-plan/_components/FiveKProductPreview";
import { FiveKSystemShowcase } from "@/app/[lang]/(home)/5k-training-plan/_components/FiveKSystemShowcase";
import styles from "@/app/[lang]/(home)/5k-training-plan/five-k-training-plan.module.css";

type ProductModule = {
  name: string;
  title: string;
  description: string;
  points: string[];
  cta?: string;
};

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

function withLocalePath(prefix: string, href: string) {
  if (href.startsWith("http")) return href;
  if (href === "/") return `${prefix}/`;
  return `${prefix}${href.startsWith("/") ? href : `/${href}`}`;
}

const WORKFLOW_ICONS = [Goal, Footprints, BarChart3, ShieldCheck] as const;

export async function DistancePlanExperience({
  lang,
  plan,
}: {
  lang: string;
  plan: RunningPlan;
}) {
  const [tPlan, tHome, tSignup] = await Promise.all([
    getTranslations({ locale: lang, namespace: "runningPlanPages" }),
    getTranslations({ locale: lang, namespace: "home" }),
    getTranslations({ locale: lang, namespace: "freeAiWorkoutReview.signup" }),
  ]);
  const modules = tHome.raw("pageModules.modules") as ProductModule[];
  const workflowSteps = tHome.raw("trainingLoop.steps") as Array<{
    title: string;
    description: string;
  }>;
  const gift = newUserGiftValues(process.env);
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const routePath = plan.routePath ?? `/${plan.slug}`;
  const pageUrl = `${siteUrl}${prefix}${routePath}`;
  const schedule = getRunningPlanSchedule(plan.slug, lang);
  const appPlanUrl = (placement: string) =>
    plan.templateSlug
      ? `${appUrl}/plans/templates/${plan.templateSlug}?source=${encodeURIComponent(plan.slug)}&placement=${encodeURIComponent(placement)}`
      : `${appUrl}/plans/create?source=${encodeURIComponent(plan.slug)}&distance=${encodeURIComponent(plan.distance)}&placement=${encodeURIComponent(placement)}`;
  const orderedModules = [
    modules[2],
    modules[1],
    modules[3],
    modules[0],
  ].filter((module): module is ProductModule => Boolean(module));
  const systemModules = orderedModules.slice(1);
  const headingLines = tPlan.raw(`heroHeadings.${plan.slug}`) as string[];

  const jsonLd = schemaGraph([
    {
      "@type": "WebPage",
      "@id": schemaId(pageUrl, "webpage"),
      name: plan.title,
      description: plan.subtitle,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
      dateModified: schedule.updatedAt,
      author: {
        "@type": "Organization",
        name: schedule.author,
        url: siteUrl,
      },
      isBasedOn: schedule.sources.map((source) => source.url),
      mainEntity: { "@id": schemaId(pageUrl, "schedule") },
      about: plan.keywords.slice(0, 3).map((name) => ({
        "@type": "Thing",
        name,
      })),
    },
    {
      "@type": "ItemList",
      "@id": schemaId(pageUrl, "schedule"),
      name: schedule.title,
      description: schedule.description,
      inLanguage: schemaLanguage(lang),
      numberOfItems: schedule.weeks.length,
      itemListElement: schedule.weeks.map((week, index) => ({
        "@type": "ListItem",
        "@id": `${pageUrl}#week-${week.week}`,
        position: index + 1,
        name: `${schedule.weekLabel} ${week.week}: ${week.phase}`,
        description: week.days.join("; "),
      })),
    },
    plan.howToSteps?.length
      ? howToSchema({
          id: schemaId(pageUrl, "howto"),
          name: plan.howToTitle ?? schedule.title,
          description: plan.howToDescription ?? plan.subtitle,
          steps: plan.howToSteps.map(([name, text]) => ({ name, text })),
          totalTime: plan.howToTotalTime,
        })
      : null,
    {
      "@type": "FAQPage",
      "@id": schemaId(pageUrl, "faq"),
      url: `${pageUrl}#faq`,
      inLanguage: schemaLanguage(lang),
      mainEntity: plan.faq.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: tPlan("labels.home"), item: `${siteUrl}${prefix}/` },
        { name: tPlan("labels.plans"), item: `${siteUrl}${prefix}/plan` },
        { name: plan.distance, item: pageUrl },
      ],
    }),
  ]);

  const systemExperience = (
    <section id="system" className={styles.systemSection}>
      <div className={styles.shell}>
        <div className={styles.systemHeading}>
          <p className={styles.kicker}>{tHome("pageModules.eyebrow")}</p>
          <h2>{tHome("pageModules.title")}</h2>
          <p>{tHome("pageModules.subtitle")}</p>
        </div>

        <FiveKSystemShowcase
          modules={systemModules}
          lang={lang}
          slug={plan.slug}
          prefix={prefix}
          calendarHref={appPlanUrl("system_calendar")}
          calendarLabel={tPlan("labels.addToCalendar")}
        />
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <JsonLd id={`${plan.slug}-structured-data`} data={jsonLd} />

      <section className={styles.hero}>
        <div className={styles.shell}>
          <div className={styles.heroGrid}>
            <div
              className={`${styles.heroCopy} ${
                ["zh", "zh-hant", "ja"].includes(lang) ? styles.heroCopyCjk : ""
              }`}
            >
              <p className={styles.kicker}>{plan.eyebrow}</p>
              <h1 aria-label={plan.title}>
                {headingLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h1>
              <p className={styles.heroSubtitle}>{plan.subtitle}</p>
              <div className={styles.heroActions}>
                <TrackedLink
                  href="#schedule"
                  eventName="plan_schedule_start_click"
                  eventProperties={{
                    slug: plan.slug,
                    source_page: plan.slug,
                    placement: "hero_primary",
                    locale: lang,
                  }}
                  className={styles.primaryButton}
                >
                  {tPlan("labels.viewFullSchedule")}
                  <ArrowRight aria-hidden="true" />
                </TrackedLink>
                <TrackedLink
                  href={appPlanUrl("hero_secondary")}
                  eventName="plan_template_open"
                  eventProperties={{
                    slug: plan.slug,
                    template_slug: plan.templateSlug,
                    source_page: plan.slug,
                    placement: "hero_secondary",
                    locale: lang,
                  }}
                  className={styles.secondaryButton}
                >
                  {plan.secondaryCta}
                </TrackedLink>
              </div>
              <p className={styles.promise}>{plan.promise}</p>
            </div>

            <div className={styles.heroProduct}>
              <FiveKProductPreview
                lang={lang}
                planSlug={plan.slug}
                distance={plan.distance}
              />
            </div>
          </div>

          <dl className={styles.heroFacts}>
            {[
              [tPlan("labels.timeline"), plan.weeks],
              [tPlan("labels.volume"), plan.weeklyVolume],
              [tPlan("labels.level"), plan.level],
              [schedule.authorLabel, schedule.author],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <nav className={styles.jumpNav} aria-label={plan.title}>
        <div className={styles.jumpInner}>
          {[
            ["#choose-plan", plan.planChooser?.title ?? plan.forTitle],
            ["#schedule", schedule.title],
            ["#system", tHome("pageModules.title")],
            ["#plan-method", plan.contentTitle ?? plan.previewTitle],
            ["#faq", `${plan.distance} ${tPlan("labels.faqTitleSuffix")}`],
          ].map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </div>
      </nav>

      {plan.planChooser ? (
        <section id="choose-plan" className={styles.chooser}>
          <div className={styles.shell}>
            <div className={styles.sectionIntro}>
              <p className={styles.kicker}>{plan.distance} / {tPlan("sectionKickers.startHere")}</p>
              <h2>{plan.planChooser.title}</h2>
              <p>{plan.planChooser.subtitle}</p>
            </div>
            <div className={styles.chooserGrid}>
              {plan.planChooser.options.map((option, index) => {
                const body = (
                  <>
                    <div className={styles.choiceTopline}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span>{option.label}</span>
                    </div>
                    <h3>{option.title}</h3>
                    <p>{option.description}</p>
                    <span className={styles.choiceAction}>
                      {option.href ? (
                        <ArrowRight aria-hidden="true" />
                      ) : (
                        <Check aria-hidden="true" />
                      )}
                    </span>
                  </>
                );

                return option.href ? (
                  <TrackedLink
                    key={option.title}
                    href={withLocalePath(prefix, option.href)}
                    eventName="plan_related_click"
                    eventProperties={{
                      slug: plan.slug,
                      target: option.href,
                      cta_location: "plan_chooser",
                    }}
                    className={styles.choice}
                  >
                    {body}
                  </TrackedLink>
                ) : (
                  <div
                    key={option.title}
                    aria-current="page"
                    className={`${styles.choice} ${styles.choiceCurrent}`}
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <RunningPlanSchedule
        schedule={schedule}
        slug={plan.slug}
        templateSlug={plan.templateSlug}
        lang={lang}
        collapsible
        showOverview
        overviewAfter={
          <div className={styles.planBridge}>
            <div className={styles.bridgeCopy}>
              <span>{tHome("planSpotlight.freeLabel")}</span>
              <h3>{tHome("planSpotlight.freeTitle")}</h3>
              <p>{tHome("planSpotlight.freeText")}</p>
            </div>
            <div className={styles.bridgeCopy}>
              <span>{tHome("planSpotlight.aiLabel")}</span>
              <h3>{tHome("planSpotlight.aiTitle")}</h3>
              <p>{tHome("planSpotlight.aiText")}</p>
            </div>
            <TrackedLink
              href={appPlanUrl("schedule_bridge")}
              eventName="plan_template_open"
              eventProperties={{
                slug: plan.slug,
                template_slug: plan.templateSlug,
                source_page: plan.slug,
                placement: "schedule_bridge",
                locale: lang,
              }}
              className={styles.bridgeButton}
            >
              {tPlan("labels.addToCalendar")}
              <ArrowRight aria-hidden="true" />
            </TrackedLink>
          </div>
        }
      />

      {systemExperience}

      <RunningPlanIntentGuide slug={plan.slug} lang={lang} />

      <section id="plan-method" className={styles.methodSection}>
        <div className={styles.shell}>
          <div className={styles.methodHeading}>
            <p className={styles.kicker}>{plan.distance} / {tPlan("sectionKickers.trainingMethod")}</p>
            <h2>{plan.contentTitle ?? plan.previewTitle}</h2>
            {plan.contentSubtitle ? <p>{plan.contentSubtitle}</p> : null}
          </div>

          {plan.contentSections?.length ? (
            <div className={styles.methodGrid}>
              {plan.contentSections.map(([title, text, items], index) => (
                <article key={title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <ul>
                    {items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : null}

          <div className={styles.planProfile}>
            <div className={styles.planProfileIntro}>
              <h2>{plan.previewTitle}</h2>
              <p>{plan.previewSubtitle}</p>
              <h3>{plan.forTitle}</h3>
            </div>
            <div className={styles.planProfileBody}>
              <ol className={styles.progressionList}>
                {plan.previewRows.map(([phase, title, text]) => (
                  <li key={phase}>
                    <span>{phase}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </li>
                ))}
              </ol>
              <ul className={styles.fitList}>
                {plan.forItems.map((item) => (
                  <li key={item}>
                    <CheckCircle2 aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.workflowSection}>
        <div className={styles.shell}>
          <div className={styles.workflowHero}>
            <div className={styles.workflowIntro}>
              <p className={styles.kicker}>{tHome("trainingLoop.eyebrow")}</p>
              <h2>{tHome("trainingLoop.title")}</h2>
              <p>{tHome("trainingLoop.subtitle")}</p>
              <TrackedLink
                href={appPlanUrl("workflow")}
                eventName="plan_template_open"
                eventProperties={{
                  slug: plan.slug,
                  template_slug: plan.templateSlug,
                  source_page: plan.slug,
                  placement: "workflow",
                  locale: lang,
                }}
                className={styles.workflowButton}
              >
                {plan.secondaryCta}
                <ArrowRight aria-hidden="true" />
              </TrackedLink>
            </div>
            <FiveKProductPreview
              variant="workflow"
              lang={lang}
              planSlug={plan.slug}
              distance={plan.distance}
            />
          </div>
          <ol className={styles.workflowGrid}>
            {workflowSteps.map((step, index) => {
              const Icon = WORKFLOW_ICONS[index] ?? Goal;
              return (
                <li key={step.title}>
                  <div>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <Icon aria-hidden="true" />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section id="faq" className={styles.faqSection}>
        <div className={styles.shell}>
          <div className={styles.faqHeading}>
            <p className={styles.kicker}>FAQ</p>
            <h2>
              {plan.distance} {tPlan("labels.faqTitleSuffix")}
            </h2>
            <p>{tPlan("labels.faqSubtitle")}</p>
          </div>
          <div className={styles.faqList}>
            {plan.faq.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>
                  <span>{question}</span>
                  <i aria-hidden="true">+</i>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.signupSection}>
        <div className={styles.signupInner}>
          <div>
            <p>{tSignup("kicker")}</p>
            <h2>{tSignup("title", { days: gift.accessDays })}</h2>
            <span>
              {tSignup("description", {
                days: gift.accessDays,
                credits: formatNewUserGiftCredits(gift.bonusCredits, lang),
              })}
            </span>
          </div>
          <TrackedLink
            href={appPlanUrl("final")}
            eventName="plan_template_open"
            eventProperties={{
              slug: plan.slug,
              template_slug: plan.templateSlug,
              source_page: plan.slug,
              placement: "final",
              locale: lang,
            }}
            className={styles.signupButton}
          >
            {tSignup("cta")}
            <ArrowRight aria-hidden="true" />
          </TrackedLink>
        </div>
      </section>

      {plan.relatedLinks?.length ? (
        <section className={styles.relatedSection}>
          <div className={styles.shell}>
            <div className={styles.relatedHeading}>
              <Route aria-hidden="true" />
              <h2>{plan.relatedTitle}</h2>
            </div>
            <div className={styles.relatedGrid}>
              {plan.relatedLinks.map(([title, href, text]) => (
                <TrackedLink
                  key={href}
                  href={withLocalePath(prefix, href)}
                  eventName="plan_related_click"
                  eventProperties={{
                    slug: plan.slug,
                    target: href,
                    cta_location: "related",
                  }}
                  className={styles.relatedLink}
                >
                  <span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </TrackedLink>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
