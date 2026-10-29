import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { localePrefix } from "@/lib/locale-url";
import {
  getPaceCalculationExamples,
  getPaceConversions,
  getRacePaceGoals,
  PACE_RACE_KEYS,
  PACE_SOURCES,
} from "@/lib/running-pace-education";
import styles from "./running-pace-calculator.module.css";

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

export async function PaceEducation({ lang }: { lang: string }) {
  const t = await getTranslations({
    locale: lang,
    namespace: "runningPaceCalculator.page.education",
  });
  const numbers = new Intl.NumberFormat(lang, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const examples = getPaceCalculationExamples();
  const readings = t.raw("reading.items") as Array<{
    title: string;
    body: string;
  }>;
  const prefix = localePrefix(lang);

  return (
    <div className={styles.education}>
      <Section id="what-is-running-pace" title={t("definition.title")}>
        <p className={styles.shortAnswer}>{t("definition.answer")}</p>
        <p>{t("definition.detail")}</p>
      </Section>
      <Section id="pace-formulas" title={t("formulas.title")}>
        <p>{t("formulas.intro")}</p>
        <div className={styles.formulaList}>
          {(["pace", "time", "distance"] as const).map((key) => (
            <div key={key}>
              <h3>{t(`formulas.rows.${key}.title`)}</h3>
              <p className={styles.formula}>
                {t(`formulas.rows.${key}.formula`)}
              </p>
              <p>
                {t(`formulas.rows.${key}.example`, { result: examples[key] })}
              </p>
            </div>
          ))}
        </div>
        <p>{t("formulas.clockNote")}</p>
      </Section>
      <Section id="pace-conversion" title={t("conversion.title")}>
        <p>{t("conversion.body")}</p>
        <p className={styles.note}>{t("goals.tableHint")}</p>
        <div
          className={styles.reference}
          role="region"
          tabIndex={0}
          aria-label={t("conversion.caption")}
        >
          <table className={styles.table}>
            <caption className="sr-only">{t("conversion.caption")}</caption>
            <thead>
              <tr>
                {(["km", "mile", "kmh", "mph"] as const).map((key) => (
                  <th scope="col" key={key}>
                    {t(`conversion.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {getPaceConversions().map((row) => (
                <tr key={row.perKm}>
                  <th scope="row">{row.perKm}</th>
                  <td>{row.perMile}</td>
                  <td>{numbers.format(row.kmh)}</td>
                  <td>{numbers.format(row.mph)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t("conversion.formula")}</p>
        <p className={styles.note}>
          {t("conversion.note")}{" "}
          <a href={PACE_SOURCES.units}>{t("sources.units")}</a>
        </p>
      </Section>
      <Section id="race-pace-charts" title={t("goals.title")}>
        <p>{t("goals.body")}</p>
        <div className={styles.goalTables}>
          {PACE_RACE_KEYS.map((race) => (
            <section key={race} id={`${race}-pace-chart`}>
              <h3>{t(`goals.titles.${race}`)}</h3>
              <div
                className={styles.reference}
                role="region"
                tabIndex={0}
                aria-label={t(`goals.titles.${race}`)}
              >
                <table className={styles.table}>
                  <caption className="sr-only">
                    {t("goals.caption", { race: t(`goals.titles.${race}`) })}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("goals.goal")}</th>
                      <th scope="col">{t("conversion.km")}</th>
                      <th scope="col">{t("conversion.mile")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getRacePaceGoals(race).map((row) => (
                      <tr key={row.time}>
                        <th scope="row">{row.time}</th>
                        <td>{row.perKm}</td>
                        <td>{row.perMile}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
        <p className={styles.note}>{t("goals.note")}</p>
        <p className={styles.note}>
          {t("sources.distances")}{" "}
          <a href={PACE_SOURCES.distances}>World Athletics</a>
        </p>
      </Section>
      <Section id="understand-your-pace" title={t("reading.title")}>
        <div className={styles.readingList}>
          {readings.map((item, index) => (
            <div key={item.title}>
              <h3>{item.title}</h3>
              <p>
                {t(`reading.items.${index}.body`, {
                  weightedPace: examples.weightedPace,
                })}
              </p>
            </div>
          ))}
        </div>
      </Section>
      <Section id="choose-a-running-tool" title={t("next.title")}>
        <p>{t("next.body")}</p>
        <div className={styles.toolLinks}>
          <a href={`${prefix}/vdot-calculator`}>{t("next.vdot")} →</a>
          <a href={`${prefix}/race-time-predictor`}>{t("next.predictor")} →</a>
          <a href={`${prefix}/docs/metrics/pace/zones`}>{t("next.zones")} →</a>
        </div>
      </Section>
    </div>
  );
}
