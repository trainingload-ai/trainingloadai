"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatPmcValue, type PmcProjection } from "@/lib/pmc-ewma";
import styles from "./training-load-calculator.module.css";

const COLORS = { ctl: "#76efa3", atl: "#f5cf58", tsb: "#ff766a" };

export function LoadTrendChart({ projection }: { projection: PmcProjection }) {
  const t = useTranslations("trainingLoadCalculator.page.chart");
  const data = [
    {
      day: 0,
      ctl: projection.startingCtl,
      atl: projection.startingAtl,
      tsb: projection.startingTsb,
    },
    ...projection.days.map((point) => ({ ...point, day: point.dayIndex + 1 })),
  ];
  const config = Object.fromEntries(
    Object.entries(COLORS).map(([key, color]) => [
      key,
      { label: key.toUpperCase(), color },
    ]),
  );

  return (
    <figure className={styles.trend} aria-label={t("title")}>
      <figcaption className={styles.trendHeading}>
        <span>{t("title")}</span>
        <span className={styles.trendLegend}>
          {Object.entries(COLORS).map(([key, color]) => (
            <span key={key}>
              <i style={{ background: color }} aria-hidden />
              {key.toUpperCase()}
            </span>
          ))}
        </span>
      </figcaption>
      <ChartContainer config={config} className={styles.trendChart}>
        <LineChart
          data={data}
          accessibilityLayer
          margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="#294037"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="day"
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickFormatter={(day: number) =>
              day === 0 ? t("start") : `D${day}`
            }
            tickMargin={8}
          />
          <YAxis tickLine={false} axisLine={false} width={48} tickCount={5} />
          <ReferenceLine y={0} stroke="#75867c" strokeDasharray="4 4" />
          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className={styles.trendTooltip}>
                  <strong>
                    {Number(label) === 0
                      ? t("start")
                      : t("day", { day: Number(label) })}
                  </strong>
                  {payload.map((item) => (
                    <p key={String(item.dataKey)}>
                      <span style={{ color: item.color }}>
                        {String(item.name)}
                      </span>
                      <strong>{formatPmcValue(Number(item.value))}</strong>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {Object.entries(COLORS).map(([key, color]) => (
            <Line
              key={key}
              type="linear"
              dataKey={key}
              name={key.toUpperCase()}
              stroke={color}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </figure>
  );
}
