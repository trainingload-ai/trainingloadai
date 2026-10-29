import { describe, expect, it } from '@jest/globals';
import { CompetitionImpactValidator } from '../competition-impact.validator';
import type { CompetitionImpactInput } from '../competition-impact.types';

function input(): CompetitionImpactInput {
  return {
    schemaVersion: 1,
    locale: 'zh',
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
        goalType: 'TARGET_TIME',
        targetTimeSeconds: 14400,
      },
    ],
    athlete: {
      personalizationReadiness: 'adequate',
      averageWeek: {
        activityCount: 5,
        activeDays: 5,
        totalDurationMin: 360,
        totalDistanceKm: 48,
        totalLoad: 320,
      },
      longestSession: {
        sportType: 'RUN',
        durationMin: 170,
        distanceKm: 28,
        date: '2026-07-05',
      },
      recentLoad: { ctl: 52, atl: 61, tsb: -9, dailyLoadLast7d: [] },
      dataFreshness: { latestActivityAt: null, latestPmcDate: null },
    },
  };
}

function validOutput() {
  return {
    schemaVersion: 1,
    assessmentDate: '2026-08-10',
    eventAssessments: [
      {
        eventId: 'event-1',
        relevant: true,
        confidence: 0.91,
        currentImpactLevel: 'HIGH',
        influenceWindow: {
          startDate: '2026-05-04',
          endDate: '2026-09-13',
          preEventWeeks: 16,
          postEventWeeks: 3,
        },
        phases: [
          {
            type: 'TAPER',
            startDate: '2026-08-10',
            endDate: '2026-08-22',
            impactLevel: 'CRITICAL',
          },
          {
            type: 'EVENT',
            startDate: '2026-08-23',
            endDate: '2026-08-23',
            impactLevel: 'CRITICAL',
          },
        ],
        constraints: [
          {
            type: 'REDUCE_VOLUME',
            startDate: '2026-08-10',
            endDate: '2026-08-22',
            strength: 'HIGH',
            parameters: { preserveSomeIntensity: true },
          },
        ],
        reasoningSummary:
          'The critical marathon is three days after the plan ends, so tapering affects the end of this plan.',
        evidence: ['scope.endDate is 3 days before event.startDate'],
        assumptions: [],
        riskFlags: [],
      },
    ],
    combinedImpact: {
      overallLevel: 'HIGH',
      conflicts: [],
      strategySummary: 'Protect the taper across the plan boundary.',
    },
  };
}

describe('CompetitionImpactValidator', () => {
  const validator = new CompetitionImpactValidator();

  it('accepts a plan-boundary impact assessment', () => {
    expect(validator.validate(validOutput(), input())).toMatchObject({
      eventAssessments: [
        {
          eventId: 'event-1',
          relevant: true,
          currentImpactLevel: 'HIGH',
        },
      ],
    });
  });

  it('requires one assessment for every candidate event', () => {
    const output = validOutput();
    output.eventAssessments = [] as never;
    expect(() => validator.validate(output, input())).toThrow(
      'eventAssessments must contain every input event exactly once',
    );
  });

  it('rejects an event phase that does not cover the authoritative event date', () => {
    const output = validOutput();
    output.eventAssessments[0].phases[1].startDate = '2026-08-24';
    output.eventAssessments[0].phases[1].endDate = '2026-08-24';
    expect(() => validator.validate(output, input())).toThrow(
      'EVENT phase must cover event date',
    );
  });

  it('rejects constraints attached to an irrelevant event', () => {
    const output = validOutput();
    output.eventAssessments[0].relevant = false;
    output.eventAssessments[0].influenceWindow = null as never;
    expect(() => validator.validate(output, input())).toThrow(
      'irrelevant event cannot contain phases or constraints',
    );
  });

  it('rejects influence week counts that contradict the date window', () => {
    const output = validOutput();
    output.eventAssessments[0].influenceWindow.preEventWeeks = 2;
    expect(() => validator.validate(output, input())).toThrow(
      'influence week counts do not match influence dates',
    );
  });

  it('requires a high-risk conflict for closely spaced critical events', () => {
    const twoEventInput = input();
    twoEventInput.events.push({
      ...twoEventInput.events[0],
      id: 'event-2',
      title: 'Second target marathon',
      startDate: '2026-09-13',
    });
    const output = validOutput();
    output.eventAssessments.push({
      ...output.eventAssessments[0],
      eventId: 'event-2',
      influenceWindow: {
        startDate: '2026-05-25',
        endDate: '2026-10-04',
        preEventWeeks: 16,
        postEventWeeks: 3,
      },
      phases: [
        {
          type: 'EVENT',
          startDate: '2026-09-13',
          endDate: '2026-09-13',
          impactLevel: 'CRITICAL',
        },
      ],
      constraints: [],
    });
    expect(() => validator.validate(output, twoEventInput)).toThrow(
      'closely spaced CRITICAL events require a high-risk conflict',
    );
  });

  it('anchors the assessment date to the authoritative decision date', () => {
    const output = validOutput();
    output.assessmentDate = '2026-08-11';
    expect(() => validator.validate(output, input())).toThrow(
      'assessmentDate must equal authoritative anchorDate',
    );
  });

  it('requires low confidence and explicit assumptions when athlete data is absent', () => {
    const lowData = input();
    lowData.athlete.personalizationReadiness = 'none';
    lowData.athlete.averageWeek = {
      activityCount: 0,
      activeDays: 0,
      totalDurationMin: 0,
      totalDistanceKm: 0,
      totalLoad: 0,
    };
    lowData.athlete.longestSession = null;
    const output = validOutput();
    expect(() => validator.validate(output, lowData)).toThrow(
      'low-data assessments require conservative confidence and assumptions',
    );
  });

  it('rejects evidence that invents facts outside the authoritative input', () => {
    const output = validOutput();
    output.eventAssessments[0].evidence = ['Athlete has no injury history'];
    expect(() => validator.validate(output, input())).toThrow(
      'evidence contains facts absent from authoritative input',
    );
  });
});
