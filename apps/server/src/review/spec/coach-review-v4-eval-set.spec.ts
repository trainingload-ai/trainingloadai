import { describe, expect, it } from '@jest/globals';
import {
  COACH_REVIEW_EVAL_RUNS_PER_CASE,
  COACH_REVIEW_V4_EVAL_CASES,
} from '../evals/coach-review-v4.cases';

describe('Coach Review v4 behavior evaluation set', () => {
  it('defines 30 unique expert-labeled scenarios with three runs each', () => {
    expect(COACH_REVIEW_V4_EVAL_CASES).toHaveLength(30);
    expect(COACH_REVIEW_EVAL_RUNS_PER_CASE).toBe(3);
    expect(new Set(COACH_REVIEW_V4_EVAL_CASES.map((row) => row.id)).size).toBe(
      30,
    );
    expect(new Set(COACH_REVIEW_V4_EVAL_CASES.map((row) => row.scale))).toEqual(
      new Set(['daily', 'weekly', 'monthly']),
    );
    expect(
      COACH_REVIEW_V4_EVAL_CASES.every(
        (row) =>
          row.facts.length > 20 &&
          row.allowedDecisions.length > 0 &&
          row.requiredEvidence.length > 0,
      ),
    ).toBe(true);
  });

  it('does not permit KEEP for the reported late unplanned run incident', () => {
    const incident = COACH_REVIEW_V4_EVAL_CASES.find(
      (row) => row.id === 'daily-late-extra-run',
    );
    expect(incident?.allowedDecisions).not.toContain('KEEP');
  });
});
