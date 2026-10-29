/** Offline, no database/network, and no raw evidence in output. */
import { readFileSync } from 'fs';
import { calculateFieldLthr, HeartRateSample } from '@/algorithm/fitness-lthr';
import {
  anonymizedFitnessTraceCases,
  evaluateFitnessAssessmentTrace,
} from './fitness-conversation-evaluation';
import { calculateCp } from '@/algorithm/fitness-cp';
import {
  calculateFitnessPreview,
  FitnessPreviewEvidence,
  PreviewRecipe,
} from '@/algorithm/fitness-preview';
import type { FitnessSport } from '@shared/fitness-assessment';
type Case = {
  id: string;
  recipe: 'HR_TEST_SEGMENT' | 'POWER_DURATION' | PreviewRecipe;
  evidence?: FitnessPreviewEvidence;
  sport?: FitnessSport;
  reference?: string;
  samples?: HeartRateSample[];
  peaks?: Array<{ seconds: number; value: number }>;
  startSeconds?: number;
  sampleSeconds?: number;
  expected: { valid: boolean; value?: number };
};
const flag = process.argv.indexOf('--input');
const cases: Case[] =
  flag >= 0
    ? JSON.parse(readFileSync(process.argv[flag + 1], 'utf8'))
    : [
        {
          id: 'continuous-test',
          recipe: 'HR_TEST_SEGMENT',
          samples: Array.from({ length: 1801 }, (_, i) => ({
            seconds: i,
            heartRate: 176,
          })),
          expected: { valid: true, value: 176 },
        },
        {
          id: 'long-gap',
          recipe: 'HR_TEST_SEGMENT',
          samples: Array.from({ length: 1801 }, (_, i) => ({
            seconds: i,
            heartRate: 176,
          })).filter((p) => p.seconds < 900 || p.seconds > 950),
          expected: { valid: false },
        },
        {
          id: 'insufficient-power-coverage',
          recipe: 'POWER_DURATION',
          peaks: [
            { seconds: 30, value: 500 },
            { seconds: 60, value: 400 },
          ],
          expected: { valid: false },
        },
      ];
if (flag < 0) {
  const evidence: FitnessPreviewEvidence = {
    performances: [225, 475, 725]
      .map((t, i) => ({
        activityHashId: String(i),
        distanceM: 4 * t + 100,
        speedMps: (4 * t + 100) / t,
      }))
      .concat([
        { activityHashId: '5k', distanceM: 5000, speedMps: 5000 / 1200 },
      ]),
    heartRatePeaks: [{ activityHashId: 'one', seconds: 1, value: 190 }],
    vo2: [
      {
        activityHashId: 'one',
        date: '2026-09-25T08:00:00Z',
        value: 50,
        source: 'FACTOR',
      },
    ],
    daily: [{ date: '2026-09-25', value: 52, provider: 'TEST' }],
  };
  const previews: Array<[PreviewRecipe, number]> = [
    ['DISTANCE_TIME', 4],
    ['PACE_5K', 260],
    ['PERFORMANCE_VDOT', 49.81],
    ['ACTIVITY_VO2', 50],
    ['OBSERVED_HR', 190],
    ['DAILY_RESTING_HR', 52],
  ];
  cases.push(
    ...previews.map(([recipe, value]) => ({
      id: recipe.toLowerCase(),
      recipe,
      evidence,
      sport: 'RUN' as const,
      reference: '2026-09-25T08:00:00Z',
      expected: { valid: true, value },
    })),
  );
}
const results = cases.map((c) => {
  const result =
    c.recipe === 'HR_TEST_SEGMENT'
      ? calculateFieldLthr(
          c.samples ?? [],
          c.startSeconds ?? 0,
          c.sampleSeconds ?? 1,
        )
      : c.recipe === 'POWER_DURATION'
        ? calculateCp(c.peaks ?? [])
        : (() => {
            const r = calculateFitnessPreview(
              c.recipe,
              c.evidence ?? {
                performances: [],
                heartRatePeaks: [],
                vo2: [],
                daily: [],
              },
              c.sport ?? 'RUN',
              c.reference ?? '2026-09-25T08:00:00Z',
            );
            return {
              valid:
                !r.reason &&
                (r.candidates.length > 0 || r.observationOnly === true),
              value: r.candidates[0]?.value ?? r.observations[0]?.value,
            };
          })();
  return {
    id: c.id,
    passed:
      result.valid === c.expected.valid &&
      (c.expected.value === undefined ||
        ('value' in result && result.value === c.expected.value)),
    valid: result.valid,
  };
});
const dialogueResults = anonymizedFitnessTraceCases.map((c) => ({
  id: c.id,
  passed: evaluateFitnessAssessmentTrace(c.trace).complete === c.expected,
}));
results.push(...dialogueResults.map((r) => ({ ...r, valid: r.passed })));
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
