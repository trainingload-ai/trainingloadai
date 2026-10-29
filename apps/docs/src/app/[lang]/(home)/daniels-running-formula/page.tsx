import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Gauge,
  TriangleAlert,
} from "lucide-react";
import {
  breadcrumbSchema,
  faqPageSchema,
  normalizeSchemaFaqItems,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";
import { localePrefix } from "@/lib/locale-url";
import {
  getDanielsGuideCopy,
  isVdotContentLocale,
  vdotContentAlternates,
} from "@/lib/vdot-plan-content";
import { optimizeSeoText } from "@/lib/seo-metadata";

const GUIDE_PATH = "/daniels-running-formula";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai"
  ).replace(/\/+$/, "");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const copy = getDanielsGuideCopy(lang);
  const base = siteUrl();
  const pageUrl = `${base}${localePrefix(lang)}${GUIDE_PATH}`;
  const seo = optimizeSeoText({
    locale: lang,
    context: "docs",
    title: copy.metadataTitle,
    description: copy.metadataDescription,
  });
  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: pageUrl,
      languages: vdotContentAlternates(base, GUIDE_PATH),
    },
    robots: isVdotContentLocale(lang)
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      type: "article",
      title: seo.title,
      description: seo.description,
      url: pageUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function DanielsRunningFormulaPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = getDanielsGuideCopy(lang);
  const prefix = localePrefix(lang);
  const base = siteUrl();
  const pageUrl = `${base}${prefix}${GUIDE_PATH}`;
  const faq = copy.faq.map(([question, answer]) => ({ question, answer }));
  const jsonLd = schemaGraph([
    {
      "@type": "Article",
      "@id": schemaId(pageUrl, "article"),
      url: pageUrl,
      headline: copy.title,
      description: copy.metadataDescription,
      inLanguage: schemaLanguage(lang),
      datePublished: "2026-07-28",
      dateModified: "2026-08-25",
      author: {
        "@type": "Organization",
        name: "Trainingload.ai",
        url: base,
      },
      publisher: {
        "@type": "Organization",
        name: "Trainingload.ai",
        url: base,
      },
    },
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(faq),
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: "Trainingload.ai", item: `${base}${prefix}/` },
        { name: copy.title, item: pageUrl },
      ],
    }),
  ]);

  return (
    <main className="overflow-x-hidden bg-background text-neutral-950 dark:text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="relative overflow-hidden border-b border-neutral-200/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.16] dark:opacity-[0.2]"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(15,23,42,0.22) 0 1px, transparent 1px), linear-gradient(0deg, rgba(15,23,42,0.14) 0 1px, transparent 1px)",
            backgroundSize: "76px 76px",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-compact border border-emerald-500/25 bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 backdrop-blur dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              <BookOpen className="size-3.5" />
              {copy.eyebrow}
            </div>
            <h1 className="mt-6 max-w-5xl text-4xl font-black tracking-tight md:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
              {copy.subtitle}
            </p>
            <p className="mt-6 max-w-3xl border-l-4 border-emerald-500 pl-5 text-base font-medium leading-7 text-neutral-800 dark:text-neutral-200">
              {copy.directAnswer}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`${prefix}/vdot-calculator`}
                className="inline-flex h-11 items-center justify-center rounded-compact bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 dark:bg-emerald-400 dark:text-neutral-950 dark:hover:bg-emerald-300"
              >
                {copy.primaryCta}
                <ArrowRight className="ml-2 size-4" />
              </Link>
              <Link
                href={`${prefix}/tools`}
                className="inline-flex h-11 items-center justify-center rounded-compact border border-neutral-300 bg-white/80 px-5 text-sm font-semibold transition hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
              >
                {copy.secondaryCta}
              </Link>
            </div>
          </div>

          <aside className="rounded-compact border border-neutral-900 bg-neutral-950 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                VDOT
              </span>
              <Gauge className="size-4 text-neutral-400" />
            </div>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {["E", "M", "T", "I", "R"].map((zone, index) => (
                <div
                  key={zone}
                  className="rounded-compact border border-white/10 p-3 text-center"
                >
                  <div className="font-mono text-xl font-black text-emerald-300">
                    {zone}
                  </div>
                  <div className="mt-2 h-12 rounded-xs bg-white/5">
                    <div
                      className="w-full rounded-xs bg-gradient-to-t from-emerald-500 to-lime-300"
                      style={{ height: `${38 + index * 14}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-compact border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
              {copy.toc}
            </div>
            <nav className="mt-3 grid gap-1" aria-label={copy.toc}>
              {copy.tocItems.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-compact px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <article className="min-w-0 space-y-12 md:space-y-16">
          <section id="what" className="scroll-mt-24">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {copy.whatTitle}
            </h2>
            <div className="mt-5 space-y-4 text-base leading-8 text-neutral-700 dark:text-neutral-300">
              {copy.whatParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-8 rounded-compact border border-emerald-500/20 bg-emerald-50 p-5 dark:border-emerald-400/20 dark:bg-emerald-400/10">
              <h3 className="font-black text-emerald-950 dark:text-emerald-100">
                {copy.lawsTitle}
              </h3>
              <p className="mt-2 leading-7 text-emerald-950/80 dark:text-emerald-100/80">
                {copy.lawsText}
              </p>
            </div>
          </section>

          <section id="vdot" className="scroll-mt-24">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {copy.vdotTitle}
            </h2>
            <div className="mt-5 space-y-4 text-base leading-8 text-neutral-700 dark:text-neutral-300">
              {copy.vdotParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section id="paces" className="scroll-mt-24">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {copy.paceTitle}
            </h2>
            <p className="mt-4 max-w-3xl leading-7 text-neutral-700 dark:text-neutral-300">
              {copy.paceIntro}
            </p>
            <div className="mt-8 grid gap-3">
              {copy.intensities.map((item) => (
                <div
                  key={item.key}
                  className="grid gap-4 rounded-compact border border-neutral-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04] md:grid-cols-[72px_1fr_1fr]"
                >
                  <div className="flex size-14 items-center justify-center rounded-compact bg-neutral-950 font-mono text-2xl font-black text-emerald-300 dark:bg-white dark:text-neutral-950">
                    {item.key}
                  </div>
                  <div>
                    <h3 className="text-lg font-black">{item.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                      {item.purpose}
                    </p>
                    <p className="mt-2 text-sm font-semibold">{item.feel}</p>
                  </div>
                  <div className="rounded-compact bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
                    <TriangleAlert className="mb-2 size-4" />
                    {item.mistake}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="periodization" className="scroll-mt-24">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {copy.periodizationTitle}
            </h2>
            <p className="mt-4 leading-8 text-neutral-700 dark:text-neutral-300">
              {copy.periodizationText}
            </p>
            <div className="mt-8 overflow-x-auto rounded-compact border border-neutral-200 dark:border-white/10">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <tbody>
                  {copy.goalRows.map(([goal, focus]) => (
                    <tr
                      key={goal}
                      className="border-b border-neutral-200 last:border-0 dark:border-white/10"
                    >
                      <th className="bg-neutral-100 px-5 py-4 font-black dark:bg-white/[0.05]">
                        {goal}
                      </th>
                      <td className="px-5 py-4 text-neutral-700 dark:text-neutral-300">
                        {focus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="mistakes" className="scroll-mt-24">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {copy.mistakesTitle}
            </h2>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {copy.mistakes.map((mistake) => (
                <div
                  key={mistake}
                  className="flex gap-3 rounded-compact border border-neutral-200 p-4 dark:border-white/10"
                >
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                    {mistake}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-compact bg-neutral-950 p-7 text-white md:p-10">
            <div className="max-w-3xl">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                METHOD → REVIEW
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
                {copy.generatorTitle}
              </h2>
              <p className="mt-4 leading-7 text-neutral-300">
                {copy.generatorText}
              </p>
              <Link
                href={`${prefix}/vdot-calculator`}
                className="mt-7 inline-flex h-11 items-center rounded-compact bg-emerald-400 px-5 text-sm font-black text-neutral-950 transition hover:bg-emerald-300"
              >
                {copy.generatorCta}
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-black">{copy.sourcesTitle}</h2>
            <p className="mt-4 leading-7 text-neutral-700 dark:text-neutral-300">
              {copy.sourcesText}
            </p>
            <ul className="mt-5 grid gap-2 text-sm">
              <li>
                <a
                  className="text-emerald-700 underline underline-offset-4 dark:text-emerald-300"
                  href="https://us.humankinetics.com/products/daniels-running-formula-4th-edition"
                  rel="noreferrer"
                  target="_blank"
                >
                  Daniels&apos; Running Formula, 4th Edition — Human Kinetics
                </a>
              </li>
              <li>
                <a
                  className="text-emerald-700 underline underline-offset-4 dark:text-emerald-300"
                  href="https://us.humankinetics.com/blogs/excerpt/the-basic-laws-of-running-according-to-jack-daniels"
                  rel="noreferrer"
                  target="_blank"
                >
                  The basic laws of running according to Jack Daniels
                </a>
              </li>
              <li>
                <a
                  className="text-emerald-700 underline underline-offset-4 dark:text-emerald-300"
                  href="https://support.vdoto2.com/v-o2-faq/"
                  rel="noreferrer"
                  target="_blank"
                >
                  V.O2 FAQ
                </a>
              </li>
            </ul>
          </section>

          <section id="faq" className="scroll-mt-24">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {copy.faqTitle}
            </h2>
            <div className="mt-6 grid gap-3">
              {copy.faq.map(([question, answer]) => (
                <details
                  key={question}
                  className="group rounded-compact border border-neutral-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <summary className="cursor-pointer list-none font-black">
                    {question}
                  </summary>
                  <p className="mt-3 leading-7 text-neutral-700 dark:text-neutral-300">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </section>

          <p className="rounded-compact border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
            {copy.safety}
          </p>
        </article>
      </div>
    </main>
  );
}
