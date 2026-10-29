import { describe, expect, it } from '@jest/globals';
import { SportType } from '@prisma/client';
import { resolveActivityCoachSportContext } from '@/api/ai/activity-coach-sport-context';
import { buildActivityCoachSystemPrompt } from '@/api/ai/core/prompt-contracts/activity-coach.contract';
import { compilePublicActivityCoachMessages } from '../public-workout-review-prompt';
import type { PublicReviewEvidence } from '../public-review-artifacts';

const evidence: PublicReviewEvidence = {
  schemaVersion: '1.0',
  language: 'ja',
  sport: 'RUN',
  summary: { timerTimeSec: 1800, avgHeartRateBpm: 145 },
  laps: [],
  userContext: {},
  dataAvailability: {
    recordCount: 100,
    hasHeartRate: true,
    hasPower: false,
    hasSpeed: true,
    hasAltitude: false,
    hasRoute: false,
  },
  derived: {},
};

describe('public workout review prompt', () => {
  it('uses the logged-in core prompt verbatim and only appends a public addendum', () => {
    const core = buildActivityCoachSystemPrompt({
      sportContext: resolveActivityCoachSportContext({
        sportType: SportType.RUN,
      }),
      lang: 'ja',
    });
    const publicSystem =
      compilePublicActivityCoachMessages({
        evidence,
      })[0]?.content ?? '';

    expect(publicSystem.startsWith(core)).toBe(true);
    expect(publicSystem.slice(core.length)).toMatch(
      /^\n\n# Public tool addendum\n/,
    );
    expect(publicSystem).toContain('Reply with one complete JSON object');
    expect(publicSystem).toContain('Output Markdown only');
  });

  it('uses the terminal tool as the delivery channel for Agent tasks', () => {
    const messages = compilePublicActivityCoachMessages({
      evidence,
      delivery: 'agent-tool',
    });
    expect(messages[0]?.content).toContain('coach_task_submit_result');
    expect(messages[0]?.content).toContain('Do not return it as chat text');
    expect(messages[1]?.content).toContain('Prepare and submit');
  });
});
