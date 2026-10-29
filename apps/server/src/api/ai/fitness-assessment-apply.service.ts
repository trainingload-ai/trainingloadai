import { ConflictException, Injectable } from '@nestjs/common';
import type {
  FitnessAssessmentResult,
  FitnessConfirmation,
} from '@shared/fitness-assessment';
import { Prisma, SportType, UserFitnessMetricType } from '@prisma/client';
import {
  FitnessCalculationService,
  AssessmentContext,
  FrozenFitnessInput,
} from '@/fitness-calculation/fitness-calculation.service';
import { FitnessEvidenceReader } from '@/fitness-calculation/fitness-evidence.reader';
import {
  fitnessStorageValue,
  fitnessAdoptionPublicationReady,
} from '@/fitness-calculation/fitness-metric-values';
import { fingerprint, localDay } from '@/fitness-calculation/fitness-input';
import { lockFitnessUser } from '@/prisma/fitness-write-lock';
import {
  fitnessMethod,
  fitnessApplicationEnabled,
  methodDisabled,
} from '@/fitness-calculation/fitness-methods';
import { UserService } from '@/api/user/user.service';
import {
  CoachActionService,
  RecordCoachActionResult,
} from './core/coach-action.service';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function isExplicitFitnessConsent(text: string) {
  return /^(?:应用(?:吧|这个|刚才的结果)?|确认(?:应用|采用|保存)|采用(?:吧|这个结果)?|apply(?: it)?|confirm apply)[。.!！\s]*$/i.test(
    text.trim(),
  );
}
@Injectable()
export class FitnessAssessmentApplyService {
  constructor(
    private readonly calculations: FitnessCalculationService,
    private readonly reader: FitnessEvidenceReader,
    private readonly users: UserService,
    private readonly actions: CoachActionService,
    private readonly consent: AiDataConsentService,
  ) {}
  async apply(
    ctx: AssessmentContext,
    args: { calculationId: string; applyOptionId: string },
    current: {
      text: string;
      confirmation?: FitnessConfirmation;
      turnStartedAt: Date;
    },
  ) {
    await this.consent.assertGranted(ctx.userId);
    const initial = await this.calculations.calculation(
      ctx,
      args.calculationId,
    );
    let canonical: FitnessAssessmentResult;
    const result = await this.actions.run({
      userId: ctx.userId,
      type: 'USER_THRESHOLD_UPDATE',
      riskTier: 'HIGH',
      sid: ctx.sessionId,
      replay: async (tx) => {
        await lockFitnessUser(tx, ctx.userId);
        const row = await tx.fitnessCalculation.findUniqueOrThrow({
          where: { id: initial.id },
        });
        if (row.appliedAt) {
          if (row.appliedOptionId !== args.applyOptionId)
            throw new ConflictException('Different option already applied');
          const receipt =
            row.receipt as unknown as RecordCoachActionResult<unknown>;
          return {
            ...receipt,
            createdAt: new Date(receipt.createdAt),
            undoUntil: null,
          };
        }
        return null;
      },
      exec: async (tx) => {
        const c = await tx.fitnessCalculation.findUniqueOrThrow({
          where: { id: initial.id },
          include: { task: true },
        });
        canonical = c.result as unknown as FitnessAssessmentResult;
        const input = c.input as unknown as FrozenFitnessInput;
        if (fingerprint(input) !== c.inputHash)
          throw new ConflictException('STALE');
        const option = canonical.applyOptions.find(
          (o) => o.id === args.applyOptionId,
        );
        const method = fitnessMethod(c.methodId);
        if (
          !method ||
          method.version !== c.methodVersion ||
          method.policyVersion !== c.policyVersion ||
          c.state !== 'COMPLETED' ||
          !option ||
          option.changes.some((change) => change.metric === 'VDOT') ||
          methodDisabled(c.methodId) ||
          !fitnessApplicationEnabled(c.methodId)
        )
          throw new ConflictException('METHOD_UNAVAILABLE');
        if (
          !c.presentedAt ||
          c.presentedAt >= current.turnStartedAt ||
          c.task.revision !== c.taskRevision ||
          !c.applyExpiresAt ||
          c.applyExpiresAt <= new Date() ||
          option.effectiveDate !== localDay(new Date(), input.timezone) ||
          fingerprint(canonical) !== c.resultHash
        )
          throw new ConflictException('STALE');
        if (current.confirmation) {
          const f = current.confirmation;
          if (
            f.calculationId !== c.id ||
            f.applyOptionId !== option.id ||
            f.proposalDigest !== option.proposalDigest
          )
            throw new ConflictException('CONFIRMATION_REQUIRED');
        } else {
          const pending = await tx.fitnessCalculation.findMany({
            where: {
              userId: ctx.userId,
              task: {
                sessionId: ctx.sessionId,
                branchId: ctx.branchId ?? null,
              },
              appliedAt: null,
              presentedAt: { not: null },
              applyExpiresAt: { gt: new Date() },
              state: 'COMPLETED',
            },
            select: {
              taskRevision: true,
              methodId: true,
              methodVersion: true,
              policyVersion: true,
              task: { select: { revision: true } },
            },
          });
          const validPending = pending.filter((p) => {
            const registered = fitnessMethod(p.methodId);
            return (
              p.taskRevision === p.task.revision &&
              registered?.version === p.methodVersion &&
              registered?.policyVersion === p.policyVersion &&
              fitnessApplicationEnabled(p.methodId)
            );
          });
          const previousAssistant = await tx.aiCoachMessage.findFirst({
            where: {
              userId: ctx.userId,
              sessionId: ctx.sessionId,
              role: 'ASSISTANT',
            },
            orderBy: { sequence: 'desc' },
            select: { id: true },
          });
          if (
            validPending.length !== 1 ||
            previousAssistant?.id !== c.presentedMessageId ||
            !isExplicitFitnessConsent(current.text)
          )
            throw new ConflictException('CONFIRMATION_REQUIRED');
        }
        if (!(await fitnessAdoptionPublicationReady(tx)))
          throw new ConflictException('FITNESS_MIGRATION_REQUIRED');
        const selection = await this.reader.selection(
          ctx.userId,
          input.request,
          { from: new Date(input.window.from), to: new Date(input.window.to) },
          tx,
        );
        const baseline = await this.reader.baseline(
          ctx.userId,
          input.request.sport,
          tx,
        );
        if (
          selection.hash !== c.selectionHash ||
          baseline.hash !== c.baselineHash
        )
          throw new ConflictException('STALE');
        const storageSport = option.changes.every(
          (change) => change.metric === 'VO2_MAX',
        )
          ? SportType.UNKNOWN
          : option.sport;
        const written = await this.users.applyFitnessEstimateBatch({
          userId: ctx.userId,
          sport: storageSport,
          effectiveDate: option.effectiveDate,
          changes: option.changes.map((x) => ({
            metric: x.metric as UserFitnessMetricType,
            value: fitnessStorageValue(x),
          })),
          calculationId: c.id,
          tx,
          provenance: json({
            method: canonical.method,
            adoptionBasis:
              canonical.status === 'OBSERVATION_ONLY'
                ? 'USER_SELECTED_OBSERVATION'
                : 'USER_SELECTED_ESTIMATE',
            limitations: canonical.limitations,
            evidence: canonical.evidence,
            inputHash: c.inputHash,
            proposalDigest: option.proposalDigest,
            confirmedAt: ctx.now.toISOString(),
            presentedMessageId: c.presentedMessageId,
          }),
        });
        const effective = await this.reader.baseline(
          ctx.userId,
          input.request.sport,
          tx,
        );
        if (
          option.changes.some(
            (change) =>
              effective.values[change.metric] === undefined ||
              Math.abs(
                effective.values[change.metric]! - fitnessStorageValue(change),
              ) >
                1e-12 * Math.max(1, Math.abs(fitnessStorageValue(change))),
          )
        )
          throw new ConflictException('REFERENCE_CONFLICT');
        return {
          forwardData: json(option),
          reverseData: json(written.before),
          summary: `${option.sport} ${option.changes.map((c) => `${c.metric}: ${c.value} ${c.unit}`).join(', ')}`,
          payloadForUi: {
            calculationId: c.id,
            changes: option.changes,
            sport: option.sport,
            effectiveDate: option.effectiveDate,
            effectiveValues: effective.values,
            refreshState: 'PENDING',
            zoneImpact:
              'Configured zones using the adopted metric may change; custom zones are unchanged.',
          },
        };
      },
      finalize: async (tx, receipt) => {
        await tx.fitnessCalculation.update({
          where: { id: initial.id },
          data: {
            appliedAt: new Date(),
            appliedOptionId: args.applyOptionId,
            appliedActionId: receipt.actionId,
            receipt: json(receipt),
            postProcessState: 'PENDING',
            nextAttemptAt: new Date(),
          },
        });
      },
    });
    return {
      kind: 'mutation_applied',
      ok: true,
      actionId: result.actionId,
      type: result.type,
      riskTier: result.riskTier,
      summary: result.summary,
      undoUntil: null,
      payload: result.payloadForUi,
    };
  }
}
