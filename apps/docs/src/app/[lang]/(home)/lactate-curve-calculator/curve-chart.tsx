"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  LactateAnalysis,
  LactateMethodId,
  LactateStage,
} from "@trainingloadai/shared/lactate-analysis";
import type { LactateCopy } from "@/lib/lactate-curve-copy";
import { PrintLactateCurve, PrintLactateResiduals } from "./print-charts";
import styles from "./lactate-curve.module.css";

const tick = { fontSize: 11, fill: "var(--muted-foreground)" };
const tooltipStyle = {
  background: "var(--card)",
  borderColor: "var(--border)",
  borderRadius: "var(--tl-radius-control)",
  color: "var(--foreground)",
  fontSize: 12,
};

type StageInspection = {
  stage: LactateStage;
  cx: number;
  cy: number;
  source: "lactate" | "heart";
  pinned: boolean;
};

function StagePoint({
  cx,
  cy,
  payload,
  analysis,
  copy: c,
  unit,
  tooltipId,
  source,
  onInspect,
  onDismiss,
}: {
  cx?: number;
  cy?: number;
  payload?: { intensity?: number };
  analysis: LactateAnalysis;
  copy: LactateCopy;
  unit: string;
  tooltipId: string;
  source: "lactate" | "heart";
  onInspect: (value: StageInspection) => void;
  onDismiss: () => void;
}) {
  const stage = analysis.stages.find(
    (row) => row.intensity === payload?.intensity,
  );
  if (
    !stage ||
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    !Number.isFinite(cx + cy)
  )
    return <g />;
  const index = analysis.stages.indexOf(stage) + 1;
  const inspect = (pinned: boolean) =>
    onInspect({ stage, cx, cy, source, pinned });
  return (
    <g className="recharts-scatter-symbol">
      <circle
        cx={cx}
        cy={cy}
        r={source === "heart" ? 3 : 4}
        fill="var(--card)"
        stroke={
          source === "heart" ? "var(--foreground)" : "var(--lactate-curve)"
        }
        strokeWidth={1.8}
        pointerEvents="none"
      />
      <foreignObject x={cx - 11} y={cy - 11} width={22} height={22}>
        <button
          type="button"
          className={styles.stageControl}
          data-stage-point
          data-testid="lactate-stage-point"
          data-series={source}
          aria-label={
            c.presentation.tooltipStage +
            " " +
            index +
            ": " +
            stage.intensity +
            " " +
            unit +
            ", " +
            stage.lactate +
            " mmol/L"
          }
          aria-describedby={tooltipId}
          onMouseEnter={() => inspect(false)}
          onFocus={(event) => {
            event.stopPropagation();
            inspect(true);
          }}
          onBlur={onDismiss}
          onClick={() => inspect(true)}
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              const controls = Array.from(
                event.currentTarget
                  .closest("figure")
                  ?.querySelectorAll<HTMLButtonElement>(
                    '[data-stage-point][data-series="' + source + '"]',
                  ) ?? [],
              );
              const current = controls.indexOf(event.currentTarget);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? controls.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          controls.length - 1,
                          current + (event.key === "ArrowRight" ? 1 : -1),
                        ),
                      );
              controls[next]?.focus();
            }
            if (event.key === "Escape") onDismiss();
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inspect(true);
            }
          }}
        />
      </foreignObject>
    </g>
  );
}

export function LactateCurveChart({
  analysis,
  methodId,
  copy: c,
  onRendered,
  construction = false,
}: {
  analysis: LactateAnalysis;
  methodId: LactateMethodId;
  copy: LactateCopy;
  onRendered?: () => void;
  construction?: boolean;
}) {
  const tooltipId = useId();
  const size = useRef({ width: 600, height: 330 });
  const heartHeight = useRef(135);
  const [hover, setHover] = useState<StageInspection | null>(null);
  const rendered = useRef(false);
  const figure = useRef<HTMLElement>(null);
  const frame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    if (!hover?.pinned) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !figure.current?.contains(event.target)
      )
        setHover(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [hover?.pinned]);
  function onResize(width: number, height: number) {
    if (width > 0 && height > 0) size.current = { width, height };
    if (rendered.current || width <= 0 || height <= 0) return;
    frame.current = requestAnimationFrame(() => {
      if (rendered.current || !figure.current?.querySelector("svg")) return;
      rendered.current = true;
      onRendered?.();
    });
  }
  const method = analysis.methods.find(
    (candidate) => candidate.methodId === methodId,
  )!;
  const exercise = useMemo(
    () => analysis.stages.filter((row) => row.intensity > 0),
    [analysis.stages],
  );
  const logView = construction && methodId === "log_log" && !!method?.logFit;
  const unit = analysis.sport === "cycling" ? "W" : "km/h";
  const low = exercise[0]!.intensity;
  const high = exercise.at(-1)!.intensity;
  const raw = exercise;
  const logLines = logView
    ? method.logFit!.map((fit, i) => {
        const from = i === 0 ? low : method.intensity!;
        const to = i === 0 ? method.intensity! : high;
        return Array.from({ length: 25 }, (_, step) => {
          const intensity = Math.exp(
            Math.log(from) + ((Math.log(to) - Math.log(from)) * step) / 24,
          );
          return {
            intensity,
            lactate: Math.exp(fit.intercept + fit.slope * Math.log(intensity)),
          };
        });
      })
    : [];
  const thresholds = analysis.selectedPair
    ? [analysis.selectedPair.lt1Method, analysis.selectedPair.lt2Method].map(
        (id) => analysis.methods.find((item) => item.methodId === id)!,
      )
    : [];
  const bands = () =>
    !construction && !logView
      ? analysis.zones.map((zone) => (
          <ReferenceArea
            key={zone.zone}
            x1={zone.from ?? low}
            x2={zone.to ?? high}
            fill={"var(--lactate-zone-" + zone.zone + ")"}
            fillOpacity={0.09}
            strokeOpacity={0}
          />
        ))
      : null;
  const anchors = construction ? method?.anchors : undefined;
  let distance: { intensity: number; lactate: number }[] = [];
  if (
    anchors?.length === 2 &&
    method.intensity != null &&
    method.lactate != null
  ) {
    const a = anchors[0]!;
    const b = anchors[1]!;
    const slope = (b.lactate - a.lactate) / (b.intensity - a.intensity);
    const intercept = a.lactate - slope * a.intensity;
    const foot =
      (method.intensity + slope * (method.lactate - intercept)) /
      (1 + slope ** 2);
    distance = [
      { intensity: method.intensity, lactate: method.lactate },
      { intensity: foot, lactate: slope * foot + intercept },
    ];
  }
  const heartRate = exercise.map((row) => ({
    ...row,
    heartRate: row.heartRate ?? null,
  }));
  const hasHeartRate = heartRate.some((row) => row.heartRate != null);
  const fixed = methodId.startsWith("obla") || methodId.startsWith("bsln");
  function inspectPointer(
    event: ReactPointerEvent<HTMLDivElement>,
    source: "lactate" | "heart",
  ) {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    if (cx < 46 || cx > rect.width - 18 || cy < 20 || cy > rect.height - 28)
      return;
    const ratio = (cx - 46) / (rect.width - 64);
    const value = logView
      ? Math.exp(Math.log(low) + ratio * (Math.log(high) - Math.log(low)))
      : low + ratio * (high - low);
    const stage = exercise.reduce((a, b) =>
      Math.abs(b.intensity - value) < Math.abs(a.intensity - value) ? b : a,
    );
    setHover((previous) =>
      previous?.pinned ||
      (previous?.stage === stage && previous.source === source)
        ? previous
        : { stage, cx, cy, source, pinned: false },
    );
  }
  const fitRow = hover
    ? analysis.fitQuality?.residuals.find(
        (row) => row.intensity === hover.stage.intensity,
      )
    : undefined;
  const logModel =
    hover && logView
      ? method.logFit![hover.stage.intensity <= method.intensity! ? 0 : 1]
      : undefined;
  const fitted =
    hover && logModel
      ? Math.exp(
          logModel.intercept + logModel.slope * Math.log(hover.stage.intensity),
        )
      : fitRow?.fitted;
  const residual =
    hover && fitted != null ? hover.stage.lactate - fitted : null;
  const zone = hover
    ? analysis.zones.find(
        (value) =>
          (value.from == null || hover.stage.intensity >= value.from) &&
          (value.to == null || hover.stage.intensity < value.to),
      )
    : undefined;
  const tooltipX = hover
    ? Math.max(
        8,
        Math.min(
          size.current.width - 226,
          hover.cx > size.current.width / 2 ? hover.cx - 220 : hover.cx + 16,
        ),
      )
    : 0;
  const tooltipY = hover
    ? Math.max(
        8,
        (hover.source === "heart" ? size.current.height + 12 : 0) +
          hover.cy -
          110,
      )
    : 0;
  const crosshairX = hover
    ? 46 +
      (logView
        ? Math.log(hover.stage.intensity / low) / Math.log(high / low)
        : (hover.stage.intensity - low) / (high - low)) *
        (size.current.width - 64)
    : 0;
  // Preserve chart nodes while the inspection overlay changes keyboard focus.
  const plot = useMemo(
    () => (
      <>
        <div
          className={styles.chart}
          onPointerMove={(event) => inspectPointer(event, "lactate")}
        >
          <span className={styles.chartUnit}>mmol/L</span>
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 600, height: 330 }}
            onResize={onResize}
          >
            <ComposedChart
              data={raw}
              margin={{ top: 26, right: 18, bottom: 20, left: 4 }}
              accessibilityLayer={false}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="intensity"
                type="number"
                scale={logView ? "log" : "auto"}
                domain={[low, high]}
                allowDuplicatedCategory={false}
                tick={tick}
                label={{
                  value: unit,
                  position: "insideBottomRight",
                  offset: -12,
                }}
              />
              <YAxis
                dataKey="lactate"
                type="number"
                scale={logView ? "log" : "auto"}
                domain={logView ? ["auto", "auto"] : [0, "auto"]}
                width={42}
                tick={tick}
              />
              {bands()}
              {!logView ? (
                <Line
                  data={analysis.curve}
                  dataKey="lactate"
                  name={c.presentation.fitted}
                  type="linear"
                  stroke="var(--lactate-curve)"
                  dot={false}
                  strokeWidth={2.3}
                  isAnimationActive={false}
                />
              ) : (
                logLines.map((data, i) => (
                  <Line
                    key={i}
                    data={data}
                    dataKey="lactate"
                    name={"Log-log " + (i + 1)}
                    type="linear"
                    stroke={
                      i === 0 ? "var(--lactate-curve)" : "var(--lactate-zone-2)"
                    }
                    dot={false}
                    strokeWidth={2.3}
                    isAnimationActive={false}
                  />
                ))
              )}
              {anchors ? (
                <Line
                  data={anchors}
                  dataKey="lactate"
                  name={c.presentation.anchor}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                />
              ) : null}
              {distance.length ? (
                <Line
                  data={distance}
                  dataKey="lactate"
                  name={c.presentation.distance}
                  stroke="var(--lactate-zone-2)"
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              ) : null}
              <Scatter
                data={raw}
                dataKey="lactate"
                name={c.presentation.samples}
                fill="var(--card)"
                stroke="var(--lactate-curve)"
                strokeWidth={2}
                shape={
                  <StagePoint
                    analysis={analysis}
                    copy={c}
                    unit={unit}
                    tooltipId={tooltipId}
                    source="lactate"
                    onInspect={setHover}
                    onDismiss={() => setHover(null)}
                  />
                }
                isAnimationActive={false}
              />
              {construction && fixed && method?.lactate != null ? (
                <ReferenceLine
                  y={method.lactate}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="3 4"
                  label={{
                    value: method.lactate.toFixed(1) + " mmol/L",
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
              ) : null}
              {!construction && !logView
                ? thresholds.map((threshold, i) => (
                    <ReferenceLine
                      key={threshold.methodId}
                      x={threshold.intensity!}
                      stroke={"var(--lactate-zone-" + (i + 1) + ")"}
                      strokeDasharray="4 3"
                      label={{
                        value: "LT" + (i + 1),
                        position: i === 0 ? "insideTopLeft" : "insideTopRight",
                        fontSize: 11,
                        fill: "var(--foreground)",
                      }}
                    />
                  ))
                : null}
              {construction && method?.intensity != null ? (
                <ReferenceLine
                  x={method.intensity}
                  stroke="var(--foreground)"
                  strokeDasharray="2 4"
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {logView ? (
          <p className={styles.caption}>{c.presentation.logAxes}</p>
        ) : null}
        {hasHeartRate && !logView && !construction ? (
          <div
            className={styles.heartChart}
            aria-label={c.heartRate}
            onPointerMove={(event) => inspectPointer(event, "heart")}
          >
            <span className={styles.chartUnit}>{c.heartRate} · bpm</span>
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={{ width: 600, height: 135 }}
              onResize={(_width, height) => {
                if (height > 0) heartHeight.current = height;
              }}
            >
              <ComposedChart
                data={heartRate}
                margin={{ top: 20, right: 18, bottom: 16, left: 4 }}
                accessibilityLayer={false}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="intensity"
                  type="number"
                  domain={[low, high]}
                  tick={tick}
                  label={{
                    value: unit,
                    position: "insideBottomRight",
                    offset: -10,
                  }}
                />
                <YAxis width={42} tick={tick} domain={["auto", "auto"]} />
                {bands()}
                <Line
                  dataKey="heartRate"
                  name={c.heartRate}
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  dot={
                    <StagePoint
                      analysis={analysis}
                      copy={c}
                      unit={unit}
                      tooltipId={tooltipId}
                      source="heart"
                      onInspect={setHover}
                      onDismiss={() => setHover(null)}
                    />
                  }
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {thresholds.map((threshold, i) => (
                  <ReferenceLine
                    key={threshold.methodId}
                    x={threshold.intensity!}
                    stroke={"var(--lactate-zone-" + (i + 1) + ")"}
                    strokeDasharray="4 3"
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </>
    ),
    [analysis, methodId, c, construction, onRendered, tooltipId],
  );
  return (
    <figure
      ref={figure}
      className={styles.curveFigure}
      onMouseLeave={() =>
        setHover((previous) => (previous?.pinned ? previous : null))
      }
      aria-label={
        c.presentation.curve +
        (construction ? ": " + c.methodNames[methodId] : "")
      }
    >
      <div className={styles.screenPlot}>{plot}</div>
      {!construction ? (
        <PrintLactateCurve analysis={analysis} copy={c} />
      ) : null}
      {hover ? (
        <>
          <div
            className={styles.chartCrosshair}
            style={{
              left: crosshairX,
              top: 26,
              height: size.current.height - 76,
            }}
            aria-hidden="true"
          />
          {hasHeartRate && !construction && !logView ? (
            <div
              className={styles.chartCrosshair}
              style={{
                left: crosshairX,
                top: size.current.height + 32,
                height: heartHeight.current - 66,
              }}
              aria-hidden="true"
            />
          ) : null}
        </>
      ) : null}
      {hover ? (
        <div
          id={tooltipId}
          role="tooltip"
          className={styles.chartTooltip}
          style={{ left: tooltipX, top: tooltipY }}
        >
          <div className={styles.tooltipHeading}>
            <span>
              {c.presentation.tooltipStage}{" "}
              {analysis.stages.indexOf(hover.stage) + 1}
            </span>
            <strong>
              {hover.stage.intensity.toFixed(
                analysis.sport === "cycling" ? 0 : 1,
              )}{" "}
              {unit}
            </strong>
          </div>
          <dl>
            <div>
              <dt>{c.presentation.tooltipMeasured}</dt>
              <dd>
                {hover.stage.lactate.toFixed(2)} <span>mmol/L</span>
              </dd>
            </div>
            <div>
              <dt>{c.presentation.tooltipFitted}</dt>
              <dd>
                {fitted?.toFixed(2) ?? "—"} <span>mmol/L</span>
              </dd>
            </div>
            <div>
              <dt>{c.heartRate}</dt>
              <dd>
                {hover.stage.heartRate?.toFixed(0) ?? "—"} <span>bpm</span>
              </dd>
            </div>
            <div>
              <dt>{c.presentation.tooltipResidual}</dt>
              <dd>
                {residual == null
                  ? "—"
                  : (Math.abs(residual) < 0.0005 ? 0 : residual).toFixed(
                      3,
                    )}{" "}
                <span>mmol/L</span>
              </dd>
            </div>
          </dl>
          {zone ? (
            <p className={styles.tooltipZone}>
              Z{zone.zone} · {c.zoneNames[zone.zone - 1]}
            </p>
          ) : null}
        </div>
      ) : null}
      <figcaption className={styles.legend}>
        <span>
          <i className={styles.dot} />
          {c.presentation.samples}
        </span>
        <span>
          <i className={styles.line} />
          {logView ? "Log-log" : c.presentation.fitted}
        </span>
        {anchors ? (
          <span>
            <i className={styles.anchorLine} />
            {c.presentation.anchor}
          </span>
        ) : null}
      </figcaption>
      <p className={styles.chartHint}>{c.presentation.hoverHint}</p>
    </figure>
  );
}

export function LactateResidualChart({
  analysis,
  copy: c,
}: {
  analysis: LactateAnalysis;
  copy: LactateCopy;
}) {
  if (!analysis.fitQuality) return null;
  const unit = analysis.sport === "cycling" ? "W" : "km/h";
  return (
    <div
      className={styles.residualChart}
      role="img"
      aria-label={c.presentation.residuals}
    >
      <span className={styles.chartUnit}>mmol/L</span>
      <div className={styles.screenPlot}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 600, height: 180 }}
        >
          <BarChart
            data={analysis.fitQuality.residuals}
            margin={{ top: 22, right: 18, bottom: 14, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="intensity"
              tick={tick}
              label={{
                value: unit,
                position: "insideBottomRight",
                offset: -10,
              }}
            />
            <YAxis width={42} tick={tick} />
            <ReferenceLine y={0} stroke="var(--foreground)" />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [
                typeof value === "number" ? value.toFixed(3) : value,
                c.presentation.residuals,
              ]}
            />
            <Bar
              dataKey="residual"
              fill="var(--lactate-curve)"
              maxBarSize={25}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <PrintLactateResiduals analysis={analysis} />
    </div>
  );
}
