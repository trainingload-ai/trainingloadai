import type { CoachSkillDef } from '../skill.types';

export const weekReviewSkill: CoachSkillDef = {
  name: 'week-review',
  aliases: ['weekly-review', 'training-review'],
  description:
    'Review one training week with load, volume, session mix, and comparison against the prior week.',
  whenToUse:
    'Use for prompts asking how this week or last week went, for weekly recap, weekly training summary, weekly volume/load review, or whether the week was too much or too little.',
  suggestedTools: [
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
  ].join('\n'),
};
