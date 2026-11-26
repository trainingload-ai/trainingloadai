import type { CoachSkillDef } from '../skill.types';

export const readinessCheckSkill: CoachSkillDef = {
  name: 'readiness-check',
  aliases: ['readiness', 'fatigue-check'],
  description:
    'Decide whether near-term training should proceed, reduce, change or pause.',
  whenToUse:
    'Fatigue, recovery or freshness that affects the next training choice; pure numeric trends use training-analytics.',
  suggestedTools: [
    'pmc.projection',
    'pmc.range',
    'activity.search',
    'plan.active',
    'training.data_coverage',
    'training.readiness',
    'plan.execution_context',
    'plan.recent',
    'integration.status',
    'compare.blocks',
    'activity.byHashId',
    'activity.series',
    'coach_task_submit_result',
  ],
  prompt: [
    `Judge near-term training readiness from the server context, acquiring only additional evidence that can materially change the recommendation. Required coverage inspection (e.g. NEVER_RECORDED_ACTIVITY, LAST_ACTIVITY_OVER_30_DAYS, ACTIVITY_PROCESSING_PENDING) is a hard evidence-acquisition rule: call training.data_coverage before concluding, without letting it predetermine a canned conclusion or reminder.`,
    `- Progressive evidence: use training.readiness for recent sessions/load, plan.execution_context for today's state and next sessions, plan.recent for adherence/prior status, and integration.status only when provider connection/sync detail remains material after coverage inspection. These tools are progressive disclosure, not a checklist; stop once evidence suffices.`,
    `- Soft evidence (days since latest activity, count, planned state, adherence, load trend) informs judgment together; Examples describe possible evidence relationships, not special-case branches. Mention a data gap only when it changes the recommendation or next action.`,
    `- Never infer missed, completed, or unsynced workouts from an empty activity list alone; distinguish "no recorded training" from "unverified coverage" and wait when sync/processing is pending instead of asking the athlete.`,
    `- Keep recorded data, modeled load and coaching judgment separate. Sleep, HRV and baselines are optional enrichment—never let their absence trigger questions, device setup, or block advice from recent training. Ask at most one high-information question only when tools cannot answer and the reply would change today's recommendation.`,
    `Complete with proceed, reduce, replace or rest, the decisive facts (and conservative uncertainty if mixed, without diagnosing), or one necessary question. For a server-owned suggestion, submit the caller-required result instead of starting a chat confirmation flow.`,
  ].join('\n'),
};
