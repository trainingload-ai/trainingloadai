"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { fitnessThresholds, type Vo2Sex } from "@/lib/vo2-field";
import styles from "./vo2-max-calculator.module.css";

const AGES = [20, 30, 40, 50, 60, 70];
const LEVELS = ["poor", "fair", "good", "veryGood", "excellent"] as const;

export function Vo2ReferenceTable() {
  const t = useTranslations("vo2MaxCalculator.client");
  const format = useFormatter();
  const oneDecimal = (value: number) =>
    format.number(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const [sex, setSex] = useState<Vo2Sex>("male");
  return (
    <div>
      <div className={styles.referenceToolbar}>
        <div
          className={styles.referenceSwitch}
          role="group"
          aria-label={t("profile.sex.label")}
        >
          {(["male", "female"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sex === value}
              onClick={() => setSex(value)}
            >
              {t(`common.gender.${value}`)}
            </button>
          ))}
        </div>
        <span>{t("scorecard.unit")}</span>
      </div>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label={t("scorecard.bandsTitle")}
      >
        <table className={styles.referenceTable}>
          <thead>
            <tr>
              <th scope="col">{t("profile.age.label")}</th>
              {LEVELS.map((level) => (
                <th scope="col" key={level}>
                  {t(`fitnessLevel.levels.${level}.label`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AGES.map((age) => {
              const bands = fitnessThresholds(sex, age);
              return (
                <tr key={age}>
                  <th scope="row">
                    {age}–{age + 9}
                  </th>
                  <td>&lt; {oneDecimal(bands.fair)}</td>
                  <td>
                    {oneDecimal(bands.fair)}–{oneDecimal(bands.good - 0.1)}
                  </td>
                  <td>
                    {oneDecimal(bands.good)}–{oneDecimal(bands.veryGood - 0.1)}
                  </td>
                  <td>
                    {oneDecimal(bands.veryGood)}–
                    {oneDecimal(bands.excellent - 0.1)}
                  </td>
                  <td>≥ {oneDecimal(bands.excellent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>{t("scorecard.referenceNote")}</p>
    </div>
  );
}
