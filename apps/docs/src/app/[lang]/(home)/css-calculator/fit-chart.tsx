"use client";

import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { calculateCss, formatPaceClock, type CssResult } from "@/lib/css";
import styles from "./css-calculator.module.css";

const EXAMPLE = calculateCss(
  { distance: 400, timeSec: 360 },
  { distance: 200, timeSec: 160 },
  "meters",
)!;

export function CssFitChart({ result }: { result: CssResult | null }) {
  const t = useTranslations("cssCalculator.page.chart");
  const model = result ?? EXAMPLE;
  const unit = model.unit === "yards" ? "yd" : "m";
  const points = [
    { minutes: model.shortTimeSec / 60, distance: model.shortDistance },
    { minutes: model.longTimeSec / 60, distance: model.longDistance },
  ];
  const deltaDistance = model.longDistance - model.shortDistance;
  const deltaTime = model.longTimeSec - model.shortTimeSec;
  const timePadding = (deltaTime / 60) * 0.18;
  const distancePadding = deltaDistance * 0.3;
  return (
    <figure className={styles.fitChart}>
      <div className={styles.fitChartHeader}>
        <div>
          <h3>{t("title")}</h3>
          <p>{t(result ? "current" : "example")}</p>
        </div>
        <span className={styles.chartFormula}>CSS = ΔD / ΔT</span>
      </div>
      <div className={styles.fitChartBody}>
        <div className={styles.fitChartVisual}>
          <div className={styles.fitChartLegend}>
            <span>
              <i />
              {t("line")}
            </span>
            <span>
              <i className={styles.fitChartDot} />
              {t("records")}
            </span>
          </div>
          <div className={styles.fitChartAxes}>
            <span>{t("distance", { unit })}</span>
          </div>
          <ChartContainer
            config={{
              distance: {
                label: t("records"),
                color: "var(--chart-actual)",
              },
            }}
            className="aspect-auto h-[300px] w-full min-w-0"
            initialDimension={{ width: 800, height: 300 }}
          >
            <ComposedChart
              accessibilityLayer
              data={points}
              margin={{ top: 20, right: 10, bottom: 8, left: -12 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="minutes"
                domain={[
                  Math.max(0, points[0].minutes - timePadding),
                  points[1].minutes + timePadding,
                ]}
                ticks={[
                  points[0].minutes,
                  (points[0].minutes + points[1].minutes) / 2,
                  points[1].minutes,
                ]}
                allowDataOverflow
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                tickFormatter={(n: number) => formatPaceClock(n * 60)}
              />
              <YAxis
                type="number"
                domain={[
                  Math.max(0, model.shortDistance - distancePadding),
                  model.longDistance + distancePadding,
                ]}
                ticks={[
                  model.shortDistance,
                  (model.shortDistance + model.longDistance) / 2,
                  model.longDistance,
                ]}
                allowDataOverflow
                tickLine={false}
                axisLine={false}
                width={58}
                tickFormatter={(n: number) => String(Number(n.toFixed(1)))}
              />
              <ReferenceLine
                segment={[
                  { x: points[0].minutes, y: model.shortDistance },
                  { x: points[1].minutes, y: model.shortDistance },
                ]}
                stroke="var(--css-muted)"
                strokeDasharray="4 4"
                label={{
                  value: t("timeDelta", { value: formatPaceClock(deltaTime) }),
                  position: "bottom",
                  offset: 14,
                  fill: "var(--css-muted)",
                  fontSize: 11,
                }}
              />
              <ReferenceLine
                segment={[
                  { x: points[1].minutes, y: model.shortDistance },
                  { x: points[1].minutes, y: model.longDistance },
                ]}
                stroke="var(--css-muted)"
                strokeDasharray="4 4"
                label={{
                  value: t("distanceDelta", {
                    value: Number(deltaDistance.toFixed(1)),
                    unit,
                  }),
                  position: "left",
                  offset: 10,
                  fill: "var(--css-muted)",
                  fontSize: 11,
                }}
              />
              <Line
                type="linear"
                dataKey="distance"
                stroke="var(--color-distance)"
                strokeWidth={2.5}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              {points.map((point) => (
                <ReferenceDot
                  key={point.minutes}
                  x={point.minutes}
                  y={point.distance}
                  r={5}
                  fill="#f59e0b"
                  stroke="var(--css-surface)"
                  strokeWidth={2}
                  label={{
                    value: `${Number(point.distance.toFixed(1))} ${unit} · ${formatPaceClock(point.minutes * 60)}`,
                    position: "top",
                    offset: point === points[0] ? 28 : 14,
                    fill: "var(--css-ink)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                />
              ))}
            </ComposedChart>
          </ChartContainer>
          <div className={styles.fitChartTimeAxis}>{t("time")}</div>
        </div>
        <div className={styles.fitChartExplanation}>
          <div>
            <h4>{t("difference")}</h4>
            <strong>
              {Number(deltaDistance.toFixed(1))} {unit} /{" "}
              {Number(deltaTime.toFixed(1))} s
            </strong>
            <span className={styles.fitChartSpeed}>
              = {(deltaDistance / deltaTime).toFixed(2)} {unit}/s
            </span>
            <p>{t("differenceBody")}</p>
          </div>
          <div>
            <h4>{t("pace")}</h4>
            <strong>
              {formatPaceClock(model.pacePer100UnitSec)} /100 {unit}
            </strong>
            <p>{t("paceBody")}</p>
          </div>
        </div>
      </div>
      <figcaption className={styles.fitChartNote}>{t("note")}</figcaption>
    </figure>
  );
}
