import { Injectable } from '@nestjs/common';
import {
  COMPETITION_IMPACT_CONSTRAINT_TYPES,
  COMPETITION_IMPACT_LEVELS,
  COMPETITION_IMPACT_PHASE_TYPES,
  type CompetitionEventImpactAssessment,
  type CompetitionImpactConstraintType,
  type CompetitionImpactInput,
  type CompetitionImpactLevel,
  type CompetitionImpactPhaseType,
  type CompetitionImpactResult,
} from './competition-impact.types';
import {
  differenceInCompetitionDays,
  parseCompetitionYmd,
} from './competition-calendar.util';

const levelSet = new Set<string>(COMPETITION_IMPACT_LEVELS);
const phaseSet = new Set<string>(COMPETITION_IMPACT_PHASE_TYPES);
const constraintSet = new Set<string>(COMPETITION_IMPACT_CONSTRAINT_TYPES);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected object');
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('expected array');
  return value;
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error('expected bounded non-empty string');
  }
  return value.trim();
}

function ymd(value: unknown, name: string) {
  const result = text(value, 10);
  parseCompetitionYmd(result, name);
  return result;
}

function level(value: unknown): CompetitionImpactLevel {
  if (!levelSet.has(String(value))) throw new Error('invalid impact level');
  return value as CompetitionImpactLevel;
}

function constraintType(value: unknown): CompetitionImpactConstraintType {
  if (!constraintSet.has(String(value))) {
    throw new Error('invalid constraint type');
  }
  return value as CompetitionImpactConstraintType;
}

function jsonScalar(value: unknown): string | number | boolean | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (value === null) return null;
  throw new Error('invalid constraint parameter');
}

function stringArray(value: unknown, maxItems: number, maxLength: number) {
  return array(value)
    .slice(0, maxItems)
    .map((item) => text(item, maxLength));
}

@Injectable()
export class CompetitionImpactValidator {
  validate(raw: unknown, input: CompetitionImpactInput): CompetitionImpactResult {
    const root = object(raw);
    if (root.schemaVersion !== 1) throw new Error('unsupported schemaVersion');
    const assessmentDate = ymd(root.assessmentDate, 'assessmentDate');
    if (assessmentDate !== input.anchorDate) {
      throw new Error('assessmentDate must equal authoritative anchorDate');
    }
    const inputEvents = new Map(input.events.map((event) => [event.id, event]));
    const seen = new Set<string>();

    const eventAssessments = array(root.eventAssessments).map((item) => {
      const value = object(item);
      const eventId = text(value.eventId, 200);
      const event = inputEvents.get(eventId);
      if (!event || seen.has(eventId)) throw new Error('unknown or duplicate eventId');
      seen.add(eventId);
      if (typeof value.relevant !== 'boolean') throw new Error('relevant must be boolean');
      const confidence = Number(value.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('confidence must be between 0 and 1');
      }
      const currentImpactLevel = level(value.currentImpactLevel);
      const phases = array(value.phases).map((phaseValue) => {
        const phase = object(phaseValue);
        if (!phaseSet.has(String(phase.type))) throw new Error('invalid phase type');
        const startDate = ymd(phase.startDate, 'phase.startDate');
        const endDate = ymd(phase.endDate, 'phase.endDate');
        if (endDate < startDate) throw new Error('invalid phase range');
        return {
          type: String(phase.type) as CompetitionImpactPhaseType,
          startDate,
          endDate,
          impactLevel: level(phase.impactLevel),
        };
      });
      const constraints = array(value.constraints).map((constraintValue) => {
        const constraint = object(constraintValue);
        const type = constraintType(constraint.type);
        const startDate = ymd(constraint.startDate, 'constraint.startDate');
        const endDate = ymd(constraint.endDate, 'constraint.endDate');
        if (endDate < startDate) throw new Error('invalid constraint range');
        const rawParameters = constraint.parameters == null ? {} : object(constraint.parameters);
        const parameters: Record<string, string | number | boolean | null> = {};
        for (const [key, parameter] of Object.entries(rawParameters).slice(0, 20)) {
          parameters[key] = jsonScalar(parameter);
        }
        return {
          type,
          startDate,
          endDate,
          strength: level(constraint.strength),
          parameters,
        };
      });
      if (!value.relevant && (phases.length > 0 || constraints.length > 0)) {
        throw new Error('irrelevant event cannot contain phases or constraints');
      }
      if (!value.relevant && currentImpactLevel !== 'LOW') {
        throw new Error('irrelevant event must have LOW currentImpactLevel');
      }

      let influenceWindow: CompetitionEventImpactAssessment['influenceWindow'] =
        null;
      if (value.relevant) {
        const window = object(value.influenceWindow);
        const startDate = ymd(window.startDate, 'influenceWindow.startDate');
        const endDate = ymd(window.endDate, 'influenceWindow.endDate');
        if (endDate < startDate) throw new Error('invalid influence window');
        if (startDate > event.startDate || endDate < event.startDate) {
          throw new Error('influence window must contain event date');
        }
        const preEventWeeks = Number(window.preEventWeeks);
        const postEventWeeks = Number(window.postEventWeeks);
        if (
          !Number.isFinite(preEventWeeks) ||
          !Number.isFinite(postEventWeeks) ||
          preEventWeeks < 0 ||
          postEventWeeks < 0 ||
          preEventWeeks > 104 ||
          postEventWeeks > 52
        ) {
          throw new Error('invalid influence week count');
        }
        const eventEndDate = event.endDate ?? event.startDate;
        const derivedPreWeeks =
          differenceInCompetitionDays(
            parseCompetitionYmd(event.startDate, 'event.startDate'),
            parseCompetitionYmd(startDate, 'influenceWindow.startDate'),
          ) / 7;
        const derivedPostWeeks =
          differenceInCompetitionDays(
            parseCompetitionYmd(endDate, 'influenceWindow.endDate'),
            parseCompetitionYmd(eventEndDate, 'event.endDate'),
          ) / 7;
        if (
          Math.abs(derivedPreWeeks - preEventWeeks) > 1 ||
          Math.abs(derivedPostWeeks - postEventWeeks) > 1
        ) {
          throw new Error('influence week counts do not match influence dates');
        }
        if (
          phases.some(
            (phase) => phase.startDate < startDate || phase.endDate > endDate,
          ) ||
          constraints.some(
            (constraint) =>
              constraint.startDate < startDate || constraint.endDate > endDate,
          )
        ) {
          throw new Error('phases and constraints must stay inside influence window');
        }
        const hasEventPhase = phases.some(
          (phase) =>
            phase.type === 'EVENT' &&
            phase.startDate <= event.startDate &&
            phase.endDate >= event.startDate,
        );
        if (!hasEventPhase) throw new Error('EVENT phase must cover event date');
        influenceWindow = {
          startDate,
          endDate,
          preEventWeeks,
          postEventWeeks,
        };
      }

      const reasoningSummary = text(value.reasoningSummary, 1200);
      const evidence = stringArray(value.evidence, 12, 300);
      const assumptions = stringArray(value.assumptions, 12, 300);
      const riskFlags = stringArray(value.riskFlags, 12, 200);
      if (
        input.athlete.personalizationReadiness === 'none' &&
        value.relevant &&
        (confidence > 0.6 || assumptions.length === 0)
      ) {
        throw new Error('low-data assessments require conservative confidence and assumptions');
      }
      if (
        evidence.some((item) =>
          /\b(injur(?:y|ed|ies)|illness|diagnos|personal best|threshold|vo2|max hr|ftp|lthr)\b/i.test(
            item,
          ),
        )
      ) {
        throw new Error('evidence contains facts absent from authoritative input');
      }

      return {
        eventId,
        relevant: value.relevant,
        confidence,
        currentImpactLevel,
        influenceWindow,
        phases,
        constraints,
        reasoningSummary,
        evidence,
        assumptions,
        riskFlags,
      };
    });
    if (seen.size !== inputEvents.size) {
      throw new Error('eventAssessments must contain every input event exactly once');
    }

    const combined = object(root.combinedImpact);
    const conflicts = array(combined.conflicts).map((item) => {
      const conflict = object(item);
      const eventIds = stringArray(conflict.eventIds, 12, 200);
      if (eventIds.some((id) => !inputEvents.has(id))) {
        throw new Error('conflict references unknown event');
      }
      return {
        eventIds,
        type: text(conflict.type, 120),
        severity: level(conflict.severity),
        summary: text(conflict.summary, 600),
      };
    });
    const assessmentByEvent = new Map(
      eventAssessments.map((assessment) => [assessment.eventId, assessment]),
    );
    const criticalEvents = input.events.filter(
      (event) =>
        event.importance === 'CRITICAL' &&
        assessmentByEvent.get(event.id)?.relevant === true,
    );
    for (let i = 0; i < criticalEvents.length; i += 1) {
      for (let j = i + 1; j < criticalEvents.length; j += 1) {
        const first = criticalEvents[i];
        const second = criticalEvents[j];
        const gap = Math.abs(
          differenceInCompetitionDays(
            parseCompetitionYmd(first.startDate, 'event.startDate'),
            parseCompetitionYmd(second.startDate, 'event.startDate'),
          ),
        );
        if (gap > 42) continue;
        const matchingConflict = conflicts.find(
          (conflict) =>
            conflict.eventIds.includes(first.id) &&
            conflict.eventIds.includes(second.id) &&
            (conflict.severity === 'HIGH' || conflict.severity === 'CRITICAL'),
        );
        if (!matchingConflict) {
          throw new Error('closely spaced CRITICAL events require a high-risk conflict');
        }
      }
    }
    const levelOrder: CompetitionImpactLevel[] = [
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL',
    ];
    const expectedOverall = [...eventAssessments, ...conflicts].reduce(
      (highest, item) => {
        const candidate =
          'currentImpactLevel' in item
            ? item.currentImpactLevel
            : item.severity;
        return levelOrder.indexOf(candidate) > levelOrder.indexOf(highest)
          ? candidate
          : highest;
      },
      'LOW' as CompetitionImpactLevel,
    );
    const combinedOverall = level(combined.overallLevel);
    if (levelOrder.indexOf(combinedOverall) < levelOrder.indexOf(expectedOverall)) {
      throw new Error('combined overallLevel understates event or conflict impact');
    }

    return {
      schemaVersion: 1,
      assessmentDate,
      eventAssessments,
      combinedImpact: {
        overallLevel: combinedOverall,
        conflicts,
        strategySummary: text(combined.strategySummary, 1200),
      },
    };
  }
}
