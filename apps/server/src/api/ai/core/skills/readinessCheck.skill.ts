import type { CoachSkillDef } from '../skill.types';

export const readinessCheckSkill: CoachSkillDef = {
  name: 'readiness-check',
  aliases: ['readiness', 'fatigue-check'],
  description:
    'Assess current fatigue, freshness, and near-term training readiness from recent load data.',
  whenToUse:
    'Use for prompts about fatigue, recovery, freshness, current form, whether to train today, or how the recent 1-4 weeks are trending.',
  suggestedTools: [
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
    `Judge the athlete's near-term training readiness through the normal Agent loop. Start from the server-owned context, then acquire only the additional evidence that can materially change the recommendation. context.activityEvidence provides lightweight activity-recency facts. A required coverage inspection is a hard evidence-acquisition rule: call training.data_coverage before concluding. Other recency, load, plan-execution and activity facts are soft evidence: they inform your judgment but never map directly to a canned conclusion or reminder.`,
    `- Use training.readiness when recent sessions or the 7/14/28-day load picture could change the recommendation. Use plan.execution_context for today's completion state and the next sessions. Use plan.recent when current-week adherence or earlier plan status is material. These tools are progressive disclosure, not a checklist; stop when the evidence is sufficient for the decision.`,
    `- Hard coverage reasons currently include NEVER_RECORDED_ACTIVITY, LAST_ACTIVITY_OVER_30_DAYS and ACTIVITY_PROCESSING_PENDING. They require tool inspection, but they do not predetermine the coaching conclusion or force a canned reminder.`,
    `- Soft evidence is factual context such as days since the latest activity, recent activity count, planned-workout state, adherence and load trend. Examples describe possible evidence relationships, not special-case branches. Inspect the relevant facts before using them, weigh them together, and mention a data gap only when it changes the recommendation or the next useful action.`,
    `- Never infer that a workout was missed, completed, or unsynced from an empty activity list alone. If that distinction matters, inspect plan execution and training-data coverage before deciding whether to remind the athlete. Use integration.status only when provider-specific connection, permission or sync detail remains material after coverage inspection.`,
    `- Distinguish "no recorded training" from "the system cannot yet verify training coverage". If sync or activity processing is still pending, wait for system data instead of asking the athlete for facts the system is about to receive.`,
    `- Ask the athlete only when available tools cannot answer the question and the answer could materially change today's recommendation. Ask one highest-information question and explain why it matters.`,
    `- Keep recorded data, modeled load estimates and coaching judgment separate. Readiness is an interpretation, not proof of physiological recovery; note missing sleep, soreness or symptom evidence when relevant.`,
    `- Answer the practical question directly, such as proceed, reduce, replace, or rest, with the few facts that drove the recommendation. If evidence is weak or mixed, state the uncertainty and choose a conservative next action without diagnosing recovery or illness.`,
  ].join('\n'),
};
