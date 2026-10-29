import { describe, expect, it } from '@jest/globals';
import { CompetitionImpactFallback } from '../competition-impact-fallback';
import type { CompetitionImpactInput } from '../competition-impact.types';

describe('CompetitionImpactFallback', () => {
  it('protects a critical marathon three days after the plan ends', () => {
    const input: CompetitionImpactInput = {
      schemaVersion: 1,
      locale: 'en',
      anchorDate: '2026-08-10',
      scope: {
        type: 'PLAN_EXECUTION',
        startDate: '2026-07-01',
        endDate: '2026-08-20',
      },
      candidateSelection: {
        startDate: '2026-04-08',
        endDate: '2027-08-19',
        truncated: false,
        totalBeforeLimit: 1,
      },
      events: [
        {
          id: 'event-1',
          version: 1,
          title: 'Target marathon',
          sportType: 'RUN',
          sportDefinitionCode: null,
          distanceMeters: 42195,
          startDate: '2026-08-23',
          endDate: null,
          importance: 'CRITICAL',
          goalType: 'FINISH',
          targetTimeSeconds: null,
        },
      ],
      athlete: {
        personalizationReadiness: 'none',
        averageWeek: {
          activityCount: 0,
          activeDays: 0,
          totalDurationMin: 0,
          totalDistanceKm: 0,
          totalLoad: 0,
        },
        longestSession: null,
        recentLoad: { ctl: null, atl: null, tsb: null, dailyLoadLast7d: [] },
        dataFreshness: { latestActivityAt: null, latestPmcDate: null },
      },
    };

    const assessment = new CompetitionImpactFallback().build(input);
    expect(assessment.eventAssessments[0]).toMatchObject({
      relevant: true,
      currentImpactLevel: 'CRITICAL',
      riskFlags: ['AI_ASSESSMENT_UNAVAILABLE'],
    });
    expect(assessment.eventAssessments[0].constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'AVOID_LATE_MAKEUP_SESSION' }),
        expect.objectContaining({ type: 'PROTECT_EVENT_DAY' }),
      ]),
    );
  });

  it('flags closely spaced critical events instead of promising two peaks', () => {
    const base = {
      schemaVersion: 1 as const,
      locale: 'en' as const,
      anchorDate: '2026-08-10',
      scope: {
        type: 'PLAN_EXECUTION' as const,
        startDate: '2026-07-01',
        endDate: '2026-09-30',
      },
      candidateSelection: {
        startDate: '2026-04-08',
        endDate: '2027-09-29',
        truncated: false,
        totalBeforeLimit: 2,
      },
      events: [
        {
          id: 'a',
          version: 1,
          title: 'A',
          sportType: 'RUN',
          sportDefinitionCode: null,
          distanceMeters: 42195,
          startDate: '2026-08-23',
          endDate: null,
          importance: 'CRITICAL' as const,
          goalType: 'FINISH',
          targetTimeSeconds: null,
        },
        {
          id: 'b',
          version: 1,
          title: 'B',
          sportType: 'RUN',
          sportDefinitionCode: null,
          distanceMeters: 42195,
          startDate: '2026-09-13',
          endDate: null,
          importance: 'CRITICAL' as const,
          goalType: 'FINISH',
          targetTimeSeconds: null,
        },
      ],
      athlete: {
        personalizationReadiness: 'none' as const,
        averageWeek: {
          activityCount: 0,
          activeDays: 0,
          totalDurationMin: 0,
          totalDistanceKm: 0,
          totalLoad: 0,
        },
        longestSession: null,
        recentLoad: { ctl: null, atl: null, tsb: null, dailyLoadLast7d: [] },
        dataFreshness: { latestActivityAt: null, latestPmcDate: null },
      },
    };
    const assessment = new CompetitionImpactFallback().build(base);
    expect(assessment.combinedImpact.conflicts).toEqual([
      expect.objectContaining({
        eventIds: ['a', 'b'],
        severity: 'CRITICAL',
      }),
    ]);
  });
});
