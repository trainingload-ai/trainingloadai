import { Fragment, type CSSProperties, type ReactNode } from "react";
import type {
  LactateAnalysis,
  LactateMethodId,
  LactatePair,
} from "@trainingloadai/shared/lactate-analysis";
import type { LactateCopy } from "@/lib/lactate-curve-copy";
import { Button } from "@/components/ui/button";
import styles from "./lactate-curve.module.css";

const pace = (value: number) => {
  const seconds = Math.round(3600 / value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
const number = (value: number | null | undefined, running = false) =>
  value == null ? "—" : value.toFixed(running ? 1 : 0);

export function LactateSummary({
  analysis,
  copy: c,
  pair,
}: {
  analysis: LactateAnalysis;
  copy: LactateCopy;
  pair: LactatePair;
}) {
  const running = analysis.sport === "running";
  const unit = running ? "km/h" : "W";
  const last = analysis.stages.at(-1)!;
  return (
    <div className={styles.summaryGrid}>
      {(["lt1Method", "lt2Method"] as const).map((key, i) => {
        const method = analysis.methods.find(
          (result) => result.methodId === pair[key],
        );
        return (
          <div
            key={key}
            className={styles.summaryMetric}
            data-threshold={i + 1}
          >
            <p className={styles.label}>{i === 0 ? c.lt1 : c.lt2}</p>
            <p className={styles.metric}>
              {number(method?.intensity, running)} <span>{unit}</span>
            </p>
            <p className={styles.methodLabel}>{c.methodNames[pair[key]]}</p>
            <p className={styles.metricDetail}>
              {number(method?.lactate, true)} mmol/L ·{" "}
              {number(method?.heartRate)} bpm
            </p>
            {running && method?.intensity ? (
              <p className={styles.metricDetail}>
                {pace(method.intensity)} min/km
              </p>
            ) : null}
          </div>
        );
      })}
      <div className={styles.summaryMetric}>
        <p className={styles.label}>{c.presentation.peak}</p>
        <p className={styles.metric}>
          {number(last.intensity, running)} <span>{unit}</span>
        </p>
        <p className={styles.methodLabel}>
          {analysis.stages.filter((row) => row.intensity > 0).length}{" "}
          {c.presentation.stages}
        </p>
        <p className={styles.metricDetail}>
          {last.lactate.toFixed(1)} mmol/L · {number(last.heartRate)} bpm
        </p>
        {running ? (
          <p className={styles.metricDetail}>{pace(last.intensity)} min/km</p>
        ) : null}
      </div>
    </div>
  );
}

export function LactateMethodComparison({
  analysis,
  copy: c,
  selected,
  onSelect,
}: {
  analysis: LactateAnalysis;
  copy: LactateCopy;
  selected: LactateMethodId;
  onSelect: (id: LactateMethodId) => void;
}) {
  const stages = analysis.stages.filter((row) => row.intensity > 0);
  const low = stages[0]!.intensity;
  const high = stages.at(-1)!.intensity;
  const running = analysis.sport === "running";
  const position = (value: number) =>
    `${Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100))}%`;
  const groups: { label: string; methods: LactateMethodId[] }[] = [
    {
      label: c.presentation.earlyGroup,
      methods: ["bsln_05", "bsln_10", "log_log"],
    },
    {
      label: c.presentation.dmaxGroup,
      methods: ["dmax", "moddmax", "log_poly_moddmax"],
    },
    { label: c.presentation.fixedGroup, methods: ["obla_2", "obla_4"] },
  ];
  return (
    <section
      className={styles.reportSection}
      aria-labelledby="lactate-method-comparison"
    >
      <div className={styles.sectionHeading}>
        <h3 id="lactate-method-comparison" className={styles.subTitle}>
          {c.presentation.compareTitle}
        </h3>
        <span className={styles.muted}>
          {
            analysis.methods.filter((method) => method.status === "available")
              .length
          }
          /8 {c.presentation.available}
        </span>
      </div>
      <p className={styles.muted}>{c.presentation.compareBody}</p>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.comparisonTable}`}>
          <thead>
            <tr>
              <th scope="col">{c.method}</th>
              <th scope="col">
                <span className="sr-only">{c.presentation.sharedScale}</span>
                <div className={styles.axisLabels}>
                  <span>{number(low, running)}</span>
                  <span>{number((low + high) / 2, running)}</span>
                  <span>
                    {number(high, running)} {running ? "km/h" : "W"}
                  </span>
                </div>
              </th>
              <th scope="col">{c.intensity}</th>
              <th scope="col">mmol/L</th>
              <th scope="col">bpm</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.label}>
                <tr className={styles.methodGroup}>
                  <th scope="rowgroup" colSpan={5}>
                    {group.label}
                  </th>
                </tr>
                {group.methods.map((id) => {
                  const method = analysis.methods.find(
                    (value) => value.methodId === id,
                  )!;
                  const threshold =
                    analysis.selectedPair?.lt1Method === id
                      ? 1
                      : analysis.selectedPair?.lt2Method === id
                        ? 2
                        : undefined;
                  return (
                    <tr key={id} data-selected={selected === id}>
                      <th scope="row" className={styles.methodCell}>
                        <button
                          type="button"
                          aria-pressed={selected === id}
                          onClick={() => onSelect(id)}
                          className={styles.methodButton}
                        >
                          {c.methodNames[id]}
                          {threshold ? (
                            <span data-threshold={threshold}>
                              LT{threshold}
                            </span>
                          ) : null}
                        </button>
                        {method.reasonCodes.map((reason) => (
                          <small key={reason}>{c.reasons[reason]}</small>
                        ))}
                      </th>
                      <td>
                        <div className={styles.methodTrack} aria-hidden="true">
                          {analysis.selectedPair
                            ? [
                                analysis.selectedPair.lt1Method,
                                analysis.selectedPair.lt2Method,
                              ].map((id, i) => {
                                const x = analysis.methods.find(
                                  (item) => item.methodId === id,
                                )?.intensity;
                                return x != null ? (
                                  <i
                                    key={id}
                                    className={styles.trackBoundary}
                                    style={{ left: position(x) }}
                                    data-threshold={i + 1}
                                  />
                                ) : null;
                              })
                            : null}
                          {method.intensity != null ? (
                            <i
                              className={styles.methodMarker}
                              data-threshold={threshold}
                              style={{ left: position(method.intensity) }}
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className={styles.numeric}>
                        {number(method.intensity, running)}
                      </td>
                      <td className={styles.numeric}>
                        {number(method.lactate, true)}
                      </td>
                      <td className={styles.numeric}>
                        {number(method.heartRate)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.caption}>{c.presentation.notInterval}</p>
    </section>
  );
}

export function LactateZones({
  analysis,
  copy: c,
  children,
}: {
  analysis: LactateAnalysis;
  copy: LactateCopy;
  children?: ReactNode;
}) {
  const unit = analysis.sport === "cycling" ? "W" : "km/h";
  const running = analysis.sport === "running";
  const thresholds = analysis.selectedPair
    ? [analysis.selectedPair.lt1Method, analysis.selectedPair.lt2Method].map(
        (id) => analysis.methods.find((method) => method.methodId === id)!,
      )
    : [];
  return (
    <section className={styles.reportSection}>
      <h3 className={styles.subTitle}>{c.zones}</h3>
      <p className={styles.muted}>{c.presentation.zonesBody}</p>
      {children}
      {analysis.zones.length ? (
        <div className={styles.zoneGrid}>
          {analysis.zones.map((zone, i) => (
            <div
              key={zone.zone}
              className={styles.zoneCard}
              style={
                {
                  "--zone-color": `var(--lactate-zone-${zone.zone})`,
                } as CSSProperties
              }
            >
              <p className={styles.zoneNumber}>
                Z{zone.zone} <span>{c.zoneNames[i]}</span>
              </p>
              <p className={styles.zoneRange}>
                {zone.from == null ? "< " : `${number(zone.from, running)} – `}
                {zone.to == null ? "∞" : number(zone.to, running)}{" "}
                <span>{unit}</span>
              </p>
              <p className={styles.caption}>
                {i === 0
                  ? `< ${number(thresholds[0]?.heartRate)} bpm`
                  : i === 1
                    ? `${number(thresholds[0]?.heartRate)} – ${number(thresholds[1]?.heartRate)} bpm`
                    : `> ${number(thresholds[1]?.heartRate)} bpm`}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.notice}>{c.reasons.invalid_pair}</p>
      )}
    </section>
  );
}

export function LactateEmptyPreview({
  copy: c,
  onExample,
  disabled,
  children,
}: {
  copy: LactateCopy;
  onExample: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.preview}>
      <p className={styles.caption}>{c.presentation.previewCaption}</p>
      {children}
      <div className={styles.previewAction}>
        <p className={styles.muted}>{c.presentation.previewBody}</p>
        <Button variant="outline" onClick={onExample} disabled={disabled}>
          {c.example} →
        </Button>
      </div>
    </div>
  );
}
