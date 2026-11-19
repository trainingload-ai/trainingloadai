import type { CoachSkillDef } from '../skill.types';

export const weekReviewSkill: CoachSkillDef = {
  name: 'week-review',
  aliases: ['weekly-review', 'training-review'],
  description: 'Explain a training week and its next coaching priority.',
  whenToUse:
    'A chat recap of weekly volume, load or session mix; effects on the next planned week use plan-week-review.',
  suggestedTools: [
    'training.data_coverage',
    'training.weekSummary',
    'training.readiness',
    'activity.search',
    'activity.byHashId',
    'activity.series',
  ],
  prompt: [
    `Review the requested training week against the athlete's question. training.weekSummary gives the weekly load, volume, active days, mix, and prior-week comparison; readiness and activity detail are supporting evidence when fatigue or specific key sessions can change the conclusion.`,
    `- Distinguish recorded weekly facts, comparison effects, and coaching interpretation. Do not inspect every activity when the aggregate evidence already answers the question.`,
    `- Lead with the weekly judgment, support it with the most decision-relevant facts and key sessions, then give the next practical coaching priority. State material missing evidence instead of filling it with assumptions.`,
    'Inspect training.data_coverage before interpreting an empty week as no training. Recorded absence, incomplete sync and pending processing support different conclusions.',
    'Complete with the judgment about the requested week, its decisive facts and one next priority. If the question is whether upcoming planned work should change, activate plan-week-review with the resolved week and relevant evidence.',
  ].join('\n'),
};
