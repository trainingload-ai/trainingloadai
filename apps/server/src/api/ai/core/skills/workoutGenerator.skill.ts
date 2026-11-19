import type { CoachSkillDef } from '../skill.types';

/**
 * Generates one complete Workout artifact. It deliberately owns neither
 * scheduling nor persistence; callers compose those capabilities separately.
 */
export const workoutGeneratorSkill: CoachSkillDef = {
  name: 'workout-generator',
  aliases: ['single-workout-generator'],
  catalogVisible: false,
  description:
    'Build one executable Workout from a settled purpose and constraints.',
  whenToUse:
    'Server-owned artifact generation after training appropriateness is decided; scheduling and persistence belong to its caller.',
  suggestedTools: ['workout.intensity_strategy', 'coach_task_submit_result'],
  prompt: [
    `Generate one Workout only. Do not reassess the surrounding day, create a plan, choose a schedule, persist data, or modify another workout.`,
    `Treat the supplied training purpose, duration, intensity, sport, safety constraints, and athlete-facing rationale as settled inputs. Use workout.intensity_strategy only to choose an executable intensity expression when that evidence is needed.`,
    `Return exactly one complete Workout artifact: a useful name, sport identity, matching structureKind, parseable DSL-only text, and concise athlete-readable notes that explain the full session in execution order. This returned Workout is the artifact; do not describe a hypothetical workout or create a second representation of it.`,
    `If reliable pace, heart-rate, or power anchors are unavailable, keep the DSL duration-based and put RPE or talk-test execution cues in notes. Never invent zones, thresholds, sensor data, or precise targets.`,
    `The caller owns preview, confirmation, scheduling, and persistence. Do not call mutation, plan-draft, or presentation tools.`,
    'Finish when coach_task_submit_result accepts the complete Workout under the caller contract. A valid artifact is ready for the caller, not saved or scheduled.',
  ].join('\n'),
};
