import { resolveSupportedLocale } from '@/utils/locale.util';
import type { ReviewReportAnalysis } from '@/api/ai/core/prompt-contracts/review-digest.contract';
import type { ReviewDigestType } from './review-types';
import {
  DAILY_RECOVERY_BASELINE_DAYS,
  type ReviewRecoveryRow,
} from './review-recovery';
import {
  reviewDateFromKey,
  reviewDateKey,
  reviewLocalDates,
  shiftReviewDate,
} from './review-date-window';

export type ReviewReportActivity = {
  id: number;
  hashId: string;
  title: string | null;
  sportType: string | null;
  date: string;
  durationSec: number | null;
  distanceM: number | null;
  load?: number | null;
};

type TrainingRow = {
  sessions: number;
  durationSec: number | null;
  durationSamples: number;
  distanceM: number | null;
  distanceSamples: number;
  activeDays: number;
  load: number | null;
  loadSamples: number;
};

export type ReviewReportTraining = {
  from: string;
  through: string;
  totals: TrainingRow;
  bySport: Array<TrainingRow & { sportType: string }>;
  byWeek: Array<
    TrainingRow & {
      from: string;
      through: string;
      runningDistanceM: number | null;
    }
  >;
  previousPeriod?: { sessions: number; durationSec: number | null };
};

type Translate = (
  key: string,
  args?: Record<string, string | number>,
) => string;

function summarizeTraining(activities: ReviewReportActivity[]): TrainingRow {
  const durations = activities.flatMap(({ durationSec }) => durationSec ?? []);
  const distances = activities.flatMap(({ distanceM }) => distanceM ?? []);
  const loads = activities.flatMap(({ load }) => load ?? []);
  return {
    sessions: activities.length,
    durationSec: durations.length
      ? durations.reduce((sum, value) => sum + value, 0)
      : null,
    durationSamples: durations.length,
    distanceM: distances.length
      ? distances.reduce((sum, value) => sum + value, 0)
      : null,
    distanceSamples: distances.length,
    activeDays: new Set(activities.map(({ date }) => date)).size,
    load: loads.length ? loads.reduce((sum, value) => sum + value, 0) : null,
    loadSamples: loads.length,
  };
}

export function buildReviewReportTraining(args: {
  type: ReviewDigestType;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
  activities: ReviewReportActivity[];
}): ReviewReportTraining {
  const dates = reviewLocalDates(
    args.periodStart,
    args.periodEnd,
    args.timezone,
  );
  const bySport = new Map<string, ReviewReportActivity[]>();
  for (const activity of args.activities) {
    const sport = activity.sportType ?? 'UNKNOWN';
    const group = bySport.get(sport) ?? [];
    group.push(activity);
    bySport.set(sport, group);
  }
  const byWeek: ReviewReportTraining['byWeek'] = [];
  if (args.type === 'MONTHLY') {
    for (let date = dates.from; date <= dates.through; ) {
      const weekday = (date.getUTCDay() + 6) % 7;
      const sunday = shiftReviewDate(date, 6 - weekday);
      const from = reviewDateKey(date);
      const through = reviewDateKey(
        sunday < dates.through ? sunday : dates.through,
      );
      const activities = args.activities.filter((activity) => {
        return activity.date >= from && activity.date <= through;
      });
      const runs = activities.filter(
        (activity) => activity.sportType === 'RUN',
      );
      byWeek.push({
        from,
        through,
        ...summarizeTraining(activities),
        runningDistanceM: runs.length ? summarizeTraining(runs).distanceM : 0,
      });
      date = shiftReviewDate(sunday, 1);
    }
  }
  return {
    from: reviewDateKey(dates.from),
    through: reviewDateKey(dates.through),
    totals: summarizeTraining(args.activities),
    bySport: [...bySport]
      .map(([sportType, activities]) => ({
        sportType,
        ...summarizeTraining(activities),
      }))
      .sort(
        (a, b) =>
          b.sessions - a.sessions || a.sportType.localeCompare(b.sportType),
      ),
    byWeek,
  };
}

function markdownText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_{}\[\]<>|~]/g, '\\$&');
}

type ComparisonPair = readonly [current: number, previous: number];

function table(
  headers: string[],
  rows: string[][],
  comparison?: {
    kind: 'training' | 'recovery';
    pairs: (ComparisonPair | null)[];
  },
) {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [
    ...(comparison?.pairs.some(Boolean)
      ? [`<!-- review-comparison:${comparison.kind}:${JSON.stringify(comparison.pairs)} -->`, '']
      : []),
    line(headers.map(markdownText)),
    line(headers.map((_, index) => (index === 0 ? '---' : '---:'))),
    ...rows.map(line),
  ];
}

export function renderReviewReport(args: {
  type: ReviewDigestType;
  lang: string;
  training: ReviewReportTraining;
  activities: ReviewReportActivity[];
  references: Array<{
    rank: number;
    activity: ReviewReportActivity;
    excerpt?: string;
  }>;
  recovery: ReviewRecoveryRow[];
  analysis?: ReviewReportAnalysis;
  translate: Translate;
  sportLabel: (sport: string) => string;
}) {
  const { analysis, training, type, recovery } = args;
  const lang = resolveSupportedLocale(args.lang);
  const t = args.translate;
  const report = (key: string) => t(`report.${key}`);
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(lang, {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  });
  const change = (pair: ComparisonPair | null) =>
    pair && pair[1] > 0 ? percent.format((pair[0] - pair[1]) / pair[1]) : '—';
  const duration = (seconds: number | null) => {
    if (seconds === null) return '—';
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours
      ? t('report.hoursMinutes', {
          hours: number.format(hours),
          minutes: number.format(rest),
        })
      : t('report.minutes', { minutes: number.format(rest) });
  };
  const distance = (meters: number | null) =>
    meters === null ? '—' : `${number.format(meters / 1000)} km`;
  const format = new Intl.DateTimeFormat(lang, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const reportDate = new Intl.DateTimeFormat(lang, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const dateRange = (from: string, through: string, formatter = format) => {
    const start = formatter.format(reviewDateFromKey(from));
    return from === through
      ? start
      : `${start} – ${formatter.format(reviewDateFromKey(through))}`;
  };
  const activityLabel = (activity: ReviewReportActivity) => {
    const sport = activity.sportType ?? 'UNKNOWN';
    const title = markdownText(
      activity.title?.trim().slice(0, 100) || args.sportLabel(sport),
    );
    return activity.hashId
      ? `[${title}](/${lang}/activities/${encodeURIComponent(activity.hashId)})`
      : title;
  };
  const day = type === 'DAILY';
  const month = type === 'MONTHLY';
  const week = type === 'WEEKLY';
  const showLoad = week && training.totals.loadSamples > 0;
  const runs = training.bySport.find((row) => row.sportType === 'RUN');
  const showRunningDistance = month && runs?.distanceM != null;
  const headers = day
    ? [report('activity'), report('duration'), report('distance')]
    : [
        report(month ? 'week' : 'sport'),
        report('sessions'),
        report('duration'),
        ...(week
          ? [
              report('distance'),
              report('activeDays'),
              report('averageSessionDuration'),
              ...(showLoad ? [report('trainingLoad')] : []),
            ]
          : showRunningDistance
            ? [report('runningDistance')]
            : []),
      ];
  const dailyRows = args.activities.slice(0, 12);
  const rows = day
    ? dailyRows.map((activity) => [
        activityLabel(activity),
        duration(activity.durationSec),
        distance(activity.distanceM),
      ])
    : month
      ? training.byWeek.map((row) => [
          dateRange(row.from, row.through),
          number.format(row.sessions),
          row.sessions ? duration(row.durationSec) : duration(0),
          ...(showRunningDistance ? [distance(row.runningDistanceM)] : []),
        ])
      : training.bySport.map((row) => [
          markdownText(args.sportLabel(row.sportType)),
          number.format(row.sessions),
          duration(row.durationSec),
          distance(row.distanceM),
          number.format(row.activeDays),
          duration(row.durationSec === null ? null : row.durationSec / row.durationSamples),
          ...(showLoad
            ? [
                row.load === null
                  ? '—'
                  : row.loadSamples < row.sessions
                    ? `${number.format(row.load)} (${number.format(row.loadSamples)}/${number.format(row.sessions)})`
                    : number.format(row.load),
              ]
            : []),
        ]);
  if (month && rows.length) {
    rows.push([
      markdownText(report('total')),
      number.format(training.totals.sessions),
      duration(training.totals.sessions ? training.totals.durationSec : 0),
      ...(showRunningDistance ? [distance(runs.distanceM)] : []),
    ]);
  }
  const lines = [
    ...(analysis?.headline
      ? [`**${markdownText(analysis.headline)}**`, '']
      : []),
    dateRange(training.from, training.through, reportDate),
    '',
    t('report.overview', {
      sessions: number.format(training.totals.sessions),
      duration: duration(
        training.totals.sessions ? training.totals.durationSec : 0,
      ),
    }),
    '',
    `## ${report(day ? 'dailyTraining' : month ? 'monthlyTraining' : 'weeklyTraining')}`,
    '',
    ...(rows.length ? table(headers, rows) : [report('noActivities')]),
  ];
  if (day && args.activities.length > dailyRows.length) {
    lines.push(
      '',
      t('report.moreActivities', {
        count: number.format(args.activities.length - dailyRows.length),
      }),
    );
  }
  if (
    training.totals.durationSamples < training.totals.sessions ||
    (!month && training.totals.distanceSamples < training.totals.sessions) ||
    (showRunningDistance && runs.distanceSamples < runs.sessions)
  ) {
    lines.push('', report('trainingCoverage'));
  }
  if (showLoad) {
    lines.push('', report('loadCoverage'));
  }
  const { previousPeriod, totals } = training;
  if (!day && previousPeriod && (totals.sessions || previousPeriod.sessions)) {
    const sessions: ComparisonPair = [totals.sessions, previousPeriod.sessions];
    const durations: ComparisonPair | null =
      totals.durationSamples === totals.sessions &&
      previousPeriod.durationSec !== null
        ? [totals.durationSec ?? 0, previousPeriod.durationSec]
        : null;
    lines.push(
      '',
      `## ${report('trainingComparison')}`,
      '',
      ...table(
        [report('metric'), report('currentPeriod'), report('previousPeriod'), report('periodChange')],
        [
          [report('sessions'), ...sessions.map((value) => number.format(value)), change(sessions)],
          ...(durations
            ? [[report('duration'), ...durations.map(duration), change(durations)]]
            : []),
        ],
        { kind: 'training', pairs: durations ? [sessions, durations] : [sessions] },
      ),
    );
  }
  if (recovery.length) {
    const recoveryComparisons = recovery.map((row): ComparisonPair | null =>
      !day && row.value !== null && row.baseline
        ? [row.value, row.baseline.value]
        : null,
    );
    const showRecoveryChanges = recoveryComparisons.some(Boolean);
    const recoveryValue = (row: ReviewRecoveryRow, value: number | null) => {
      if (value === null) return '—';
      if (row.metric === 'SLEEP_ASLEEP_SECONDS') return duration(value);
      const unit = row.metric === 'RESTING_HEART_RATE_BPM' ? 'bpm' : 'ms';
      return `${number.format(value)} ${unit}`;
    };
    const samples = (count: number, days: number) =>
      `${number.format(count)}/${number.format(days)}`;
    lines.push(
      '',
      `## ${report('recovery')}`,
      '',
      ...table(
        [
          report('metric'),
          report(day ? 'recorded' : 'currentPeriod'),
          day
            ? t('report.personalBaseline', {
                days: DAILY_RECOVERY_BASELINE_DAYS,
              })
            : report('previousPeriod'),
          ...(showRecoveryChanges ? [report('periodChange')] : []),
        ],
        recovery.map((row, index) => {
          const metric = report(row.metric);
          const label =
            row.statistic === 'observed'
              ? metric
              : t(`report.${row.statistic}`, { metric });
          const coverage = day ? '' : ` (${samples(row.samples, row.days)})`;
          return [
            markdownText(label),
            recoveryValue(row, row.value) + coverage,
            row.baseline
              ? `${recoveryValue(row, row.baseline.value)} (${samples(row.baseline.samples, row.baseline.days)})`
              : '—',
            ...(showRecoveryChanges ? [change(recoveryComparisons[index])] : []),
          ];
        }),
        { kind: 'recovery', pairs: recoveryComparisons },
      ),
      '',
      report('recoveryCoverage'),
    );
  }
  if (analysis) {
    const findings = [
      ['highlight', analysis.highlight],
      ['watch', analysis.watch],
      [
        'recoveryObservation',
        recovery.some((row) => row.value !== null)
          ? analysis.recovery
          : undefined,
      ],
      [day ? 'nextDay' : month ? 'nextMonth' : 'nextWeek', analysis.next],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]));
    if (findings.length) {
      lines.push(
        '',
        `## ${report('analysis')}`,
        '',
        ...findings.flatMap(
          ([key, value]) => [`### ${report(key)}`, '', markdownText(value), ''],
        ),
      );
    }
  }
  const references = analysis
    ? args.references.filter(({ rank }) => analysis.activityRefs.includes(rank))
    : day
      ? []
      : args.references.slice(0, 3);
  if (references.length) {
    lines.push(
      '',
      `## ${report(analysis ? 'sources' : 'keyActivities')}`,
      '',
      ...references.map(
        ({ activity, excerpt }) =>
          `- ${activityLabel(activity)} · ${dateRange(activity.date, activity.date)}${excerpt ? ` — ${markdownText(excerpt)}` : ''}`,
      ),
    );
  }
  return lines.join('\n');
}
