import { describe, expect, it } from '@jest/globals';
import {
  isListablePendingCoachDecision,
  presentPendingCoachDecision,
  presentReviewGuidance,
  rankPendingCoachDecisions,
} from '../pending-coach-decision.presenter';

describe('pending coach decision presenter', () => {
  it('ranks HIGH risk ahead of later LOW risk', () => {
    const low = {
      id: 'low',
      riskTier: 'LOW' as const,
      createdAt: new Date('2026-08-18T10:00:00.000Z'),
    };
    const high = {
      id: 'high',
      riskTier: 'HIGH' as const,
      createdAt: new Date('2026-08-18T09:00:00.000Z'),
    };
    expect(rankPendingCoachDecisions([low, high]).map((row) => row.id)).toEqual(
      ['high', 'low'],
    );
  });

  it('maps apply payload fields the home stack needs', () => {
    const presented = presentPendingCoachDecision({
      id: 'dec-1',
      branchId: 'branch-1',
      contextId: 'ctx-1',
      decisionType: 'PLAN_WORKOUT_POSTPONE',
      riskTier: 'HIGH',
      rationale: 'Postpone tomorrow.',
      confidence: 0.6,
      payload: {
        planId: 'plan-1',
        workoutId: 'w-1',
        workoutName: 'Easy run',
        fromWeekIndex: 2,
        fromDayIndex: 7,
        weekIndex: 3,
        dayIndex: 1,
        review: {
          scale: 'weekly',
          promptVersion: 'plan_review_judgment_v4',
          source: 'llm',
          evidenceCodes: ['SHORT_RECOVERY'],
        },
        adjustment: {
          kind: 'POSTPONE',
          before: {
            name: 'Easy run',
            date: '2026-08-18',
            summary: '45 min easy',
            expectedLoad: 28,
          },
          after: {
            name: 'Easy run',
            date: '2026-08-19',
            summary: '45 min easy',
            expectedLoad: 28,
          },
          changes: [
            {
              field: 'date',
              before: '2026-08-18',
              after: '2026-08-19',
              reason: 'More recovery space',
            },
          ],
        },
      },
      options: [
        { optionKey: 'apply', title: '推迟一天', isSelected: true },
        { optionKey: 'keep', title: '保持原计划', isSelected: false },
      ],
      createdAt: new Date('2026-08-18T01:00:00.000Z'),
      context: {
        id: 'ctx-1',
        planId: 'plan-1',
        plan: { id: 'plan-1', title: 'Base' },
      },
      branch: { id: 'branch-1', openReason: 'runtime_week_review' },
    });

    expect(presented).toMatchObject({
      id: 'dec-1',
      planId: 'plan-1',
      planTitle: 'Base',
      decisionType: 'PLAN_WORKOUT_POSTPONE',
      openReason: 'runtime_week_review',
      workout: {
        id: 'w-1',
        name: 'Easy run',
        fromWeekIndex: 2,
        fromDayIndex: 7,
        weekIndex: 3,
        dayIndex: 1,
      },
      review: {
        scale: 'weekly',
        evidenceCodes: ['SHORT_RECOVERY'],
      },
      adjustment: {
        kind: 'POSTPONE',
        before: { date: '2026-08-18', expectedLoad: 28 },
        after: { date: '2026-08-19', expectedLoad: 28 },
        changes: [
          {
            field: 'date',
            before: '2026-08-18',
            after: '2026-08-19',
          },
        ],
      },
    });
    expect(presented.options.map((option) => option.optionKey)).toEqual([
      'apply',
      'keep',
    ]);
  });

  it('lists FINALIZED open-next decisions and hides other finalized proposals', () => {
    expect(
      isListablePendingCoachDecision({
        contextStatus: 'ACTIVE',
        decisionType: 'PLAN_WORKOUT_POSTPONE',
        payload: { workoutId: 'w-1' },
      }),
    ).toBe(true);
    expect(
      isListablePendingCoachDecision({
        contextStatus: 'FINALIZED',
        decisionType: 'PLAN_LIFECYCLE',
        payload: { action: 'open_next' },
      }),
    ).toBe(true);
    expect(
      isListablePendingCoachDecision({
        contextStatus: 'FINALIZED',
        decisionType: 'PLAN_WORKOUT_POSTPONE',
        payload: { workoutId: 'w-1' },
      }),
    ).toBe(false);
  });

  it('presents only an explicit keep-with-guidance review', () => {
    const event = {
      id: 'event-1',
      occurredAt: new Date('2026-09-10T00:00:00.000Z'),
      payload: {
        outcome: 'KEEP_WITH_GUIDANCE',
        scale: 'daily',
        rationale: '已有两节课未完成，下一练先恢复节奏。',
        evidenceCodes: ['MISSED_WORKOUT', 'LOAD_DEFICIT'],
      },
      context: {
        id: 'context-1',
        planId: 'plan-1',
        plan: { id: 'plan-1', title: '5K' },
      },
    };
    expect(presentReviewGuidance(event)).toMatchObject({
      id: 'event-1',
      planTitle: '5K',
      scale: 'daily',
      evidenceCodes: ['MISSED_WORKOUT', 'LOAD_DEFICIT'],
    });
    expect(
      presentReviewGuidance({
        ...event,
        payload: { ...event.payload, outcome: 'KEEP_SILENT' },
      }),
    ).toBeNull();
    expect(
      presentReviewGuidance({
        ...event,
        payload: {
          ...event.payload,
          rationale: '本周截至目前实际负荷约为计划的 0%。',
        },
      }),
    ).toBeNull();
  });
});
