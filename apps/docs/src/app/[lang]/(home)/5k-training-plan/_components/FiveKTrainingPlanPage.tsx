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
import {
  breadcrumbSchema,
  howToSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";
import type {
  RunningPlan,
  RunningPlanPageLabels,
} from "@/lib/running-plan-pages";
import { getRunningPlanSchedule } from "@/lib/running-plan-schedules";
import {
  FiveKProductPreview,
  FiveKWorkflowPreview,
} from "./FiveKProductPreview";
import { FiveKSystemShowcase } from "./FiveKSystemShowcase";
import styles from "../five-k-training-plan.module.css";

type ProductModule = {
  name: string;
  title: string;
  description: string;
  points: string[];
  cta?: string;
};

export type FiveKProductCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  modules: ProductModule[];
};

export type FiveKPlanValueCopy = {
  freeLabel: string;
  freeTitle: string;
  freeText: string;
  aiLabel: string;
  aiTitle: string;
  aiText: string;
};

export type FiveKWorkflowCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: Array<{ title: string; description: string }>;
};

export type FiveKSignupCopy = {
  kicker: string;
  title: string;
  description: string;
  cta: string;
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

type DistancePlanVariant =
  | "couch"
  | "5k"
  | "5k-intermediate"
  | "10k"
  | "half-marathon"
  | "marathon";

const HERO_HEADINGS: Record<DistancePlanVariant, Record<string, string[]>> = {
  couch: {
    en: ["Free 9-week", "Couch to 5K plan", "From walking to your first 5K"],
    zh: ["免费 9 周", "Couch to 5K 训练计划", "从走路开始，完成 5 公里"],
    "zh-hant": [
      "免費 9 週",
      "Couch to 5K 訓練計畫",
      "從走路開始，完成第一個 5K",
    ],
    ja: [
      "無料9週間",
      "Couch to 5Kプラン",
      "ウォーキングから、初めての5K完走へ",
    ],
  },
  "5k": {
    en: ["Free 8-week", "5K training plan", "Build toward race day"],
    zh: ["免费 8 周", "5 公里训练计划", "稳步完成首个 5K"],
    "zh-hant": ["免費 8 週", "5K 訓練計畫", "穩步完成首個 5K"],
    ja: ["無料8週間", "5Kトレーニングプラン", "レース当日まで着実に"],
  },
  "5k-intermediate": {
    en: ["Free 8-week", "Intermediate 5K plan", "Train for a faster 5K"],
    zh: ["免费 8 周", "进阶 5 公里训练计划", "用间歇与节奏跑提速"],
    "zh-hant": ["免費 8 週", "進階 5K 訓練計畫", "用間歇與節奏跑提速"],
    ja: ["無料8週間", "中級者向け5Kプラン", "インターバルとテンポで速く"],
  },
  "10k": {
    en: ["Free 10-week", "10K training plan", "Build beyond your first 5K"],
    zh: ["免费 10 周", "10 公里训练计划", "从 5K 稳步跑向 10K"],
    "zh-hant": ["免費 10 週", "10 公里訓練計畫", "從 5K 穩步跑向 10K"],
    ja: ["無料10週間", "10km練習メニュー", "5Kの先へ、着実に完走"],
  },
  "half-marathon": {
    en: ["Free 14-week", "Half marathon plan", "Build for your first 21.1K"],
    zh: ["免费 14 周", "半马训练计划", "为首个 21.1 公里打好基础"],
    "zh-hant": ["免費 14 週", "半馬訓練計畫", "為首個 21.1 公里打好基礎"],
    ja: ["無料14週間", "ハーフマラソン練習", "初めての21.1km完走へ"],
  },
  marathon: {
    en: [
      "Free 18-week",
      "Marathon training plan",
      "Prepare for your first 42.2K",
    ],
    zh: ["免费 18 周", "马拉松训练计划", "完成你的首场全马"],
    "zh-hant": ["免費 18 週", "馬拉松訓練計畫", "完成你的首場全馬"],
    ja: ["無料18週間", "フルマラソン練習", "初めての42.2km完走へ"],
  },
};

function planVariant(slug: RunningPlan["slug"]): DistancePlanVariant {
  if (slug === "couch-to-5k-training-plan") return "couch";
  if (slug === "5k-training-plan-intermediate") return "5k-intermediate";
  if (slug === "10k-training-plan") return "10k";
  if (slug === "half-marathon-training-plan") return "half-marathon";
  if (slug === "marathon-training-plan") return "marathon";
  return "5k";
}

function heroHeading(lang: string, plan: RunningPlan) {
  const headings = HERO_HEADINGS[planVariant(plan.slug)];
  if (lang.toLowerCase().startsWith("zh-hant")) return headings["zh-hant"];
  if (lang.toLowerCase().startsWith("zh")) return headings.zh;
  if (lang.toLowerCase().startsWith("ja")) return headings.ja;
  if (lang.toLowerCase().startsWith("en")) return headings.en;
  return [plan.title];
}

export function FiveKTrainingPlanPage({
  lang,
  plan,
  labels,
  product,
  planValue,
  workflow,
  signup,
}: {
  lang: string;
  plan: RunningPlan;
  labels: RunningPlanPageLabels;
  product: FiveKProductCopy;
  planValue: FiveKPlanValueCopy;
  workflow: FiveKWorkflowCopy;
  signup: FiveKSignupCopy;
}) {
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
    product.modules[2],
    product.modules[1],
    product.modules[3],
    product.modules[0],
  ].filter((module): module is ProductModule => Boolean(module));
  const systemModules = orderedModules.slice(1);
  const headingLines = heroHeading(lang, plan);

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
        { name: labels.home, item: `${siteUrl}${prefix}/` },
        { name: labels.plans, item: `${siteUrl}${prefix}/plan` },
        { name: plan.distance, item: pageUrl },
      ],
    }),
  ]);

  const systemExperience = (
    <section id="system" className={styles.systemSection}>
      <div className={styles.shell}>
        <div className={styles.systemHeading}>
          <p className={styles.kicker}>{product.eyebrow}</p>
          <h2>{product.title}</h2>
          <p>{product.subtitle}</p>
        </div>

        <FiveKSystemShowcase
          modules={systemModules}
          lang={lang}
          slug={plan.slug}
          prefix={prefix}
          calendarHref={appPlanUrl("system_calendar")}
          calendarLabel={labels.addToCalendar}
        />
      </div>
    </section>
  );

  return (
    <main className={styles.page}>
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
                  {labels.viewFullSchedule}
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
              [labels.timeline, plan.weeks],
              [labels.volume, plan.weeklyVolume],
              [labels.level, plan.level],
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
            ["#system", product.title],
            ["#plan-method", plan.contentTitle ?? plan.previewTitle],
            ["#faq", `${plan.distance} ${labels.faqTitleSuffix}`],
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
              <p className={styles.kicker}>{plan.distance} / START HERE</p>
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
          <aside className={styles.planBridge}>
            <div className={styles.bridgeCopy}>
              <span>{planValue.freeLabel}</span>
              <h3>{planValue.freeTitle}</h3>
              <p>{planValue.freeText}</p>
            </div>
            <div className={styles.bridgeCopy}>
              <span>{planValue.aiLabel}</span>
              <h3>{planValue.aiTitle}</h3>
              <p>{planValue.aiText}</p>
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
              {labels.addToCalendar}
              <ArrowRight aria-hidden="true" />
            </TrackedLink>
          </aside>
        }
      />

      {systemExperience}

      <RunningPlanIntentGuide slug={plan.slug} lang={lang} />

      <section id="plan-method" className={styles.methodSection}>
        <div className={styles.shell}>
          <div className={styles.methodHeading}>
            <p className={styles.kicker}>{plan.distance} / TRAINING METHOD</p>
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
              <p className={styles.kicker}>{workflow.eyebrow}</p>
              <h2>{workflow.title}</h2>
              <p>{workflow.subtitle}</p>
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
            <FiveKWorkflowPreview
              lang={lang}
              planSlug={plan.slug}
              distance={plan.distance}
            />
          </div>
          <ol className={styles.workflowGrid}>
            {workflow.steps.map((step, index) => {
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
              {plan.distance} {labels.faqTitleSuffix}
            </h2>
            <p>{labels.faqSubtitle}</p>
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
            <p>{signup.kicker}</p>
            <h2>{signup.title}</h2>
            <span>{signup.description}</span>
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
            {signup.cta}
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
    </main>
  );
}
