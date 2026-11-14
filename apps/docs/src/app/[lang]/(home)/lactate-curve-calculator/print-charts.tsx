import type {
  LactateAnalysis,
  LactateStage,
} from "@trainingloadai/shared/lactate-analysis";
import type { LactateCopy } from "@/lib/lactate-curve-copy";
import styles from "./lactate-curve.module.css";

const LEFT = 48;
const RIGHT = 708;
const BLUE = "#377da0";
const COLORS = ["#4e9a67", "#c98b32", "#d6645d"];

// Rounding display coordinates keeps SSR markup stable across JavaScript engines.
const coordinate = (value: number) => Number(value.toFixed(4));

function scaleFor(analysis: LactateAnalysis) {
  const stages = analysis.stages.filter((stage) => stage.intensity > 0);
  const low = stages[0]!.intensity;
  const high = stages.at(-1)!.intensity;
  return {
    stages,
    low,
    high,
    x: (value: number) =>
      coordinate(LEFT + ((value - low) / (high - low)) * (RIGHT - LEFT)),
    unit: analysis.sport === "cycling" ? "W" : "km/h",
  };
}

function pathFor(
  stages: LactateStage[],
  x: (value: number) => number,
  y: (value: number) => number,
) {
  let path = "";
  let gap = true;
  for (const stage of stages) {
    if (stage.heartRate == null) {
      gap = true;
      continue;
    }
    path +=
      (gap ? "M" : "L") + x(stage.intensity) + "," + y(stage.heartRate) + " ";
    gap = false;
  }
  return path;
}

/** Fixed view boxes avoid responsive-chart measurement races during browser printing. */
export function PrintLactateCurve({
  analysis,
  copy: c,
}: {
  analysis: LactateAnalysis;
  copy: LactateCopy;
}) {
  const { stages, low, high, x, unit } = scaleFor(analysis);
  const values = [...stages, ...analysis.curve].map((row) => row.lactate);
  const min = Math.min(0, Math.floor(Math.min(...values)));
  const max = Math.max(min + 1, Math.ceil(Math.max(...values) / 2) * 2);
  const y = (value: number) =>
    coordinate(242 - ((value - min) / (max - min)) * 210);
  const heart = stages.filter((stage) => stage.heartRate != null);
  const heartMin = heart.length
    ? Math.floor((Math.min(...heart.map((row) => row.heartRate!)) - 5) / 10) *
      10
    : 0;
  const heartMax = heart.length
    ? Math.ceil((Math.max(...heart.map((row) => row.heartRate!)) + 5) / 10) * 10
    : 1;
  const hy = (value: number) =>
    coordinate(390 - ((value - heartMin) / (heartMax - heartMin)) * 90);
  const height = heart.length ? 430 : 285;
  const thresholds = analysis.selectedPair
    ? [analysis.selectedPair.lt1Method, analysis.selectedPair.lt2Method].map(
        (id) => analysis.methods.find((method) => method.methodId === id)!,
      )
    : [];
  const bands = (top: number, bottom: number) =>
    analysis.zones.map((zone, i) => (
      <rect
        key={zone.zone}
        x={x(zone.from ?? low)}
        y={top}
        width={x(zone.to ?? high) - x(zone.from ?? low)}
        height={bottom - top}
        fill={COLORS[i]}
        fillOpacity={0.09}
      />
    ));
  return (
    <svg
      className={styles.printCurve}
      viewBox={"0 0 720 " + height}
      aria-hidden="true"
      fontFamily="sans-serif"
      fontSize={12}
      fill="#5c6258"
    >
      <text x="0" y="17">
        mmol/L
      </text>
      {bands(32, 242)}
      {Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4).map(
        (value) => (
          <g key={value}>
            <line
              x1={LEFT}
              x2={RIGHT}
              y1={y(value)}
              y2={y(value)}
              stroke="#cbd1c7"
              strokeWidth={0.7}
            />
            <text x={LEFT - 9} y={y(value) + 4} textAnchor="end">
              {Number(value.toFixed(2))}
            </text>
          </g>
        ),
      )}
      {analysis.curve.length ? (
        <polyline
          points={analysis.curve
            .map((row) => x(row.intensity) + "," + y(row.lactate))
            .join(" ")}
          stroke={BLUE}
          strokeWidth={2}
          fill="none"
        />
      ) : null}
      {stages.map((row) => (
        <circle
          key={row.intensity}
          cx={x(row.intensity)}
          cy={y(row.lactate)}
          r={3.4}
          fill="white"
          stroke={BLUE}
          strokeWidth={1.5}
        />
      ))}
      {thresholds.map((method, i) => (
        <g key={method.methodId}>
          <line
            x1={x(method.intensity!)}
            x2={x(method.intensity!)}
            y1="32"
            y2="242"
            stroke={COLORS[i]}
            strokeDasharray="4 3"
          />
          <text
            x={x(method.intensity!) + (i === 0 ? -4 : 4)}
            y={
              46 +
              (i === 1 &&
              x(method.intensity!) - x(thresholds[0]!.intensity!) < 40
                ? 15
                : 0)
            }
            textAnchor={i === 0 ? "end" : "start"}
            fill="#191b18"
          >
            LT{i + 1}
          </text>
        </g>
      ))}
      {Array.from({ length: 5 }, (_, i) => low + ((high - low) * i) / 4).map(
        (value) => (
          <text key={value} x={x(value)} y="262" textAnchor="middle">
            {value.toFixed(analysis.sport === "cycling" ? 0 : 1)}
          </text>
        ),
      )}
      <text x={RIGHT} y="281" textAnchor="end">
        {unit}
      </text>
      {heart.length ? (
        <>
          <text x="0" y="288">
            {c.heartRate} · bpm
          </text>
          {bands(300, 390)}
          {[heartMin, (heartMin + heartMax) / 2, heartMax].map((value) => (
            <g key={value}>
              <line
                x1={LEFT}
                x2={RIGHT}
                y1={hy(value)}
                y2={hy(value)}
                stroke="#cbd1c7"
                strokeWidth={0.7}
              />
              <text x={LEFT - 9} y={hy(value) + 4} textAnchor="end">
                {value.toFixed(0)}
              </text>
            </g>
          ))}
          <path
            d={pathFor(stages, x, hy)}
            fill="none"
            stroke="#191b18"
            strokeWidth={1.4}
          />
          {heart.map((row) => (
            <circle
              key={row.intensity}
              cx={x(row.intensity)}
              cy={hy(row.heartRate!)}
              r={2.6}
              fill="white"
              stroke="#191b18"
              strokeWidth={1.2}
            />
          ))}
          {thresholds.map((method, i) => (
            <line
              key={method.methodId}
              x1={x(method.intensity!)}
              x2={x(method.intensity!)}
              y1="300"
              y2="390"
              stroke={COLORS[i]}
              strokeDasharray="4 3"
            />
          ))}
          {Array.from(
            { length: 5 },
            (_, i) => low + ((high - low) * i) / 4,
          ).map((value) => (
            <text key={value} x={x(value)} y="410" textAnchor="middle">
              {value.toFixed(analysis.sport === "cycling" ? 0 : 1)}
            </text>
          ))}
          <text x={RIGHT} y="429" textAnchor="end">
            {unit}
          </text>
        </>
      ) : null}
    </svg>
  );
}

export function PrintLactateResiduals({
  analysis,
}: {
  analysis: LactateAnalysis;
}) {
  if (!analysis.fitQuality) return null;
  const { x, unit } = scaleFor(analysis);
  const rx = (value: number) =>
    LEFT + 12 + ((x(value) - LEFT) / (RIGHT - LEFT)) * (RIGHT - LEFT - 24);
  const rows = analysis.fitQuality.residuals;
  const max =
    Math.max(0.01, ...rows.map((row) => Math.abs(row.residual))) * 1.1;
  const y = (value: number) => 86 - (value / max) * 58;
  return (
    <svg
      className={styles.printCurve}
      viewBox="0 0 720 180"
      aria-hidden="true"
      fontFamily="sans-serif"
      fontSize={12}
      fill="#5c6258"
    >
      <text x="0" y="16">
        mmol/L
      </text>
      {[-max, -max / 2, 0, max / 2, max].map((value) => (
        <g key={value}>
          <line
            x1={LEFT}
            x2={RIGHT}
            y1={y(value)}
            y2={y(value)}
            stroke={value === 0 ? "#191b18" : "#cbd1c7"}
            strokeWidth={0.7}
          />
          <text x={LEFT - 9} y={y(value) + 4} textAnchor="end">
            {value.toFixed(3)}
          </text>
        </g>
      ))}
      {rows.map((row) => (
        <g key={row.intensity}>
          <rect
            x={rx(row.intensity) - 9}
            y={Math.min(y(0), y(row.residual))}
            width={18}
            height={Math.max(0.7, Math.abs(y(row.residual) - y(0)))}
            fill={BLUE}
          />
          <text x={rx(row.intensity)} y="162" textAnchor="middle">
            {row.intensity.toFixed(analysis.sport === "cycling" ? 0 : 1)}
          </text>
        </g>
      ))}
      <text x={RIGHT} y="179" textAnchor="end">
        {unit}
      </text>
    </svg>
  );
}
