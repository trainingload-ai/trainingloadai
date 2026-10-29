import { describe, expect, it, jest } from '@jest/globals';
import { ReviewDigestService } from '../review-digest.service';
import {
  ReviewModelCallGuard,
  ReviewModelDeferredError,
} from '../review-model-call-guard';

jest.mock('@/api/ai/core/coach-upstream.adapter', () => ({
  coachReviewRequestOptions: jest.requireActual<
    typeof import('@/api/ai/core/coach-upstream.adapter')
  >('@/api/ai/core/coach-upstream.adapter').coachReviewRequestOptions,
  getCoachBaseUrlForLog: jest.fn(() => ''),
  getCoachModel: jest.fn(() => 'model'),
  getCoachUpstreamProvider: jest.fn(() => 'openrouter'),
}));

function interpolate(template: string, args?: Record<string, unknown>) {
  if (!args) return template;
  return Object.entries(args).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template,
  );
}

function createService() {
  const i18n = {
    t: jest.fn(
      (
        key: string,
        opts?: { lang?: string; args?: Record<string, unknown> },
      ) => {
        const templates: Record<string, string> = {
          'common.notification.reviewDigest.fallbackOverviewDaily':
            '## Daily overview',
          'common.notification.reviewDigest.fallbackOverviewWeekly':
            '## Weekly overview',
          'common.notification.reviewDigest.fallbackOverviewMonthly':
            '## Monthly overview',
          'common.notification.reviewDigest.fallbackSessions':
            '- Sessions: {count}',
          'common.notification.reviewDigest.fallbackDurationHours':
            '- Duration: {hours} h',
          'common.notification.reviewDigest.fallbackDistanceKm':
            '- Distance: {km} km',
          'common.notification.reviewDigest.fallbackLoad':
            '- Combined load: {load}',
          'common.notification.reviewDigest.fallbackTss': '- TSS: {tss}',
          'common.notification.reviewDigest.fallbackHighlightsHeading':
            '## Highlights',
          'common.notification.reviewDigest.fallbackHighlightDuration':
            '{minutes}min',
          'common.notification.reviewDigest.fallbackHighlightDistance':
            '{km}km',
          'common.notification.reviewDigest.fallbackHighlightTss': 'TSS {tss}',
          'common.notification.reviewDigest.fallbackHighlightItem':
            '- #{rank} {summary}',
          'common.aiCoach.mutation.userFitnessMetric.sports.RUN': 'run',
        };
        return interpolate(templates[key] ?? key, opts?.args);
      },
    ),
  };
  const service = new ReviewDigestService(
    {} as never,
    i18n as never,
    {} as never,
    {} as never,
    new ReviewModelCallGuard(),
  );
  return { service, i18n };
}

function createAiService(args?: {
  usageFailure?: Error;
  guard?: ReviewModelCallGuard;
  create?: ReturnType<typeof jest.fn>;
}) {
  const recordUsageEvent = args?.usageFailure
    ? jest.fn(async () => Promise.reject(args.usageFailure))
    : jest.fn(async () => undefined);
  const create =
    args?.create ??
    jest.fn(async () => ({
      result: { markdown: '## AI review' },
      usage: {
        inputTokens: 900,
        outputTokens: 100,
        cachedInputTokens: 300,
        reported: true,
      },
      provider: 'openrouter',
      model: 'model',
    }));
  const service = new ReviewDigestService(
    {} as never,
    { t: jest.fn((key: string) => key) } as never,
    {} as never,
    {} as never,
    args?.guard ?? new ReviewModelCallGuard(),
    undefined,
    { isGranted: jest.fn(async () => true) } as never,
    { recordUsageEvent } as never,
    { runBackgroundCoachTask: create } as never,
  );
  return { service, recordUsageEvent, create };
}

const totals = {
  totalSessions: 2,
  totalDurationSec: 3600,
  totalDistanceM: 10000,
  totalTss: 48,
  totalLoad: 80,
};

describe('ReviewDigestService.buildMarkdownSummary', () => {
  it('renders fallback copy through i18n instead of zh/en string branches', async () => {
    const { service, i18n } = createService();
    const markdown = await service.buildMarkdownSummary({
      type: 'DAILY',
      lang: 'ja',
      totals,
      highlights: [
        {
          rank: 1,
          sportType: 'RUN',
          durationSec: 1800,
          distanceM: 5000,
          tss: 32,
          title: null,
          startTime: null,
        },
      ],
    });

    expect(markdown).toBe(
      [
        '## Daily overview',
        '- Sessions: 2',
        '- Duration: 1 h',
        '- Distance: 10 km',
        '- Combined load: 80',
        '',
        '## Highlights',
        '- #1 run · 30min · 5km · TSS 32',
      ].join('\n'),
    );
    expect(i18n.t).toHaveBeenCalledWith(
      'common.notification.reviewDigest.fallbackOverviewDaily',
      expect.objectContaining({ lang: 'ja' }),
    );
    expect(i18n.t).toHaveBeenCalledWith(
      'common.aiCoach.mutation.userFitnessMetric.sports.RUN',
      { lang: 'ja' },
    );
  });

  it('uses TSS when combined load is missing', async () => {
    const { service } = createService();
    const markdown = await service.buildMarkdownSummary({
      type: 'WEEKLY',
      lang: 'de',
      totals: { ...totals, totalLoad: 0 },
      highlights: [],
    });

    expect(markdown).toContain('## Weekly overview');
    expect(markdown).toContain('- TSS: 48');
    expect(markdown).not.toContain('Combined load');
  });
});

describe('ReviewDigestService AI usage accounting', () => {
  const request = {
    userId: 'user-1',
    type: 'WEEKLY' as const,
    lang: 'en',
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-08T00:00:00.000Z'),
    timezone: 'UTC',
    totals: {
      ...totals,
      bySport: {
        RUN: { sessions: 2, durationSec: 3600, distanceM: 10000, tss: 48 },
        CYCLING: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
        SWIM: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
        UNKNOWN: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
      },
    },
    highlights: [],
  };

  it('records automatic digest generation as platform-paid usage', async () => {
    const { service, recordUsageEvent } = createAiService();

    await expect(service.generateAiSummaryMarkdown(request)).resolves.toEqual(
      expect.objectContaining({ markdown: '## AI review', model: 'model' }),
    );
    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        kind: 'REVIEW_WEEKLY',
        provider: 'openrouter',
        model: 'model',
        usage: expect.objectContaining({
          inputTokens: 900,
          cachedInputTokens: 300,
          outputTokens: 100,
        }),
      }),
    );
  });

  it('keeps a valid digest when internal usage persistence is unavailable', async () => {
    const { service } = createAiService({
      usageFailure: new Error('database unavailable'),
    });

    await expect(service.generateAiSummaryMarkdown(request)).resolves.toEqual(
      expect.objectContaining({ markdown: '## AI review' }),
    );
  });

  it('bounds the Agent task with a per-attempt timeout and an abort signal', async () => {
    const { service, create } = createAiService();

    await service.generateAiSummaryMarkdown(request);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'REVIEW_DIGEST_WEEKLY',
        activeSkillName: 'period-review',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('falls back to the rule-based digest for an isolated model failure', async () => {
    const { service } = createAiService({
      create: jest.fn(async () => {
        throw new Error('upstream 503');
      }),
    });

    await expect(
      service.generateAiSummaryMarkdown(request),
    ).resolves.toBeNull();
  });

  it('defers instead of falling back once the review run is stopped', async () => {
    const guard = new ReviewModelCallGuard();
    const create = jest.fn(async () => {
      throw new Error('upstream 503');
    });
    const { service } = createAiService({ guard, create });
    (guard as unknown as { logger: Record<string, unknown> }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await expect(
      service.generateAiSummaryMarkdown(request),
    ).resolves.toBeNull();
    await expect(
      service.generateAiSummaryMarkdown(request),
    ).resolves.toBeNull();
    await expect(
      service.generateAiSummaryMarkdown(request),
    ).rejects.toBeInstanceOf(ReviewModelDeferredError);
    await expect(
      service.generateAiSummaryMarkdown(request),
    ).rejects.toBeInstanceOf(ReviewModelDeferredError);
    expect(create).toHaveBeenCalledTimes(3);
  });
});
