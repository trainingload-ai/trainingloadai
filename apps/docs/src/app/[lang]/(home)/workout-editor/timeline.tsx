import { formatClock, type PreviewSegment, type WorkoutStepType } from "./workout-model";
import styles from "./workout-editor.module.css";

export function WorkoutTimeline({
  segments,
  stepLabel,
  emptyLabel,
}: {
  segments: PreviewSegment[];
  stepLabel: (stepType: WorkoutStepType, repeatTimes?: number, intensity?: string) => string;
  emptyLabel: string;
}) {
  if (segments.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>;
  }
  return (
    <>
      <div className={styles.timeline} aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={`${segment.id}-${segment.repeatTimes ?? 1}`}
            className={styles.segment}
            data-type={segment.stepType}
            style={{
              flexGrow: Math.max(segment.seconds, 1),
              flexBasis: 0,
              height: `${segment.heightPercent}%`,
            }}
            title={`${segment.label}${segment.intensity ? ` · ${segment.intensity}` : ""} · ${formatClock(segment.seconds)}`}
          />
        ))}
      </div>
      <ol className={styles.legend}>
        {segments.map((segment) => (
          <li key={`legend-${segment.id}`}>
            <span className={styles.swatch} data-type={segment.stepType} />
            <span>
              {stepLabel(segment.stepType, segment.repeatTimes, segment.intensity)}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
