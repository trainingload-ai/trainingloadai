import type { CoachSkillDef } from '../skill.types';

export const performanceReviewSkill: CoachSkillDef = {
  name: 'performance-review',
  aliases: ['progress-review', 'pb-review', 'bests-review'],
  description:
    'Judge performance progress from comparable results and fitness evidence.',
  whenToUse:
    'PRs, best distances or whether performance improved; numeric load trends use training-analytics.',
  suggestedTools: [
    'fitness.methods',
    'skill.activate',
    'bests.summary',
    'profile.current',
    'metric.current',
    'metric.compare',
    'metric.history',
    'training.aggregate',
    'present_training_visualization',
    'activity.search',
    'activity.byHashId',
    'activity.series',
  ],
  prompt: [
    `Assess the performance question from comparable results and the smallest set of supporting fitness evidence. Bests, current and historical metrics, profile context, and detailed activity data answer different questions; select them according to the claim you need to make.`,
    `- Separate observed result changes from fitness inference. Account for course, terrain, duration, conditions, sensor coverage, and protocol differences before calling a change improvement or regression.`,
    `- Use activity.series for segment, climbing, cadence, moving-only or zero-power comparisons. State the returned filters and coverage; absent signals cannot support a causal claim. Whole-activity averages do not describe a climbing segment.`,
    `- Ramp-test FTP needs the test protocol and its required sustained/terminal interval power. Whole-session average or instantaneous maximum cannot validate or replace FTP.`,
    `- Finish with the direct performance judgment, the evidence and comparability limits that matter, and one useful next observation or action.`,
    'When the requested outcome is a quantitative comparison or chart rather than a performance judgment, use training-analytics and preserve the comparison scope.',
  ].join('\n'),
};
