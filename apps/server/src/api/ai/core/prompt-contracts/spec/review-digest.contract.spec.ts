import { describe, expect, it } from '@jest/globals';
import {
  REVIEW_DIGEST_PROMPT_VERSION,
  buildReviewDigestMessages,
  buildReviewDigestSystemPrompt,
  serializeReviewDigestContext,
  type ReviewDigestCoachingContext,
} from '../review-digest.contract';

const totals = {
  totalSessions: 1,
  totalDurationSec: 3600,
  totalDistanceM: 10000,
  totalTss: 45,
  totalLoad: 50,
  bySport: {
    RUN: { sessions: 1, durationSec: 3600, distanceM: 10000, tss: 45 },
    CYCLING: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
    SWIM: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
    UNKNOWN: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
  },
};

const coachingContext: ReviewDigestCoachingContext = {
  plan: {
    title: '8 周打好基础',
    goal: '稳定完成 5K',
    startDate: '2026-08-24',
    endDate: '2026-10-18',
    periodWeeks: 8,
    currentWeekIndex: 2,
    currentDayIndex: 3,
  },
  reviewWindow: {
    from: '2026-09-01',
    through: '2026-09-01',
    planned: 1,
    done: 1,
    skipped: 0,
    moved: 0,
    incomplete: 0,
    plannedLoad: 40,
    actualLoad: 45,
    extraActivities: 0,
    sportBreakdown: { RUN: { workouts: 1, activities: 1 } },
  },
  recentDays: [],
  loadSnapshot: {
    ctl: 22,
    atl: 25,
    tsb: -3,
    currentWeekLoad: 45,
    previousWeekLoad: 120,
    dailyLoadLast7d: [0, 0, 40, 0, 35, 0, 45],
    restDaysLast14d: 8,
  },
  upcoming: [
    {
      date: '2026-09-02',
      weekIndex: 2,
      dayIndex: 3,
      sportType: 'RUN',
      status: 'PLANNED',
      name: '受控稳定跑',
      plannedDurationSeconds: 1800,
      plannedSessionRpe: 5,
      expectedLoad: 35,
    },
  ],
  competition: { upcomingEvents: [], activeInfluences: [] },
  dataQuality: {
    missing: [],
    hasActivityDetails: true,
    hasPmcTrend: true,
    hasAthleteProfile: true,
  },
};

describe('review-digest prompt contract', () => {
  it('sends compact JSON and omits zero-session sports', () => {
    const messages = buildReviewDigestMessages({
      type: 'DAILY',
      lang: 'zh',
      periodStart: new Date('2026-08-16T16:00:00.000Z'),
      periodEnd: new Date('2026-08-17T16:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      totals,
      highlights: [
        {
          rank: 1,
          sportType: 'RUN',
          title: 'Easy run',
          durationSec: 3600,
          distanceM: 10000,
          tss: 45,
          startTime: new Date('2026-08-17T00:00:00.000Z'),
        },
      ],
    });
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    const user = messages[1]?.content ?? '';
    expect(user).toBe(serializeReviewDigestContext(JSON.parse(user)));
    expect(user.includes('\n')).toBe(false);
    expect(user).toContain('"sportType":"RUN"');
    expect(user).not.toContain('CYCLING');
    expect(user).toContain('"inclusive":"half_open"');
    expect(user).toContain('"timezone":"Asia/Shanghai"');
    expect(user).toContain('"athleteToday":"2026-08-18"');
    expect(user).toContain('"coaching":null');
  });

  it('grounds the daily review in plan facts without taking over runtime', () => {
    const prompt = buildReviewDigestSystemPrompt({
      type: 'DAILY',
      lang: 'en',
    });
    expect(prompt).toContain(`Prompt version: ${REVIEW_DIGEST_PROMPT_VERSION}`);
    expect(prompt).toContain('Trainingload.ai AI Coach');
    expect(prompt).toContain('speaking directly to your athlete');
    expect(prompt).toContain('Never expose or narrate internal mechanics');
    expect(prompt).toContain('separate Coach Runtime job');
    expect(prompt).toContain('do not identify internal ids');
    expect(prompt).toContain('Write natural Markdown in locale: en');
    expect(prompt).toContain('Execution of the reviewed day');
    expect(prompt).toContain(
      "Never call the reviewed activity 'today's workout'",
    );
    expect(prompt).toContain('half-open');
    expect(prompt).toContain('window.timezone');
    expect(prompt).toContain('window.athleteToday');
    expect(prompt).toContain('1-based human-facing indices');
    expect(prompt).toContain(
      'When `coaching` is null, do not answer plan execution',
    );
    expect(prompt).toContain('350–600 Chinese characters');
  });

  it('includes the optional coaching context in compact JSON', () => {
    const messages = buildReviewDigestMessages({
      type: 'DAILY',
      lang: 'zh',
      periodStart: new Date('2026-08-31T16:00:00.000Z'),
      periodEnd: new Date('2026-09-01T16:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      totals,
      highlights: [],
      coachingContext,
    });
    const user = messages[1]?.content ?? '';
    expect(user.includes('\n')).toBe(false);
    expect(user).toContain('"currentWeekIndex":2');
    expect(user).toContain('"reviewedFrom":"2026-09-01"');
    expect(user).toContain('"name":"受控稳定跑"');
  });

  it('uses genuinely different review questions for each scale', () => {
    const daily = buildReviewDigestSystemPrompt({ type: 'DAILY', lang: 'zh' });
    const weekly = buildReviewDigestSystemPrompt({
      type: 'WEEKLY',
      lang: 'zh',
    });
    const monthly = buildReviewDigestSystemPrompt({
      type: 'MONTHLY',
      lang: 'zh',
    });

    expect(daily).toContain('Connection to the next training day');
    expect(weekly).toContain('Key sessions and deviations');
    expect(weekly).toContain('600–1,000 Chinese characters');
    expect(monthly).toContain('Consistency and key training patterns');
    expect(monthly).toContain('Do not invent a named training phase');
    expect(monthly).toContain('not proof of physiological adaptation');
    expect(monthly).toContain('900–1,500 Chinese characters');
    expect(new Set([daily, weekly, monthly]).size).toBe(3);
  });

  it('supports background Agent result delivery', () => {
    const prompt = buildReviewDigestSystemPrompt({
      type: 'DAILY',
      lang: 'zh',
      delivery: 'agent-tool',
    });
    expect(prompt).toContain('server-owned background task');
    expect(prompt).toContain('coach_task_submit_result');
    expect(prompt).toContain('{"markdown":"the complete review"}');
  });
});
