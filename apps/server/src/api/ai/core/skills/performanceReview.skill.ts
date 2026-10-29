import type { CoachSkillDef } from '../skill.types';

export const performanceReviewSkill: CoachSkillDef = {
  name: 'performance-review',
  aliases: ['progress-review', 'pb-review', 'bests-review'],
  description:
    'Interpret best performances, current thresholds, and progress signals from user-level metrics and best-distance records.',
  whenToUse:
    'Use for prompts about PRs, best 5k/10k/marathon, whether performance is improving, best-distance style questions, or how current FTP/eFTP/VO2max relate to performance.',
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
    'When asked to calculate or estimate a user fitness metric from evidence, discover fitness.methods and activate fitness-assessment. Stored profile values are not a new calculation.',
    `Assess the performance question from comparable results and the smallest set of supporting fitness evidence. Bests, current and historical metrics, profile context, and detailed activity data answer different questions; select them according to the claim you need to make.`,
    `- Report \`effectiveCurrent\` / \`effectiveSource\` as the active baseline. Do not call the manual value active merely because it exists; include auto-update state when AUTO and MANUAL differ.`,
    `- For VO2max, treat it as estimated-only. Do not imply there is a separate manual VO2max input if the data does not show one.`,
    `- Separate observed result changes from fitness inference. Account for course, terrain, duration, conditions, sensor coverage, and protocol differences before calling a change improvement or regression.`,
    `- Use activity.series for segment, climbing, cadence, moving-only or zero-power comparisons. State the returned filters and coverage; absent signals cannot support a causal claim. Whole-activity averages do not describe a climbing segment.`,
    `- Ramp-test FTP needs the test protocol and its required sustained/terminal interval power. Whole-session average or instantaneous maximum cannot validate or replace FTP.`,
    `- Finish with the direct performance judgment, the evidence and comparability limits that matter, and one useful next observation or action.`,
  ].join('\n'),
};
