import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import {
  getRacePredictionExamples,
  RACE_PREDICTION_SOURCES,
} from "@/lib/race-time-education";
import { PREDICT_RACE_KEYS } from "@/lib/race-time-predictor";
import { localePrefix } from "@/lib/locale-url";
import styles from "./race-time-predictor.module.css";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${styles.section} ${styles.educationSection}`}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export async function RaceEducation({ lang }: { lang: string }) {
  const t = await getTranslations({
    locale: lang,
    namespace: "raceTimePredictor.page.education",
  });
  const tRace = await getTranslations({
    locale: lang,
    namespace: "raceTimePredictor.client.presets",
  });
  const prefix = localePrefix(lang);
  const examples = getRacePredictionExamples();
  const tenKExample = examples.find(
    (row) => row.source === "10k" && row.sourceTime === "50:00",
  )!;
  const steps = t.raw("input.steps") as Array<{ title: string; body: string }>;
  const checks = t.raw("accuracy.checks") as string[];
  return (
    <div className={styles.education}>
      <Section id="what-is-race-time-prediction" title={t("definition.title")}>
        <p>{t("definition.body")}</p>
      </Section>
      <Section id="marathon-time-predictor" title={t("marathon.title")}>
        <p>{t("marathon.body")}</p>
        <div className={styles.distanceGuide}>
          {(["from5k", "from10k", "fromHalf"] as const).map((key) => (
            <div key={key}>
              <h3>{t(`marathon.${key}.title`)}</h3>
              <p>{t(`marathon.${key}.body`)}</p>
            </div>
          ))}
        </div>
        <p>
          {t("marathon.example", {
            source: tenKExample.sourceTime,
            marathon: tenKExample.times.marathon,
          })}
        </p>
        <a href={`${prefix}/marathon-training-plan`}>
          {t("input.marathonLink")} →
        </a>
      </Section>
      <Section id="prediction-examples" title={t("examples.title")}>
        <p>{t("examples.body")}</p>
        <p className={styles.tableHint}>{t("tableHint")}</p>
        <div
          className={styles.educationTableWrap}
          role="region"
          tabIndex={0}
          aria-label={t("examples.caption")}
        >
          <table className={styles.educationTable}>
            <caption className="sr-only">{t("examples.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("examples.source")}</th>
                {PREDICT_RACE_KEYS.map((key) => (
                  <th scope="col" key={key}>
                    {tRace(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {examples.map((row) => (
                <tr key={`${row.source}-${row.sourceTime}`}>
                  <th scope="row">
                    {tRace(row.source)} · {row.sourceTime}
                  </th>
                  {PREDICT_RACE_KEYS.map((key) => (
                    <td key={key}>{row.times[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t("examples.note")}</p>
      </Section>
      <Section id="prediction-accuracy" title={t("accuracy.title")}>
        <p>{t("accuracy.body")}</p>
        <ul className={styles.educationList}>
          {checks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          {t("accuracy.research")} <a href="#race-source-research">[2]</a>
        </p>
      </Section>
      <Section id="prediction-methods" title={t("comparison.title")}>
        <p className={styles.tableHint}>{t("tableHint")}</p>
        <div
          className={styles.educationTableWrap}
          role="region"
          tabIndex={0}
          aria-label={t("comparison.title")}
        >
          <table
            className={`${styles.educationTable} ${styles.comparisonTable}`}
          >
            <caption className="sr-only">{t("comparison.title")}</caption>
            <thead>
              <tr>
                {(["model", "input", "meaning"] as const).map((key) => (
                  <th scope="col" key={key}>
                    {t(`comparison.headers.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["vdot", "Daniels VDOT", "vdot", 1],
                  ["riegel", "Riegel", "research", 2],
                  ["garmin", "Garmin", "garmin", 3],
                ] as const
              ).map(([key, name, source, number]) => (
                <tr key={key}>
                  <th scope="row">
                    {name} <a href={`#race-source-${source}`}>[{number}]</a>
                  </th>
                  <td>{t(`comparison.rows.${key}.input`)}</td>
                  <td>{t(`comparison.rows.${key}.meaning`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t("comparison.note")}</p>
      </Section>
      <Section id="choose-race-result" title={t("input.title")}>
        <ol className={styles.educationList}>
          {steps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <p>{t("input.privacy")}</p>
        <div className={styles.educationLinks}>
          <a href={`${prefix}/running-pace-calculator`}>
            {t("input.paceLink")} →
          </a>
          <a href={`${prefix}/vdot-calculator`}>{t("input.vdotLink")} →</a>
        </div>
      </Section>
    </div>
  );
}

export async function RaceSources({ lang }: { lang: string }) {
  const t = await getTranslations({
    locale: lang,
    namespace: "raceTimePredictor.page.education.sources",
  });
  return (
    <Section id="race-prediction-sources" title={t("title")}>
      <ol className={styles.educationList}>
        {RACE_PREDICTION_SOURCES.map((source) => (
          <li key={source.key} id={`race-source-${source.key}`}>
            <a href={source.href} target="_blank" rel="noopener noreferrer">
              {source.label}
            </a>
            <p>{t(source.key)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
