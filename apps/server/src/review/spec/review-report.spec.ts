import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReviewDigestService } from '../review-digest.service';
import { ReviewModelCallGuard } from '../review-model-call-guard';
import { completedReviewWindow } from '../review-date-window';
import {
  reviewRecoveryWindow,
  summarizeReviewRecovery,
} from '../review-recovery';
import {
  buildReviewReportTraining,
  renderReviewReport,
  type ReviewReportActivity,
} from '../review-report';

const messages = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../../packages/messages/server/en/common.json',
    ),
    'utf8',
  ),
);
const translate = (key: string, args: Record<string, string | number> = {}) => {
  const [section, name] = key.split('.');
  return (messages.notification.reviewDigest[section]?.[name] ?? key).replace(
    /\{(\w+)\}/g,
    (_match: string, arg: string) => String(args[arg] ?? ''),
  );
};

const activity: ReviewReportActivity = {
  id: 1,
  hashId: 'hash123',
  title: 'Threshold | [intervals](https://invalid.example)',
  sportType: 'RUN',
  date: '2026-03-08',
  distanceM: 9200,
  durationSec: 3600,
};

const day = {
  type: 'DAILY' as const,
  periodStart: new Date('2026-03-08T05:00:00Z'),
  periodEnd: new Date('2026-03-09T04:00:00Z'),
  timezone: 'America/New_York',
};

const observation = (
  date: string,
  metric: string,
  value: number,
  provider = 'GARMIN',
) => ({
  key: `${date}:${metric}`,
  date,
  metric,
  provider,
  value,
  unit: null,
  readiness: { reportedValue: 'ELIGIBLE' as const },
});

describe('review report', () => {
  it('uses the last completed calendar month and local midnight on both sides of DST', () => {
    expect(
      completedReviewWindow(
        'MONTHLY',
        new Date('2026-03-17T14:00:00Z'),
        day.timezone,
      ),
    ).toEqual({
      periodStart: new Date('2026-02-01T05:00:00Z'),
      periodEnd: new Date('2026-03-01T05:00:00Z'),
    });
    expect(
      completedReviewWindow(
        'WEEKLY',
        new Date('2026-03-12T14:00:00Z'),
        day.timezone,
      ),
    ).toEqual({
      periodStart: new Date('2026-03-02T05:00:00Z'),
      periodEnd: new Date('2026-03-09T04:00:00Z'),
    });
  });

  it('uses local-day labels and keeps activity names inside the table cell', () => {
    const training = buildReviewReportTraining({
      ...day,
      activities: [activity],
    });
    const markdown = renderReviewReport({
      type: day.type,
      lang: 'en',
      training,
      activities: [activity],
      references: [{ rank: 1, activity }],
      recovery: [],
      analysis: {
        headline: 'Steady threshold work',
        highlight: 'Late intervals held pace',
        recovery: 'This cannot appear without measurements',
        activityRefs: [1, 99],
      },
      translate,
      sportLabel: (sport) => sport,
    });
    expect(training).toMatchObject({
      from: '2026-03-08',
      through: '2026-03-08',
    });
    expect(markdown.split('\n\n', 1)).toEqual([
      'For Mar 8, 2026, the recorded activity count was 1, with 1 h 0 min of training.',
    ]);
    expect(markdown).not.toContain('Steady threshold work');
    expect(markdown).toContain('Late intervals held pace');
    expect(markdown).toContain('## Daily activities');
    expect(markdown).toContain('Threshold \\| \\[intervals\\]');
    expect(markdown).toContain(
      '](/en/activities/hash123) | 1 h 0 min | 9.2 km |',
    );
    expect(markdown).toContain('## Activities referenced');
    expect(markdown).not.toContain('## Sleep and recovery');
    expect(markdown).not.toContain('This cannot appear without measurements');
  });

  it('renders previous-week context and approved activity-analysis excerpts', () => {
    const training = buildReviewReportTraining({
      ...day,
      type: 'WEEKLY',
      periodStart: new Date('2026-03-02T05:00:00Z'),
      activities: [activity],
    });
    training.previousPeriod = { sessions: 2, durationSec: 3000 };
    const markdown = renderReviewReport({
      type: 'WEEKLY',
      lang: 'en',
      training,
      activities: [activity],
      recovery: [],
      references: [
        {
          rank: 1,
          activity,
          excerpt: 'Final intervals stayed near target pace',
        },
        { rank: 2, activity, excerpt: 'An unreferenced activity analysis' },
      ],
      analysis: { headline: 'Steady threshold work', activityRefs: [1] },
      translate,
      sportLabel: (sport) => sport,
    });
    expect(markdown).toContain(
      `[review-comparison-training]: # '[["sessions",1,2],["duration",3600,3000]]'`,
    );
    expect(markdown).toContain('| Sessions | 1 | 2 | -50% |');
    expect(markdown).toContain('| Duration | 1 h 0 min | 50 min | +20% |');
    expect(markdown).toContain(
      '| RUN | 1 | 1 h 0 min | 9.2 km | 1 | 1 h 0 min |',
    );
    expect(markdown).not.toContain('| Training load |');
    expect(markdown).toContain('## Coach insights\n\nSteady threshold work');
    expect(markdown).toContain('Final intervals stayed near target pace');
    expect(markdown).not.toContain('An unreferenced activity analysis');
  });

  it('compares daily recovery with the personal baseline when coverage allows', () => {
    const training = buildReviewReportTraining({ ...day, activities: [] });
    const markdown = renderReviewReport({
      type: day.type,
      lang: 'en',
      training,
      activities: [],
      references: [],
      recovery: [
        {
          metric: 'SLEEP_ASLEEP_SECONDS',
          statistic: 'observed',
          value: 25200,
          samples: 1,
          days: 1,
          baseline: { value: 28800, samples: 18, days: 28 },
        },
        {
          metric: 'HRV_RMSSD_MS',
          statistic: 'observed',
          value: 52,
          samples: 1,
          days: 1,
          baseline: null,
        },
      ],
      translate,
      sportLabel: (sport) => sport,
    });
    expect(markdown).toContain(
      '| Previous 28 days · median | vs. baseline |',
    );
    expect(markdown).toContain(
      `[review-comparison-recovery]: # '[["SLEEP_ASLEEP_SECONDS",25200,28800],null]'`,
    );
    expect(markdown).toContain(
      '| Sleep duration | 7 h 0 min | 8 h 0 min (18/28) | -12.5% |',
    );
    expect(markdown).toContain('| HRV (RMSSD) | 52 ms | — | — |');
    expect(markdown).not.toContain('[review-comparison-training]');
  });

  it('keeps missing durations and incomparable recovery readings out of the chart', () => {
    const training = buildReviewReportTraining({
      ...day,
      type: 'MONTHLY',
      periodStart: new Date('2026-03-01T05:00:00Z'),
      periodEnd: new Date('2026-04-01T04:00:00Z'),
      activities: [{ ...activity, durationSec: null }],
    });
    training.previousPeriod = { sessions: 0, durationSec: 0 };
    const markdown = renderReviewReport({
      type: 'MONTHLY',
      lang: 'en',
      training,
      activities: [],
      references: [],
      recovery: [
        {
          metric: 'SLEEP_ASLEEP_SECONDS',
          statistic: 'mean',
          value: 25200,
          samples: 23,
          days: 31,
          baseline: { value: 28800, samples: 28, days: 28 },
        },
        {
          metric: 'HRV_RMSSD_MS',
          statistic: 'median',
          value: 52,
          samples: 5,
          days: 31,
          baseline: null,
        },
      ],
      translate,
      sportLabel: (sport) => sport,
    });
    expect(markdown).toContain(
      `[review-comparison-training]: # '[["sessions",1,0]]'`,
    );
    expect(markdown.split('\n\n', 1)).toEqual([
      'For Mar 1, 2026 – Mar 31, 2026, the recorded activity count was 1, with no training time recorded.',
    ]);
    expect(markdown).toContain('| Sessions | 1 | 0 | — |');
    expect(markdown).toContain(
      `[review-comparison-recovery]: # '[["SLEEP_ASLEEP_SECONDS",25200,28800],null]'`,
    );
    expect(markdown).toContain(
      '| Sleep duration · average | 7 h 0 min (23/31) | 8 h 0 min (28/28) | -12.5% |',
    );
    expect(markdown).toContain(
      '| HRV (RMSSD) · median | 52 ms (5/31) | — | — |',
    );
  });

  it('counts distinct training dates and shows load coverage in the weekly table', () => {
    const activities = [
      { ...activity, load: 42 },
      { ...activity, id: 2, durationSec: null },
    ];
    const training = buildReviewReportTraining({
      ...day,
      type: 'WEEKLY',
      periodStart: new Date('2026-03-02T05:00:00Z'),
      activities,
    });
    const markdown = renderReviewReport({
      type: 'WEEKLY',
      lang: 'en',
      training,
      activities,
      recovery: [],
      references: [],
      translate,
      sportLabel: (sport) => sport,
    });
    expect(markdown).toContain(
      '| Training days | Avg. session | Training load |',
    );
    expect(markdown).toContain(
      '| RUN | 2 | 1 h 0 min | 18.4 km | 1 | 1 h 0 min | 42 (1/2) |',
    );
  });

  it('fills the complete month with local week buckets including empty partial weeks', () => {
    const training = buildReviewReportTraining({
      type: 'MONTHLY',
      periodStart: new Date('2026-03-01T05:00:00Z'),
      periodEnd: new Date('2026-04-01T04:00:00Z'),
      timezone: day.timezone,
      activities: [
        activity,
        { ...activity, id: 2, date: '2026-03-31', durationSec: null },
      ],
    });
    expect(
      training.byWeek.map(({ from, through, sessions, durationSec }) => ({
        from,
        through,
        sessions,
        durationSec,
      })),
    ).toEqual([
      {
        from: '2026-03-01',
        through: '2026-03-01',
        sessions: 0,
        durationSec: null,
      },
      {
        from: '2026-03-02',
        through: '2026-03-08',
        sessions: 1,
        durationSec: 3600,
      },
      {
        from: '2026-03-09',
        through: '2026-03-15',
        sessions: 0,
        durationSec: null,
      },
      {
        from: '2026-03-16',
        through: '2026-03-22',
        sessions: 0,
        durationSec: null,
      },
      {
        from: '2026-03-23',
        through: '2026-03-29',
        sessions: 0,
        durationSec: null,
      },
      {
        from: '2026-03-30',
        through: '2026-03-31',
        sessions: 1,
        durationSec: null,
      },
    ]);
  });

  it('compares daily readings to the athlete’s prior days, keeping different HRV metrics apart', () => {
    const window = reviewRecoveryWindow(day);
    expect(window).toMatchObject({
      from: '2026-03-09',
      through: '2026-03-09',
      days: 1,
      baselineFrom: '2026-02-09',
      baselineDays: 28,
      queryDays: 29,
    });
    const hrv = Array.from({ length: 7 }, (_, i) =>
      observation(`2026-03-0${i + 1}`, 'HRV_RMSSD_MS', 50 + i),
    );
    const recovery = summarizeReviewRecovery('DAILY', window, [
      ...hrv,
      observation('2026-03-09', 'HRV_RMSSD_MS', 47),
      observation('2026-03-09', 'HRV_SDNN_MS', 61, 'APPLE_HEALTH'),
      observation('2026-03-10', 'HRV_RMSSD_MS', 500),
    ]);
    expect(recovery).toEqual([
      {
        metric: 'HRV_RMSSD_MS',
        statistic: 'observed',
        value: 47,
        samples: 1,
        days: 1,
        baseline: { value: 53, samples: 7, days: 28 },
      },
      {
        metric: 'HRV_SDNN_MS',
        statistic: 'observed',
        value: 61,
        samples: 1,
        days: 1,
        baseline: null,
      },
    ]);
  });

  it('reports sparse coverage and withholds comparisons across providers', () => {
    const window = reviewRecoveryWindow({
      ...day,
      type: 'WEEKLY',
      periodStart: new Date('2026-03-02T05:00:00Z'),
    });
    const recovery = summarizeReviewRecovery('WEEKLY', window, [
      observation('2026-03-02', 'SLEEP_ASLEEP_SECONDS', 21600),
      observation('2026-03-03', 'SLEEP_ASLEEP_SECONDS', 25200),
      observation('2026-02-28', 'SLEEP_ASLEEP_SECONDS', 25200, 'APPLE_HEALTH'),
      observation('2026-03-03', 'HRV_RMSSD_MS', 49),
      observation('2026-03-08', 'HRV_RMSSD_MS', 52, 'APPLE_HEALTH'),
    ]);
    expect(recovery).toEqual([
      {
        metric: 'SLEEP_ASLEEP_SECONDS',
        statistic: 'mean',
        value: 23400,
        samples: 2,
        days: 7,
        baseline: null,
      },
      {
        metric: 'HRV_RMSSD_MS',
        statistic: 'median',
        value: null,
        samples: 2,
        days: 7,
        baseline: null,
      },
    ]);
  });

  it.each([
    [54, 54],
    [null, null],
  ])('uses the canonical session load and retains unknown coverage (%s)', async (actualLoad, expected) => {
    const loadReadout = {
      batchGetActualLoad: jest.fn(async () => new Map([
        [1, { actualLoad, actualLoadSource: actualLoad == null ? null : 'SESSIONRPE' }],
      ])),
    };
    const service = new ReviewDigestService(
      {} as never,
      {} as never,
      {
        findMany: async () => [
          { id: 1, sportType: 'RUN', timerTime: 3240, trimp: null, govss: null },
          { id: 2, sportType: 'RUN', timerTime: 2400, trimp: null, govss: null },
        ],
      } as never,
      {} as never,
      new ReviewModelCallGuard(),
      loadReadout as never,
    );

    const result = await service.aggregateWindow({
      userId: 'user-1',
      periodStart: new Date('2026-11-15T16:00:00Z'),
      periodEnd: new Date('2026-11-22T16:00:00Z'),
    });

    expect(result.totals).toMatchObject({
      totalSessions: 2,
      totalLoad: expected,
      loadSamples: actualLoad == null ? 0 : 1,
    });
    expect(result.activities.map((activity) => activity.actualLoad)).toEqual([
      actualLoad, null,
    ]);
  });

  it('publishes and updates the notification with factual tables without AI', async () => {
    const update = jest.fn(async () => undefined);
    const updateBodyMarkdownByKey = jest.fn(async () => undefined);
    const updateBodyMarkdownByDigestId = jest.fn(async () => undefined);
    const getCoachingFacts = jest.fn(async () => ({
      observations: [observation('2026-03-09', 'SLEEP_ASLEEP_SECONDS', 23400)],
    }));
    const service = new ReviewDigestService(
      { updateBodyMarkdownByKey, updateBodyMarkdownByDigestId } as never,
      {
        t: (key: string, opts: { args?: Record<string, string | number> }) =>
          translate(
            key.replace('common.notification.reviewDigest.', ''),
            opts.args,
          ),
      } as never,
      {
        findMany: async () => [
          {
            id: 1,
            hashId: 'hash123',
            activityName: 'Morning run',
            sportType: 'RUN',
            startTime: new Date('2026-03-08T12:00:00Z'),
            timerTime: 3600,
            distance: 9200,
          },
        ],
      } as never,
      { digests: () => ({ update }) } as never,
      new ReviewModelCallGuard(),
      { batchGetActualLoad: jest.fn(async () => new Map()) } as never,
      undefined,
      undefined,
      undefined,
      { getCoachingFacts } as never,
    );
    jest.spyOn(service, 'writeSnapshotAndDetails').mockResolvedValue(undefined);
    await service.finalizeDigestContent({
      ...day,
      digestId: 'digest-1',
      userId: 'user-1',
      lang: 'en',
    });

    const expected = expect.stringContaining(
      '| Sleep duration | 6 h 30 min | — |',
    );
    expect(getCoachingFacts).toHaveBeenCalledWith(
      'user-1',
      '2026-03-09',
      expect.any(Date),
      29,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiSummaryMarkdown: expected,
          model: 'rule_based_v1',
        }),
      }),
    );
    expect(updateBodyMarkdownByKey).toHaveBeenCalledWith(
      expect.objectContaining({ bodyMarkdown: expected }),
    );
    expect(updateBodyMarkdownByDigestId).toHaveBeenCalledWith(
      'digest-1',
      expected,
    );
  });

  it('queries the previous calendar month at athlete-local midnight for a monthly chart', async () => {
    const findMany = jest
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ timerTime: null, elapsedTime: 1800 }]);
    const updateBody = jest.fn(async () => undefined);
    const service = new ReviewDigestService(
      {
        updateBodyMarkdownByKey: updateBody,
        updateBodyMarkdownByDigestId: updateBody,
      } as never,
      {
        t: (key: string, opts: { args?: Record<string, string | number> }) =>
          translate(
            key.replace('common.notification.reviewDigest.', ''),
            opts.args,
          ),
      } as never,
      { findMany } as never,
      { digests: () => ({ update: jest.fn() }) } as never,
      new ReviewModelCallGuard(),
      { batchGetActualLoad: jest.fn(async () => new Map()) } as never,
    );
    jest.spyOn(service, 'writeSnapshotAndDetails').mockResolvedValue(undefined);

    const markdown = await service.finalizeDigestContent({
      ...day,
      type: 'MONTHLY',
      periodStart: new Date('2026-04-01T04:00:00Z'),
      periodEnd: new Date('2026-05-01T04:00:00Z'),
      digestId: 'digest-1',
      userId: 'user-1',
      lang: 'en',
    });

    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              userId: 'user-1',
              startTime: {
                gte: new Date('2026-03-01T05:00:00Z'),
                lt: new Date('2026-04-01T04:00:00Z'),
              },
            },
          ]),
        }),
      }),
    );
    expect(markdown).toContain('| Duration | 0 min | 30 min | -100% |');
  });
});
