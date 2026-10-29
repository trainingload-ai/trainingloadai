"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fitCriticalPower, type CpModelFit } from "@/lib/critical-power";
import styles from "./critical-power-calculator.module.css";

const EXAMPLE = fitCriticalPower([
  { seconds: 180, watts: 400 },
  { seconds: 360, watts: 350 },
  { seconds: 720, watts: 300 },
])!;

export function CpFitChart({ fit }: { fit: CpModelFit | null }) {
  const t = useTranslations("criticalPowerCalculator.page.chart");
  const [view, setView] = useState("power");
  const model = fit ?? EXAMPLE;
  const isWork = view === "work";
  const unit = isWork ? "kJ" : "W";
  const minSeconds = isWork
    ? 0
    : Math.min(...model.points.map((point) => point.seconds));
  const maxSeconds = Math.max(
    1200,
    ...model.points.map((point) => point.seconds),
  );
  const points = model.points.map(({ seconds, watts }) => ({
    minutes: seconds / 60,
    observed: isWork ? (watts * seconds) / 1000 : watts,
  }));
  // Fit work against time; the power curve is the same model divided by time.
  const curve = Array.from({ length: 81 }, (_, index) => {
    const seconds = minSeconds + ((maxSeconds - minSeconds) * index) / 80;
    return {
      minutes: seconds / 60,
      predicted: isWork
        ? (model.cpWatts * seconds + model.wPrimeJoules) / 1000
        : model.cpWatts + model.wPrimeJoules / seconds,
    };
  });
  const config = {
    predicted: {
      label: t(isWork ? "fitLine" : "curve"),
      color: "var(--chart-actual)",
    },
    observed: { label: t("observed"), color: "var(--chart-warning)" },
  };
  const maxValue = Math.ceil(
    Math.max(
      ...curve.map((point) => point.predicted),
      ...points.map((point) => point.observed),
    ) * 1.08,
  );

  return (
    <div className={styles.fitChart}>
      <Tabs value={view} onValueChange={setView}>
        <div className={styles.fitChartHeader}>
          <div>
            <h3>{t("title")}</h3>
            <p>{t(fit ? "yourData" : "example")}</p>
          </div>
          <TabsList aria-label={t("views")}>
            <TabsTrigger value="power">{t("power")}</TabsTrigger>
            <TabsTrigger value="work">{t("work")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent key={view} value={view}>
          <div className={styles.fitChartLegend}>
            <span>
              <i aria-hidden="true" />
              {t(isWork ? "fitLine" : "curve")}
            </span>
            <span>
              <i className={styles.fitChartDot} aria-hidden="true" />
              {t("observed")}
            </span>
          </div>
          <div className={styles.fitChartAxes}>
            <span>
              {t(isWork ? "workAxis" : "powerAxis")} · {unit}
            </span>
            <span>{t("timeAxis")} · min</span>
          </div>
          <ChartContainer
            config={config}
            className="aspect-auto h-[300px] w-full min-w-0"
            initialDimension={{ width: 800, height: 300 }}
          >
            <ComposedChart
              accessibilityLayer
              data={curve}
              margin={{ top: 20, right: 14, bottom: 4, left: -14 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="minutes"
                domain={[minSeconds / 60, maxSeconds / 60]}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `${Number(value.toFixed(1))}`}
              />
              <YAxis
                type="number"
                domain={[0, maxValue]}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <ChartTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      `${Number(Number(payload[0]?.payload?.minutes ?? 0).toFixed(1))} min`
                    }
                    formatter={(value, name) => (
                      <span>
                        {name === "observed"
                          ? t("observed")
                          : t(isWork ? "fitLine" : "curve")}{" "}
                        <strong className="ml-2 font-mono">
                          {Number(value).toFixed(1)} {unit}
                        </strong>
                      </span>
                    )}
                  />
                }
              />
              {!isWork ? (
                <ReferenceLine
                  y={model.cpWatts}
                  stroke="var(--color-predicted)"
                  strokeDasharray="5 5"
                  label={{
                    value: `CP ${Math.round(model.cpWatts)} W`,
                    position: "insideBottomRight",
                    fill: "var(--color-predicted)",
                    fontSize: 12,
                  }}
                />
              ) : null}
              <Line
                dataKey="predicted"
                type="monotone"
                dot={false}
                activeDot={false}
                stroke="var(--color-predicted)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Scatter
                data={points}
                dataKey="observed"
                fill="var(--color-observed)"
                stroke="var(--cp-surface)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              {isWork ? (
                <ReferenceDot
                  x={0}
                  y={model.wPrimeJoules / 1000}
                  r={5}
                  fill="var(--color-predicted)"
                  stroke="var(--cp-surface)"
                  label={{
                    value: `W′ ${(model.wPrimeJoules / 1000).toFixed(1)} kJ`,
                    position: "right",
                    fill: "var(--color-predicted)",
                    fontSize: 12,
                  }}
                />
              ) : null}
            </ComposedChart>
          </ChartContainer>
          {isWork ? (
            <div className={styles.fitChartConversion}>
              {model.points.map(({ seconds, watts }, index) => (
                <span key={index}>
                  {seconds / 60} min · {watts} W →{" "}
                  {((seconds * watts) / 1000).toFixed(1)} kJ
                </span>
              ))}
            </div>
          ) : null}
          <div className={styles.fitChartExplanation}>
            <div>
              <h4>{t(isWork ? "slope" : "cp")}</h4>
              <strong>{Math.round(model.cpWatts)} W</strong>
              <p>
                {t(isWork ? "slopeBody" : "cpBody", {
                  work: ((model.cpWatts * 60) / 1000).toFixed(1),
                })}
              </p>
            </div>
            <div>
              <h4>{t(isWork ? "intercept" : "wPrime")}</h4>
              <strong>{(model.wPrimeJoules / 1000).toFixed(1)} kJ</strong>
              <p>{t(isWork ? "interceptBody" : "wPrimeBody")}</p>
            </div>
          </div>
          <p className={styles.fitChartNote}>
            {t(model.points.length === 2 ? "twoPoints" : "threePoints")}
          </p>
        </TabsContent>
      </Tabs>
      <table className="sr-only">
        <caption>{t("tableCaption")}</caption>
        <thead>
          <tr>
            <th>{t("timeAxis")} (min)</th>
            <th>{t("powerAxis")} (W)</th>
            <th>{t("workAxis")} (kJ)</th>
          </tr>
        </thead>
        <tbody>
          {model.points.map((point, index) => (
            <tr key={index}>
              <td>{point.seconds / 60}</td>
              <td>{point.watts}</td>
              <td>{((point.seconds * point.watts) / 1000).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
