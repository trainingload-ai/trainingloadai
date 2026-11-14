import type { Metadata } from "next";
import Link from "next/link";
import {
  ToolPageMain,
  ToolHero,
  ToolSection,
  ToolFaqSection,
} from "@/components/ToolPageLayout";
import {
  absoluteAlternatesForPath,
  absoluteLocalizedUrl,
  withLocalePath,
} from "@/lib/locale-url";
import { getLactateCopy } from "@/lib/lactate-curve-copy";
import { lactateExample } from "@/lib/lactate-recording";
import {
  LACTATE_METHOD_IDS,
  LACTATE_REFERENCE_COMMIT,
} from "@trainingloadai/shared/lactate-analysis";
import {
  breadcrumbSchema,
  schemaGraph,
  schemaId,
  webApplicationSchema,
  webPageSchema,
} from "@/lib/seo-schema";
import { LactateCurveCalculatorClient, LactateToolFooter } from "./client";
import styles from "./lactate-curve.module.css";

const PATH = "/lactate-curve-calculator";
const siteUrl = () =>
  (process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai").replace(
    /\/+$/,
    "",
  );

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const c = getLactateCopy(lang);
  const url = absoluteLocalizedUrl(siteUrl(), lang, PATH);
  const title = `${c.title} | LT1, LT2 & Dmax`;
  return {
    title,
    description: c.description,
    alternates: {
      canonical: url,
      languages: absoluteAlternatesForPath(siteUrl(), PATH),
    },
    openGraph: {
      title,
      description: c.description,
      url,
      type: "website",
      images: [`${siteUrl()}/og/lactate-curve-calculator.png`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: c.description,
      images: [`${siteUrl()}/og/lactate-curve-calculator.png`],
    },
  };
}

export default async function LactateCurveCalculatorPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const c = getLactateCopy(lang);
  const url = absoluteLocalizedUrl(siteUrl(), lang, PATH);
  const schema = schemaGraph([
    webPageSchema({
      id: schemaId(url, "page"),
      url,
      name: c.title,
      description: c.description,
      lang,
      mainEntityId: schemaId(url, "app"),
    }),
    webApplicationSchema({
      id: schemaId(url, "app"),
      url,
      name: c.title,
      description: c.description,
      applicationCategory: "HealthApplication",
      featureList: [c.inputTitle, c.methodsTitle, c.zones, c.export],
    }),
    breadcrumbSchema({
      id: schemaId(url, "breadcrumb"),
      items: [
        { name: "Trainingload.ai", item: siteUrl() },
        { name: c.title, item: url },
      ],
    }),
  ]);
  return (
    <ToolPageMain as="div" className={styles.pageFrame}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
      <div className={styles.noPrint}>
        <ToolHero badge={c.badge} title={c.title} subtitle={c.description}>
          <p className={styles.muted}>{c.privacy}</p>
        </ToolHero>
      </div>
      <LactateCurveCalculatorClient copy={c} lang={lang} />
      <div className={styles.noPrint}>
        <ToolSection title={c.instructionsTitle}>
          <ol className={styles.notes}>
            {c.instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <details className={styles.exampleRecording}>
            <summary>
              {c.sample} · {c.cycling}
            </summary>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>
                  {c.sample} · {c.cycling}
                </caption>
                <thead>
                  <tr>
                    <th>{c.intensity} (W)</th>
                    <th>{c.lactate} (mmol/L)</th>
                    <th>{c.heartRate} (bpm)</th>
                  </tr>
                </thead>
                <tbody>
                  {lactateExample("cycling").map((row) => (
                    <tr key={row.intensity}>
                      <td>{row.intensity}</td>
                      <td>{row.lactate}</td>
                      <td>{row.heartRate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </ToolSection>
      </div>
      <div className={styles.noPrint}>
        <ToolSection
          id="methods"
          title={c.methodsTitle}
          description={c.methodHelp}
        >
          <div className={styles.methods}>
            {LACTATE_METHOD_IDS.map((method) => (
              <article id={`method-${method}`} key={method}>
                <h3 className={styles.subTitle}>{c.methodNames[method]}</h3>
                <p className={styles.muted}>{c.methodDescriptions[method]}</p>
              </article>
            ))}
          </div>
          <p className={styles.muted}>
            {c.source}:{" "}
            <a
              className="underline underline-offset-4"
              href={`https://github.com/fmmattioni/lactater/tree/${LACTATE_REFERENCE_COMMIT}`}
            >
              lactater 1.0.0 · {LACTATE_REFERENCE_COMMIT.slice(0, 7)}
            </a>
            .{" "}
            <a
              className="underline underline-offset-4"
              href="https://doi.org/10.1371/journal.pone.0199794"
            >
              Jamnick et al. (2018)
            </a>
          </p>
        </ToolSection>
      </div>
      <div className={styles.noPrint}>
        <ToolFaqSection title={c.faqTitle} items={c.faq} />
      </div>
      <div className={styles.noPrint}>
        <ToolSection title={c.alternative} description={c.alternativeBody}>
          <div className={styles.links}>
            <Link href={withLocalePath(lang, "/lactate-threshold-calculator")}>
              {c.threshold} · {c.alternative}
            </Link>
            <Link href={withLocalePath(lang, "/heart-rate-zones-calculator")}>
              {c.heartRate}
            </Link>
            <Link href={withLocalePath(lang, "/power-zones-calculator")}>
              {c.cycling} · W
            </Link>
            <Link
              href={withLocalePath(
                lang,
                "/docs/metrics/physiology/lactate-threshold",
              )}
            >
              {c.methodHelp}
            </Link>
          </div>
        </ToolSection>
      </div>
      <div className={styles.noPrint}>
        <LactateToolFooter copy={c} lang={lang} />
      </div>
    </ToolPageMain>
  );
}
