import type { EndurancePlanBlock, EnduranceWorkRestStep } from '@shared/endurance-workout-ir';
import { isDeepStrictEqual } from 'node:util';
import { planDayMinuteLimit, type PlanQualityContract, type PlanRepairTarget, type PlanWeekTarget } from '@shared/plan-quality';
import type { PlanValidationFeedback } from '../tool.types';

export const PLAN_DRAFT_RESULT_BUDGET = 24_000;

function rounded(value: number) {
  return Number(value.toFixed(2));
}

function elapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = rounded(seconds % 60);
  return [minutes ? `${minutes}m` : '', remainder || !minutes ? `${remainder}s` : ''].join('');
}

type Session = NonNullable<PlanValidationFeedback['mainWorkouts']>[number];
type TimedSteps = NonNullable<Session['timedIntervals']>;

/** Recognize exact alternating steps, including all targets, equipment and stroke. */
function expandedWorkRestSet(blocks: EndurancePlanBlock[]) {
  const steps: EnduranceWorkRestStep[] = [];
  for (const block of blocks) {
    if (block.type === 'repeat') return;
    steps.push(...block.steps);
  }
  const start = steps.findIndex((step) => step.stepKind !== 'WARMUP');
  if (start < 0) return;
  const end = steps.findIndex((step) => step.stepKind === 'COOLDOWN');
  const main = steps.slice(start, end < 0 ? undefined : end);
  const tail = end < 0 ? [] : steps.slice(end);
  const [work, rest] = main;
  if (main.length < 3 || work.stepKind !== 'WORK' ||
    (rest.stepKind !== 'RECOVERY' && rest.stepKind !== 'REST') ||
    tail.some((step) => step.stepKind !== 'COOLDOWN') ||
    !main.every((step, index) => isDeepStrictEqual(step, index % 2 ? rest : work))) return;
  const warmup = steps.slice(0, start);
  const count = Math.ceil(main.length / 2);
  const rests = Math.floor(main.length / 2);
  const terms = [...warmup.map((s) => elapsed(s.duration)),
    `(${count} × ${elapsed(work.duration)} + ${rests} × ${elapsed(rest.duration)})`,
    ...tail.map((s) => elapsed(s.duration))];
  return {
    terms, outsideRepeatsSeconds: [...warmup, ...tail].reduce((sum, s) => sum + s.duration, 0),
    workRestSet: { count, workSeconds: work.duration, restSeconds: rest.duration, endsWithRest: count === rests, expanded: true },
  };
}

/** Recognize the same series when written as a repeat block, optionally followed by a final work step. */
function explicitWorkRestSet(blocks: EndurancePlanBlock[]): TimedSteps['workRestSet'] {
  const index = blocks.findIndex((block) => block.type === 'repeat');
  const group = blocks[index];
  if (group?.type !== 'repeat') return;
  const children = group.children.flatMap((block) => block.steps);
  const [work, rest] = children;
  if (children.length !== 2 || work.stepKind !== 'WORK' || (rest.stepKind !== 'RECOVERY' && rest.stepKind !== 'REST')) return;
  const head = blocks.slice(0, index);
  if (!head.every((block) => block.type !== 'repeat' && block.steps.every((step) => step.stepKind === 'WARMUP'))) return;
  const tail: EnduranceWorkRestStep[] = [];
  for (const block of blocks.slice(index + 1)) {
    if (block.type === 'repeat') return;
    tail.push(...block.steps);
  }
  const finalWork = isDeepStrictEqual(tail[0], work);
  if (!tail.slice(finalWork ? 1 : 0).every((step) => step.stepKind === 'COOLDOWN')) return;
  return { count: group.count + Number(finalWork), endsWithRest: !finalWork, workSeconds: work.duration, restSeconds: rest.duration, expanded: false };
}

/** Keep the codec's duration and ordered timed steps. A conditional repeat or a distance has no exact sum. */
export function timedIntervalBreakdown(blocks: EndurancePlanBlock[], durationSeconds: number | null): TimedSteps | undefined {
  if (durationSeconds == null) return undefined;
  const terms: string[] = [];
  const editableSteps: TimedSteps['editableSteps'] = [];
  let outsideRepeatsSeconds = 0;
  let stepIndex = 0;
  let hasRepeats = false;
  function timedTerm(step: EnduranceWorkRestStep, count: number) {
    stepIndex++;
    if (step.durationMeta?.kind !== 'TIME' || !(step.duration > 0)) return undefined;
    if (step.stepKind === 'WORK' || step.stepKind === 'COOLDOWN') {
      editableSteps.push({ kind: step.stepKind === 'WORK' ? 'work' : 'cooldown', seconds: step.duration, count, stepIndex });
    }
    return elapsed(step.duration);
  }
  for (const block of blocks) {
    if (block.type === 'repeat') {
      if (block.until || !Number.isInteger(block.count) || block.count <= 0) return undefined;
      hasRepeats = true;
      const group = block.children.flatMap((child) => child.steps.map((step) => timedTerm(step, block.count)));
      if (group.includes(undefined)) return undefined;
      terms.push(`${block.count} × (${group.join(' + ')})`);
    } else {
      for (const step of block.steps) {
        const term = timedTerm(step, 1);
        if (!term) return undefined;
        outsideRepeatsSeconds += step.duration;
        terms.push(term);
      }
    }
  }
  const expanded = expandedWorkRestSet(blocks);
  if (expanded) return {
    equation: `${expanded.terms.join(' + ')} = ${elapsed(durationSeconds)}`, outsideRepeatsSeconds: expanded.outsideRepeatsSeconds,
    hasRepeats: true, workRestSet: expanded.workRestSet, editableSteps: editableSteps.filter((step) => step.kind === 'cooldown'),
  };
  const workRestSet = hasRepeats ? explicitWorkRestSet(blocks) : undefined;
  return { equation: `${terms.join(' + ')} = ${elapsed(durationSeconds)}`, outsideRepeatsSeconds, hasRepeats, editableSteps, workRestSet };
}

/* Calculate the largest feasible integer work count while preserving the final recovery convention. */
function durationAtMost(session: Session, capSeconds: number, maxCount = Infinity) {
  const timing = session.timedIntervals;
  if (!timing || session.durationSeconds == null) return;
  const maximum = Math.min(capSeconds, session.durationSeconds);
  const group = timing.workRestSet;
  if (!group) return;
  const unit = group.workSeconds + group.restSeconds;
  const fixed = session.durationSeconds - group.count * unit;
  const count = Math.min(maxCount, group.count, Math.floor((maximum - fixed) / unit));
  if (count < 1) return;
  const rests = count - (group.endsWithRest ? 0 : 1);
  return { count, seconds: fixed + count * unit, reps: `${group.count}→${count} work reps (${rests} rests), ` };
}

/** Show the equivalent repeat DSL only when the original lines also match, including every target token. */
function compactPrescription(text: string, group?: TimedSteps['workRestSet']) {
  if (!group?.expanded) return text;
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim());
  const start = lines.findIndex((line) => /^work\s/i.test(line));
  if (start < 0) return text;
  const pairCount = group.count - (group.endsWithRest ? 0 : 1);
  const length = group.count + pairCount;
  const work = lines[start], rest = lines[start + 1];
  const main = lines.slice(start, start + length);
  if (main.length !== length || !main.every((line, i) => line === (i % 2 ? rest : work))) return text;
  const groupDsl = [`repeat ${pairCount} {`, `  ${work}`, `  ${rest}`, '}', ...(group.endsWithRest ? [] : [work])];
  return [...lines.slice(0, start), ...groupDsl, ...lines.slice(start + length)].join('\n');
}

/** Test one occurrence with every other timed step held constant, including other sessions on that day. */
function singleStepTimeOption(session: Session, daySeconds: number, weekSeconds: number,
  cap: number, target: PlanWeekTarget['durationMinutes']) {
  const timing = session.timedIntervals;
  if (!timing || session.durationSeconds == null) return;
  const cut = daySeconds > cap * 60 || weekSeconds > target.max * 60;
  let repeatOption: string | undefined;
  if (cut && timing.workRestSet) {
    const otherDay = daySeconds - session.durationSeconds;
    const otherWeek = weekSeconds - session.durationSeconds;
    const next = durationAtMost(session, Math.min(cap * 60 - otherDay, target.max * 60 - otherWeek));
    if (next && otherWeek + next.seconds >= target.min * 60)
      repeatOption = `${next.reps}day ${elapsed(otherDay + next.seconds)}, week ${elapsed(otherWeek + next.seconds)}`;
  }
  // Keep the main set intact when a shorter cooldown is sufficient. Extra endurance belongs in work steps.
  const options = cut ? [
    ...timing.editableSteps.filter((s) => s.kind === 'cooldown'),
    ...timing.editableSteps.filter((s) => s.kind === 'work'),
  ] : timing.editableSteps.filter((s) => s.kind === 'work');
  for (const step of options) {
    if (step.kind === 'work' && repeatOption) return repeatOption;
    const min = Math.max(1, Math.ceil(step.seconds + (target.min * 60 - weekSeconds) / step.count));
    const max = Math.floor(step.seconds + Math.min(cap * 60 - daySeconds, target.max * 60 - weekSeconds) / step.count);
    if (max < min) continue;
    // Prefer executable whole minutes, falling back to whole seconds for narrow protocols.
    const wholeMinutes = Math.ceil(min / 60) <= Math.floor(max / 60);
    const low = wholeMinutes ? Math.ceil(min / 60) : min;
    const high = wholeMinutes ? Math.floor(max / 60) : max;
    const unit = wholeMinutes ? 'm' : 's';
    const duration = (cut ? high : low) * (wholeMinutes ? 60 : 1);
    // Avoid suggesting physiological distortions on work steps (e.g. stretching a 45s sprint to 5m or halving a main set).
    if (step.kind === 'work') {
      if (cut && duration < step.seconds * 0.5) continue;
      if (!cut && (duration > step.seconds * 2 || (step.seconds < 90 && duration >= 120))) continue;
    }
    const delta = (duration - step.seconds) * step.count;
    const bounds = low === high ? '' : `, ${low}–${high}${unit}`;
    return `step ${step.stepIndex} ${step.kind} ${elapsed(step.seconds)} → ${elapsed(duration)}${bounds} (day ${elapsed(daySeconds + delta)}, week ${elapsed(weekSeconds + delta)})`;
  }
  return repeatOption;
}

function location(target: PlanRepairTarget): string {
  switch (target.scope) {
    case 'DAY':
      return `W${target.weekIndex}/D${target.dayIndex}${target.sessionIndex ? `/S${target.sessionIndex}` : ''}`;
    case 'WEEK':
      return `W${target.weekIndex}`;
    case 'BLOCK':
      return `W${target.firstWeek}–${target.lastWeek}`;
    case 'PLAN':
      return 'plan';
  }
}

/** Over-cap days share the weekly duration budget. Keep the other days fixed. */
function jointDayBudget(days: Map<number, Session[]>, weekSeconds: number,
  target: PlanWeekTarget['durationMinutes'], contract?: PlanQualityContract) {
  const limits: { day: number; cap: number; sessions: Session[] }[] = [];
  let other = weekSeconds;
  for (const [day, sessions] of days) {
    const cap = planDayMinuteLimit(contract, day);
    if (cap == null || !sessions.length || sessions.some((s) => s.durationSeconds == null)) return;
    limits.push({ day, cap, sessions });
    other -= sessions.reduce((sum, s) => sum + s.durationSeconds!, 0);
  }
  const minimum = Math.max(0, target.min * 60 - other);
  const maximum = Math.min(limits.reduce((sum, day) => sum + day.cap * 60, 0), target.max * 60 - other);
  if (!(maximum > 0) || minimum > maximum) return;
  const budget = `change together: ${limits.map(({ day, cap }) => `D${day} ≤${cap}m`).join(', ')}; combined ${elapsed(minimum)}–${elapsed(maximum)}`;
  // Only the two-single-session case needs an integer search. The general joint budget remains exact.
  if (limits.length !== 2 || limits.some((day) => day.sessions.length !== 1)) return budget;
  const [first, second] = limits.map((day) => day.sessions[0]);
  if (!first.timedIntervals?.workRestSet || !second.timedIntervals?.workRestSet) return budget;
  let a = durationAtMost(first, limits[0].cap * 60);
  while (a) {
    const b = durationAtMost(second, Math.min(limits[1].cap * 60, maximum - a.seconds));
    if (b && a.seconds + b.seconds >= minimum)
      return `${budget}. Option D${first.dayIndex}: ${a.reps}${elapsed(a.seconds)}; D${second.dayIndex}: ${b.reps}${elapsed(b.seconds)}; week ${elapsed(other + a.seconds + b.seconds)}`;
    // Only the explicitly present finite series is searched. A work step is never removed entirely.
    a = durationAtMost(first, a.seconds, a.count - 1);
  }
  return budget;
}

/** Group identical repairs by the resolved prescription, retaining each affected slot. */
function renderRepair(
  feedback: PlanValidationFeedback[],
  weekTargets: PlanWeekTarget[] | undefined,
  contract: PlanQualityContract | undefined,
  repairableWeeks: number[],
  patchTemplates = false,
) {
  const byCorrection = new Map<string, Set<string>>();
  const templates = new Map<string, Map<string, Set<string>>>();
  const previews = new Map<string, string>();
  const overBudgetDays = new Map<number, Map<number, Session[]>>();
  const weekDurationIssues = new Set<number>();
  for (const { code, target, mainWorkouts } of feedback) {
    if (code === 'WEEK_TARGET_DURATION' && target.scope === 'WEEK') weekDurationIssues.add(target.weekIndex);
    if (code !== 'DAILY_TIME_BUDGET' || target.scope !== 'DAY') continue;
    const days = overBudgetDays.get(target.weekIndex) ?? new Map<number, Session[]>();
    days.set(target.dayIndex, mainWorkouts ?? []);
    overBudgetDays.set(target.weekIndex, days);
  }
  for (const issue of feedback) {
    const { target } = issue;
    const maxDailyMinutes = target.scope === 'DAY' ? planDayMinuteLimit(contract, target.dayIndex) : undefined;
    const sessions = issue.mainWorkouts ?? [];
    const loadRelevant = [
      'WEEK_TARGET_LOAD',
      'RECOVERY_NOT_REDUCED',
      'RECOVERY_PRESCRIPTION_UNCHANGED',
    ].includes(issue.code);
    const components = sessions.map((session) => {
      const duration =
        session.durationSeconds == null
          ? '?'
          : `${rounded(session.durationSeconds / 60)}m`;
      const ref = session.templateId ?? 'inline';
      if (
        session.templateId &&
        session.prescription &&
        (target.scope === 'WEEK' || target.scope === 'DAY')
      ) {
        const versions =
          templates.get(session.templateId) ?? new Map<string, Set<string>>();
        const text = session.prescription.trim();
        if (!previews.has(text)) previews.set(text, compactPrescription(text, session.timedIntervals?.workRestSet));
        const slots = versions.get(text) ?? new Set<string>();
        slots.add(
          `W${target.weekIndex}/D${session.dayIndex}/S${session.sessionIndex}`,
        );
        versions.set(text, slots);
        templates.set(session.templateId, versions);
      }
      const day = target.scope === 'DAY' ? '' : `D${session.dayIndex}/`;
      const load =
        !loadRelevant || session.estimatedLoad == null
          ? ''
          : ` load ${rounded(session.estimatedLoad)} ${session.method ?? ''}`;
      return `${day}S${session.sessionIndex} ${ref}=${duration}${load}`;
    });
    const knownWeek = (target.scope === 'WEEK' || target.scope === 'DAY')
      ? issue.weeks?.find((week) => week.weekIndex === target.weekIndex) : undefined;
    const weekTarget = knownWeek && weekTargets?.[knownWeek.weekIndex - 1]?.durationMinutes;
    const weekSeconds = knownWeek?.unknownDurationSessions === 0 ? knownWeek.knownDurationSeconds : undefined;
    let description = issue.message;
    if (issue.code === 'WEEK_TARGET_DURATION' && target.scope === 'WEEK') {
      const known = issue.weeks?.find(
        (week) => week.weekIndex === target.weekIndex,
      )?.knownDurationSeconds;
      const range = weekTargets?.[target.weekIndex - 1]?.durationMinutes;
      if (range && known != null) {
        const minutes = known / 60;
        const tooShort = minutes < range.min;
        const minimum = rounded(tooShort ? range.min - minutes : minutes - range.max);
        const maximum = rounded(tooShort ? range.max - minutes : minutes - range.min);
        const change = `${tooShort ? 'add' : 'cut'} ${minimum === maximum ? minimum : `${minimum}–${maximum}`}m`;
        description = `${rounded(minutes)}m known, target ${range.min}–${range.max}m, ${change}`;
      }
    } else if (
      issue.code === 'DAILY_TIME_BUDGET' &&
      maxDailyMinutes &&
      sessions.length
    ) {
      const daySeconds = sessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0);
      const minutes = daySeconds / 60;
      const dayFullyTimed = sessions.every((session) => session.durationSeconds != null);
      description = `${rounded(minutes)}m known, daily cap ${maxDailyMinutes}m, cut at least ${rounded(minutes - maxDailyMinutes)}m`;
      for (const session of sessions) {
        const timing = session.timedIntervals;
        if (!timing || session.durationSeconds == null) continue;
        description += `. S${session.sessionIndex}: ${timing.equation}`;
        if (dayFullyTimed && timing.hasRepeats && !timing.workRestSet?.expanded) {
          const otherSeconds = daySeconds - session.durationSeconds;
          const available = maxDailyMinutes * 60 - otherSeconds - timing.outsideRepeatsSeconds;
          description += available < 0
            ? `; other work already exceeds the cap by ${elapsed(-available)} before repeats`
            : `; keeping other work fixed leaves at most ${elapsed(available)} for all repeats in S${session.sessionIndex}`;
        }
      }
    } else if (target.scope === 'DAY') {
      // The grouped slot list already identifies these coordinates, including inline overrides.
      description = description.replace(
        new RegExp(
          `week ${target.weekIndex},? day ${target.dayIndex}\\b`,
          'ig',
        ),
        'this slot',
      );
    }
    const overBudgetDayCount = knownWeek ? overBudgetDays.get(knownWeek.weekIndex)?.size ?? 0 : 0;
    if (knownWeek && weekTarget && weekSeconds != null && overBudgetDayCount >= 2) {
      const days = overBudgetDays.get(knownWeek.weekIndex)!;
      const reportAtDay = !weekDurationIssues.has(knownWeek.weekIndex) && target.scope === 'DAY' &&
        issue.code === 'DAILY_TIME_BUDGET' && target.dayIndex === days.keys().next().value;
      if (issue.code === 'WEEK_TARGET_DURATION' || reportAtDay) {
        const joint = jointDayBudget(days, weekSeconds, weekTarget, contract);
        if (joint) description += `; ${joint}`;
      }
    }
    // A single step cannot resolve violations on two distinct days. Keep the aggregate budgets in that case.
    if (weekTarget && weekSeconds != null && weekSeconds > 0 &&
      ((issue.code === 'DAILY_TIME_BUDGET' && overBudgetDayCount === 1) ||
        (issue.code === 'WEEK_TARGET_DURATION' && !overBudgetDayCount))) {
      for (const session of sessions) {
        const onDay = sessions.filter((entry) => entry.dayIndex === session.dayIndex);
        if (onDay.some((entry) => entry.durationSeconds == null)) continue;
        const cap = planDayMinuteLimit(contract, session.dayIndex);
        if (cap === undefined) continue;
        const total = onDay.reduce((sum, entry) => sum + entry.durationSeconds!, 0);
        const option = singleStepTimeOption(session, total, weekSeconds, cap, weekTarget);
        if (option) {
          const slot = target.scope === 'DAY' ? `S${session.sessionIndex}` : `D${session.dayIndex}/S${session.sessionIndex}`;
          const template = patchTemplates && session.templateId ? ` edit ${session.templateId}.text` : '';
          description += `; one-slot option ${slot}${template}: ${option}`;
          break;
        }
      }
    }
    if (loadRelevant && issue.weeks?.length) {
      const trend = issue.weeks
        .map(
          (week) =>
            `W${week.weekIndex} ${week.phase ?? ''} load ${week.totalEstimatedLoad ?? '?'} (${week.unknownLoadSessions ?? 0} unknown)`,
        )
        .join(', ');
      description += `; ${trend}`;
    }
    const detail = `${issue.code}: ${description}${components.length ? ` [${components.join(', ')}]` : ''}`;
    const slots = byCorrection.get(detail) ?? new Set<string>();
    slots.add(location(target));
    byCorrection.set(detail, slots);
  }
  const lines = [...byCorrection].map(
    ([detail, slots]) => `${[...slots].join(', ')} — ${detail}`,
  );
  for (const [id, versions] of templates) {
    for (const [text, slots] of versions) {
      const resolvedAt =
        versions.size === 1 ? '' : ` at ${[...slots].join(', ')}`;
      const compact = previews.get(text) ?? text;
      const preview = compact !== text || patchTemplates ? compact : text.replace(/\s+/g, ' ');
      lines.push(
        `${patchTemplates ? 'Current ' : ''}${id}${resolvedAt}: ${preview.length <= 240 ? preview : preview.slice(0, 239) + '…'}`,
      );
    }
  }
  if (repairableWeeks.length)
    lines.unshift(
      `Use the same assessmentId. Repair weeks [${repairableWeeks.join(', ')}]: send repairWeeks and the complete schedule entries for the weeks you replace. Override changed sessionTemplates by their existing id; reference unchanged templates by id. Include every affected scheduled occurrence.`,
    );
  return lines.join('\n');
}

function compactRanges(indexes: number[]) {
  const runs: string[] = [];
  for (let i = 0; i < indexes.length; i++) {
    const start = indexes[i];
    while (indexes[i + 1] === indexes[i] + 1) i++;
    runs.push(start === indexes[i] ? String(start) : `${start}–${indexes[i]}`);
  }
  return runs.join(',');
}

function weeksOf(target: PlanRepairTarget) {
  if (target.scope === 'PLAN') return [];
  if (target.scope === 'BLOCK')
    return Array.from(
      { length: target.lastWeek - target.firstWeek + 1 },
      (_, i) => target.firstWeek + i,
    );
  return [target.weekIndex];
}

function fitsToolResult(message: string) {
  // Reserve the complete SDK validation error envelope, including JSON escaping.
  return (
    JSON.stringify({
      error: message,
      code: 'PLAN_QUALITY_INVALID',
      stage: 'validate_input',
    }).length <= PLAN_DRAFT_RESULT_BUDGET
  );
}

export function formatPlanDraftRepair(
  feedback: PlanValidationFeedback[],
  weekTargets: PlanWeekTarget[] | undefined,
  contract: PlanQualityContract | undefined,
  repairableWeeks: number[],
  stage?: { startWeek: number; endWeek: number; canPatchTemplates?: boolean },
) {
  let windowInstruction: string | undefined;
  if (stage) {
    const weeks = `weeks ${stage.startWeek}–${stage.endWeek}`;
    windowInstruction = stage.canPatchTemplates
      ? `Retry plan.stage_phase for ${weeks} with the same assessmentId, startWeek and endWeek. To edit a template prescription, send only sessionTemplates with its existing id, the revised text (complete workout DSL), and matching notes (plus name if it states duration or reps); omit workouts. For an inline workout or schedule change, send the complete schedule for this window. Earlier accepted weeks are retained.`
      : `Resubmit plan.stage_phase with the complete schedule for ${weeks}. Send only changed template definitions and refer to unchanged ones by id. Earlier accepted weeks are retained.`;
  }
  const scope = stage ? [] : repairableWeeks;
  const detail = renderRepair(
    feedback,
    weekTargets,
    contract,
    scope,
    stage?.canPatchTemplates,
  );
  const full = windowInstruction ? `${windowInstruction}\n${detail}` : detail;
  if (fitsToolResult(full)) return full;

  const byCode = new Map<string, { plan: boolean; weeks: Set<number> }>();
  const affected = new Set<number>();
  for (const { code, target } of feedback) {
    const scope = byCode.get(code) ?? { plan: false, weeks: new Set<number>() };
    if (target.scope === 'PLAN') scope.plan = true;
    for (const week of weeksOf(target)) {
      scope.weeks.add(week);
      affected.add(week);
    }
    byCode.set(code, scope);
  }
  const weeks = [...affected].sort((a, b) => a - b);
  const summary = [...byCode].map(([code, scope]) => {
    const indexes = [...scope.weeks].sort((a, b) => a - b);
    const ranges = compactRanges(indexes);
    const coverage =
      ranges.length <= 220
        ? ranges
        : `${indexes[0]}–${indexes.at(-1)} (${indexes.length} affected weeks)`;
    return `${code}: ${[scope.plan ? 'plan' : '', coverage ? `weeks ${coverage}` : ''].filter(Boolean).join(', ')}`;
  });
  const overview = [
    'All rejection categories and their scope:',
    ...summary,
    windowInstruction ?? (scope.length
      ? 'Fix the following complete weeks first, then revalidate the merged draft.'
      : 'Regenerate the full candidate. Resolve all plan-wide requirements and apply these corrections across the affected weeks.'),
  ].join('\n');
  const select = (batch: number[]) => {
    const selected = new Set(batch);
    return feedback.filter(
      ({ target }) =>
        target.scope === 'PLAN' ||
        weeksOf(target).some((week) => selected.has(week)),
    );
  };
  // Keep complete weeks together. A partial repair retains all other scheduled sessions.
  let low = 1,
    high = weeks.length;
  let best: string | undefined;
  while (low <= high) {
    const count = Math.floor((low + high) / 2);
    const batch = weeks.slice(0, count);
    const detail = renderRepair(
      select(batch),
      weekTargets,
      contract,
      scope.length ? batch : [],
      stage?.canPatchTemplates,
    );
    const message = `${overview}\n${detail}`;
    if (fitsToolResult(message)) {
      best = message;
      low = count + 1;
    } else high = count - 1;
  }
  if (best) return best;

  // A single malformed session can itself exceed the output budget. Retain all
  // categories and scopes above and one actionable example per category in this unit.
  const batch = weeks.slice(0, 1);
  const examples = new Map<string, string>();
  for (const { code, message, target } of select(batch)) {
    if (!examples.has(code))
      examples.set(
        code,
        `${location(target)} ${code}: ${message.slice(0, 180)}`,
      );
  }
  const action = scope.length
    ? `Use the same assessmentId; send repairWeeks [${batch.join(',')}] and replace its whole schedule.`
    : '';
  return [overview, action, ...examples.values()].filter(Boolean).join('\n');
}
