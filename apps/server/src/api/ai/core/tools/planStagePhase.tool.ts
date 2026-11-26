import { isDeepStrictEqual } from 'node:util';
import { addCalendarDays, isCalendarDate, parseScheduleConstraints, type ScheduleConstraints } from '@shared/plan-calendar';
import { asRecord } from '../ai-common.util';
import { aiToolError, buildAiTool, type AiToolContext, type AiToolDef } from '../tool.types';
import {
  compactCoachPlanDraftToolParametersSchema as draftSchema,
  expandAssessedDraft, validateCoachPlanCandidate,
} from './presentCoachPlanDraft.tool';
import { planPhaseProgress } from './plan-draft-phase-progress';

export { planPhaseProgress };
type Input = Record<string, unknown>;

function rulesDuringPlan(rules: ScheduleConstraints, start: string, end: string) {
  return {
    calendarTimeZone: rules.calendarTimeZone,
    from: rules.effectiveFrom < start ? start : rules.effectiveFrom,
    until: rules.effectiveUntil && rules.effectiveUntil < end ? rules.effectiveUntil : end,
    fixedRestWeekdays: [...rules.fixedRestWeekdays].sort(),
    unavailableDates: [...rules.unavailableDates].sort(),
    availableDateOverrides: [...rules.availableDateOverrides].sort(),
  };
}

function phaseCandidate(ctx: AiToolContext, input: Input) {
  const progress = planPhaseProgress(ctx);
  const next = progress?.next;
  const assessment = ctx.planSuitability?.latest;
  if (!progress || !next || !assessment || input.assessmentId !== progress.assessmentId) {
    return aiToolError('Use the current READY assessment and its next pending window.', 'PLAN_PHASE_REQUIRED');
  }
  if (input.startWeek !== next.startWeek || input.endWeek !== next.endWeek) {
    return aiToolError(`The next window is weeks ${next.startWeek}–${next.endWeek}. Use these original plan-week numbers.`, 'PLAN_PHASE_OUT_OF_ORDER');
  }
  const previous = progress.completedThroughWeek ? ctx.planSuitability?.stagedPhases : undefined;
  const lastRejection = ctx.planSuitability?.rejectedPhase;
  const rejected = lastRejection?.assessmentId === progress.assessmentId &&
    lastRejection.startWeek === next.startWeek && lastRejection.endWeek === next.endWeek ? lastRejection : undefined;
  const patch = input.workouts === undefined;
  if (patch && (!rejected?.workouts || !Array.isArray(input.sessionTemplates) || !input.sessionTemplates.length)) {
    return aiToolError('Provide the complete schedule. Only a rejected schedule for this same window can be repaired by template ID.', 'INVALID_INPUT');
  }
  if (patch && (input.startDate !== undefined || input.scheduleConstraints !== undefined)) {
    return aiToolError('A template-only repair retains the rejected calendar. To change the calendar, submit the complete window.', 'INVALID_INPUT');
  }
  const startDate = patch ? rejected?.startDate : input.startDate ?? previous?.draft.qualityContract?.startDate;
  if (typeof startDate !== 'string' || !isCalendarDate(startDate) ||
    (previous && previous.draft.qualityContract?.startDate !== startDate)) {
    return aiToolError('Set the agreed calendar startDate on the first window and retain it for the plan.', 'PLAN_PHASE_DATE_INVALID');
  }
  if (previous && input.scheduleConstraints !== undefined) {
    const accepted = previous.draft.scheduleConstraints;
    let repeated: ScheduleConstraints | undefined;
    try {
      repeated = parseScheduleConstraints(input.scheduleConstraints);
    } catch {
      return aiToolError('Invalid repeated schedule constraints. Omit them to keep the accepted schedule.', 'INVALID_INPUT');
    }
    const end = addCalendarDays(startDate, progress.periodWeeks * 7 - 1);
    if (!accepted || !repeated || !isDeepStrictEqual(rulesDuringPlan(accepted, startDate, end), rulesDuringPlan(repeated, startDate, end))) {
      return aiToolError('This window changes the accepted schedule constraints. Omit them to keep the assessed calendar.', 'PLAN_PHASE_CONSTRAINTS_ALREADY_SET');
    }
  }
  const workouts = patch ? rejected?.workouts : input.workouts;
  if (!Array.isArray(workouts)) return aiToolError('Provide the complete schedule for this window.', 'INVALID_INPUT');
  const references = new Map<string, Input[]>();
  for (const entry of workouts) {
    const row = asRecord(entry);
    const weeks = Array.isArray(row?.weekIndexes) ? row.weekIndexes : [row?.weekIndex];
    if (!weeks.length || weeks.some((week) => typeof week !== 'number' || !Number.isInteger(week) ||
      week < next.startWeek || week > next.endWeek)) {
      return aiToolError(`Every schedule entry must fall in weeks ${next.startWeek}–${next.endWeek}.`, 'PLAN_PHASE_OUT_OF_RANGE');
    }
    if (row && typeof row.templateId === 'string') {
      const id = row.templateId.trim();
      const occurrences = references.get(id) ?? [];
      occurrences.push(row);
      references.set(id, occurrences);
    }
  }

  // Accepted occurrences are resolved. Replacing a same-ID definition only changes newly scheduled occurrences.
  const inherited = rejected?.templates ?? previous?.templates;
  const templates = new Map(inherited?.map((item) => [item.id, item]));
  if (input.sessionTemplates !== undefined && !Array.isArray(input.sessionTemplates))
    return aiToolError('sessionTemplates must be an array.', 'INVALID_INPUT');
  const supplied = new Set<string>();
  for (const item of (input.sessionTemplates ?? []) as unknown[]) {
    const template = asRecord(item);
    const id = typeof template?.id === 'string' ? template.id.trim() : '';
    if (!template || !id || supplied.has(id))
      return aiToolError('Supply a unique nonempty id for each session template.', 'INVALID_INPUT');
    supplied.add(id);
    const original = templates.get(id);
    if (patch) {
      const occurrences = references.get(id);
      if (!original || !occurrences?.length)
        return aiToolError(`Template "${id}" is not used by this rejected window. Submit a complete schedule to add or schedule a template.`, 'INVALID_INPUT');
      const changed = Object.keys(template).some((key) => key !== 'id' && !isDeepStrictEqual(template[key], original[key]) &&
        occurrences.some((row) => !(key in row)));
      if (!changed)
        return aiToolError(`Change a field used by a scheduled occurrence of template "${id}". Its submitted fields do not change the rejected schedule.`, 'INVALID_INPUT');
    }
    if (!patch && (typeof template.structureKind !== 'string' || typeof template.text !== 'string' || !template.text.trim())) {
      return aiToolError(`Session template "${id}" requires structureKind and non-empty text in a full window schedule.`, 'INVALID_INPUT');
    }
    templates.set(id, patch ? { ...original, ...template, id } : { ...template, id });
  }
  const { maxTrainingDaysPerWeek, maxDailyMinutes, requiredSports, raceDiscipline } = assessment.constraints;
  const candidate = {
    assessmentId: progress.assessmentId, title: assessment.goalSummary || next.name,
    periodWeeks: progress.periodWeeks, qualityContract: { startDate, maxTrainingDaysPerWeek, maxDailyMinutes, requiredSports, raceDiscipline },
    scheduleConstraints: patch ? rejected?.scheduleConstraints : previous?.draft.scheduleConstraints ?? input.scheduleConstraints,
    sessionTemplates: [...templates.values()], workouts: [...(previous?.draft.workouts ?? []), ...workouts],
  };
  const canPatchTemplates = [...references].some(([id, rows]) => templates.has(id) && rows.some((row) => row.text === undefined));
  return { ok: true as const, candidate, next, progress, workouts, canPatchTemplates };
}

export const planStagePhaseTool: AiToolDef<Input> = buildAiTool({
  name: 'plan.stage_phase',
  description: 'Prepare the complete schedule for the next assessed training window. Each successful window is kept server-side. Follow the returned next window, then present the assembled plan.',
  searchHint: 'build a long training calendar phase by phase',
  applicableSkills: ['plan-builder'], requiresActiveSkill: true,
  kind: 'draft', isReadOnly: true, isConcurrencySafe: false, cost: 'low', maxResultChars: 24_000,
  parameters: {
    type: 'object', description: draftSchema.description, additionalProperties: false,
    required: ['assessmentId', 'startWeek', 'endWeek'],
    properties: {
      assessmentId: draftSchema.properties.assessmentId,
      startWeek: { type: 'integer', minimum: 1 },
      endWeek: { type: 'integer', minimum: 1 },
      startDate: { type: 'string', description: 'Agreed calendar date YYYY-MM-DD for day 1 of week 1. Required on the first submission.' },
      scheduleConstraints: draftSchema.properties.scheduleConstraints,
      sessionTemplates: { ...draftSchema.properties.sessionTemplates,
        description: 'For a complete schedule, include id, structureKind and text in each new definition. After a rejected window, omit workouts to keep its exact schedule and send only changed fields of its referenced template IDs; update notes (and name if it states duration or reps) whenever text changes.',
        items: { ...draftSchema.properties.sessionTemplates.items, required: ['id'] },
      },
      workouts: { ...draftSchema.properties.workouts, minItems: 0 },
    },
  },
  validateInput: async (ctx, input) => {
    const prepared = phaseCandidate(ctx, input);
    if (prepared.ok === false) return prepared;
    const result = await validateCoachPlanCandidate(ctx, prepared.candidate, { ...prepared.next, canPatchTemplates: prepared.canPatchTemplates });
    if (result.ok === false) {
      ctx.planSuitability!.rejectedPhase = {
        assessmentId: prepared.progress.assessmentId, startWeek: prepared.next.startWeek, endWeek: prepared.next.endWeek,
        startDate: prepared.candidate.qualityContract.startDate, scheduleConstraints: prepared.candidate.scheduleConstraints,
        templates: prepared.candidate.sessionTemplates,
        workouts: result.feedback?.length || input.workouts === undefined ? prepared.workouts : undefined,
      };
    }
    return result;
  },
  execute: async (ctx, input) => {
    const prepared = phaseCandidate(ctx, input);
    if (prepared.ok === false) throw new Error(prepared.message);
    const expanded = expandAssessedDraft(ctx, prepared.candidate, undefined, prepared.next.endWeek < prepared.progress.periodWeeks);
    if (expanded.ok === false) throw new Error(expanded.error);
    delete ctx.planSuitability!.rejectedPhase;
    ctx.planSuitability!.stagedPhases = {
      assessmentId: prepared.progress.assessmentId,
      completedThroughWeek: prepared.next.endWeek,
      completedWindows: prepared.progress.completedWindows + 1,
      draft: expanded.data,
      templates: prepared.candidate.sessionTemplates,
    };
    return { kind: 'plan_phase_staged', ...planPhaseProgress(ctx) };
  },
});
