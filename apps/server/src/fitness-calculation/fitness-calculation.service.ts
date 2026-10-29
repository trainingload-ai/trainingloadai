import {
  calculateFitnessPreview,
  type FitnessPreviewEvidence,
  type PreviewRecipe,
} from '@/algorithm/fitness-preview';
import { resolveEffectiveActivityVo2Max } from '@/algorithm/vo2max-source';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma, UserFitnessMetricType } from '@prisma/client';
import type {
  FitnessAssessmentResult,
  FitnessReason,
  FitnessStatus,
  FitnessCandidate,
} from '@shared/fitness-assessment';
import {
  calculateFieldLthr,
  calculateObservedLthrCandidate,
  HeartRateSample,
} from '@/algorithm/fitness-lthr';
import { calculateCp, measuredPowerPeaks } from '@/algorithm/fitness-cp';
import { resolveMeasuredPowerEvidence } from '@/training-load/measured-power-evidence';
import { validateFitnessMetricCandidate } from '@/api/user/fitness-metric-validator';
import {
  fitnessMethod,
  methodDisabled,
  fitnessApplicationEnabled,
  normalizeFitnessMetric,
} from './fitness-methods';
import { FitnessEvidenceReader } from './fitness-evidence.reader';
import {
  fingerprint,
  canonicalFitnessNumber,
  localDay,
  dateBoundary,
  validateEvidenceRequest,
  EvidenceRequest,
} from './fitness-input';
import { fitnessStorageValue } from './fitness-metric-values';
import { lockFitnessUser } from '@/prisma/fitness-write-lock';

export type AssessmentContext = {
  userId: string;
  sessionId: string;
  branchId?: string | null;
  now: Date;
};
export type FrozenFitnessInput = {
  request: EvidenceRequest;
  timezone: string;
  window: { from: string; to: string };
  baseline: Awaited<ReturnType<FitnessEvidenceReader['baseline']>>;
  evidence: FitnessAssessmentResult['evidence'];
  reason?: FitnessReason;
  protocol?: 'TEST' | 'ORDINARY' | 'SKIP';
  samples?: HeartRateSample[];
  sampleSeconds?: number;
  peaks?: Array<{ seconds: number; value: number }>;
  preview?: FitnessPreviewEvidence;
  sourceChecksummed: boolean;
};
const json = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (_key, value) =>
      typeof value === 'number' ? canonicalFitnessNumber(value) : value,
    ),
  ) as Prisma.InputJsonValue;
@Injectable()
export class FitnessCalculationService {
  private readonly logger = new Logger(FitnessCalculationService.name);
  private readonly inFlight = new Set<string>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: FitnessEvidenceReader,
  ) {}
  timezone(userId: string) {
    return this.reader.timezone(userId);
  }
  async task(context: AssessmentContext, id: string) {
    const task = await this.prisma.fitnessAssessmentTask.findFirst({
      where: {
        id,
        userId: context.userId,
        sessionId: context.sessionId,
        branchId: context.branchId ?? null,
      },
    });
    if (!task) throw new NotFoundException('Assessment task not found');
    return task;
  }
  async calculation(context: AssessmentContext, id: string) {
    const c = await this.prisma.fitnessCalculation.findFirst({
      where: {
        id,
        userId: context.userId,
        task: {
          sessionId: context.sessionId,
          branchId: context.branchId ?? null,
        },
      },
      include: { task: true },
    });
    if (!c) throw new NotFoundException('Calculation not found');
    return c;
  }
  async prepare(
    context: AssessmentContext,
    request: EvidenceRequest,
  ): Promise<FitnessAssessmentResult> {
    request = {
      ...request,
      metric: normalizeFitnessMetric(
        request?.metric,
      ) as EvidenceRequest['metric'],
    };
    validateEvidenceRequest(request);
    if (this.inFlight.has(context.userId))
      throw new ConflictException('Assessment already in progress');
    this.inFlight.add(context.userId);
    const leaseOwner = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockFitnessUser(tx, context.userId);
        const state = await tx.fitnessEvidenceRevision.upsert({
          where: { userId: context.userId },
          create: { userId: context.userId },
          update: {},
        });
        if (state.leaseUntil && state.leaseUntil > new Date())
          throw new ConflictException('Assessment already in progress');
        await tx.fitnessEvidenceRevision.update({
          where: { userId: context.userId },
          data: { leaseOwner, leaseUntil: new Date(Date.now() + 120000) },
        });
      });
      return await this.prepareInternal(context, request, leaseOwner);
    } finally {
      this.inFlight.delete(context.userId);
      await this.prisma.fitnessEvidenceRevision.updateMany({
        where: { userId: context.userId, leaseOwner },
        data: { leaseOwner: null, leaseUntil: null },
      });
    }
  }
  private async prepareInternal(
    context: AssessmentContext,
    request: EvidenceRequest,
    leaseOwner: string,
  ): Promise<FitnessAssessmentResult> {
    const method = fitnessMethod(request.methodId);
    if (
      !method ||
      methodDisabled(method.id) ||
      !method.metrics.includes(request.metric) ||
      !method.sports.includes(request.sport)
    )
      throw new BadRequestException('METHOD_UNAVAILABLE');
    const { taskId: requestedTask, ...normalized } = request;
    const task = await this.prisma.$transaction(async (tx) => {
      await lockFitnessUser(tx, context.userId);
      let row = requestedTask
        ? await tx.fitnessAssessmentTask.findFirst({
            where: {
              id: requestedTask,
              userId: context.userId,
              sessionId: context.sessionId,
              branchId: context.branchId ?? null,
            },
          })
        : null;
      if (requestedTask && !row)
        throw new NotFoundException('Assessment task not found');
      if (!row)
        row = await tx.fitnessAssessmentTask.create({
          data: {
            userId: context.userId,
            sessionId: context.sessionId,
            branchId: context.branchId ?? null,
            request: json(normalized),
          },
        });
      else if (fingerprint(row.request) !== fingerprint(normalized))
        row = await tx.fitnessAssessmentTask.update({
          where: { id: row.id },
          data: {
            request: json(normalized),
            revision: { increment: 1 },
            facts: {},
            stage: 'EVIDENCE',
          },
        });
      return row;
    });
    const tz = await this.reader.timezone(context.userId);
    const window = tz
      ? this.reader.resolveWindow(request, tz, context.now)
      : { from: context.now, to: context.now };
    const selection = tz
      ? await this.reader.selection(context.userId, request, window)
      : { rows: [], healthRows: [], truncated: false, hash: fingerprint([]) };
    const baseline = await this.reader.baseline(context.userId, request.sport);
    const ready = selection.rows.filter((a) => {
      const end =
        a.endTime ??
        (a.startTime && a.elapsedTime != null
          ? new Date(a.startTime.getTime() + a.elapsedTime * 1000)
          : null);
      return (
        a.processingStatus === 'READY' && a.startTime && end && end <= window.to
      );
    });
    const processing = selection.rows.some(
      (a) =>
        !['READY', 'FAILED', 'PARTIAL_FAILED'].includes(a.processingStatus),
    );
    const evidence: FitnessAssessmentResult['evidence'] = {
      activityCount: selection.rows.length,
      readyCount: ready.length,
      includedCount: 0,
      truncated: selection.truncated,
      from: (request.scope.kind === 'ACTIVITY' && ready[0]?.startTime
        ? ready[0].startTime
        : window.from
      ).toISOString(),
      to: (request.scope.kind === 'ACTIVITY' && ready[0]
        ? (ready[0].endTime ??
          new Date(
            ready[0].startTime!.getTime() + (ready[0].elapsedTime ?? 0) * 1000,
          ))
        : window.to
      ).toISOString(),
      latestEvidenceAt: ready[0]?.startTime?.toISOString() ?? null,
      activityHashIds: [],
      candidateListTruncated: ready.length > 20,
      activities: ready.slice(0, 20).map((a) => ({
        hashId: a.hashId,
        label: `${a.startTime && tz ? localDay(a.startTime, tz) : ''} ${a.activityName ?? a.sportType}`,
      })),
      checks: [],
    };
    const input: FrozenFitnessInput = {
      request: normalized,
      timezone: tz ?? '',
      window: { from: evidence.from, to: evidence.to },
      baseline,
      evidence,
      sourceChecksummed: true,
    };
    try {
      if (method.recipe === 'UNAVAILABLE') input.reason = 'METHOD_UNAVAILABLE';
      else if (!tz) input.reason = 'TIMEZONE_REQUIRED';
      else if (selection.truncated) input.reason = 'RESOURCE_LIMIT';
      else if (method.recipe === 'DAILY_RESTING_HR') {
        if (
          request.scope.kind === 'ACTIVITY' ||
          (request.scope.kind === 'RECENT' && request.scope.asOf)
        )
          input.reason = 'SCOPE_UNSUPPORTED';
        else {
          input.preview = {
            performances: [],
            heartRatePeaks: [],
            vo2: [],
            daily: selection.healthRows
              .filter(
                (r) =>
                  r.timezone === tz && r.unit === 'bpm' && r.value !== null,
              )
              .map((r) => ({
                date: r.date.toISOString(),
                value: r.value!,
                provider: r.selectedProvider ?? 'UNKNOWN',
              })),
          };
          evidence.dailyRecordCount = input.preview.daily.length;
          evidence.latestEvidenceAt =
            selection.healthRows.at(-1)?.date.toISOString() ?? null;
          if (!input.preview.daily.length)
            input.reason = selection.healthRows.length
              ? 'QUALITY_REJECTED'
              : 'MISSING_SIGNAL';
        }
      } else if (!selection.rows.length) input.reason = 'NO_MATCHING_ACTIVITY';
      else if (!ready.length) input.reason = 'MISSING_SIGNAL';
      else if (method.recipe === 'HR_OBSERVATION') {
        let sampleCount = 0;
        let hasHeartRate = false;
        let bestMean = -Infinity;
        for (const activity of ready) {
          if (
            request.segment &&
            request.segment.activityHashId !== activity.hashId
          )
            continue;
          const rows = await this.reader.samples(activity.id);
          sampleCount += rows.length;
          if (sampleCount > 300_000) {
            input.reason = 'RESOURCE_LIMIT';
            evidence.truncated = true;
            break;
          }
          const duration = activity.endTime
            ? (activity.endTime.getTime() - activity.startTime!.getTime()) /
              1000
            : activity.elapsedTime!;
          const samples = rows
            .map((r) => ({
              seconds: r.epochSeconds - activity.startTime!.getTime() / 1000,
              heartRate: r.heartRate,
            }))
            .filter((r) => r.seconds >= 0 && r.seconds <= duration);
          hasHeartRate ||= samples.some((r) => r.heartRate !== null);
          const cadence = activity.sampleSec ?? 1;
          const observed = request.segment
            ? {
                ...calculateFieldLthr(
                  samples,
                  request.segment.startSeconds,
                  cadence,
                ),
                windowStartSec: request.segment.startSeconds,
              }
            : calculateObservedLthrCandidate(samples, cadence);
          if (
            !observed ||
            ('valid' in observed && !observed.valid) ||
            observed.rawMean === null ||
            observed.rawMean <= bestMean
          )
            continue;
          bestMean = observed.rawMean;
          input.samples = samples;
          input.sampleSeconds = cadence;
          input.sourceChecksummed = activity.parquetFiles.some(
            (f) => f.type === 'record' && !!f.checksum,
          );
          evidence.segment = {
            activityHashId: activity.hashId,
            startSeconds: observed.windowStartSec,
            endSeconds: observed.windowStartSec + 1800,
          };
          evidence.checks = observed.checks;
          evidence.includedCount = 1;
          evidence.activityHashIds = [activity.hashId];
          evidence.latestEvidenceAt = activity.startTime!.toISOString();
        }
        if (!input.reason && !input.samples)
          input.reason = hasHeartRate ? 'QUALITY_REJECTED' : 'MISSING_SIGNAL';
      } else if (method.recipe === 'HR_TEST_SEGMENT') {
        if (!request.segment) {
          const candidates = ready.flatMap((a) =>
            a.laps
              .filter(
                (l) =>
                  l.startTime && l.elapsedTime === 1800 && l.timerTime === 1800,
              )
              .map((l) => ({
                activityHashId: a.hashId,
                startSeconds:
                  (l.startTime!.getTime() - a.startTime!.getTime()) / 1000,
              })),
          );
          if (candidates.length === 1) {
            request = { ...request, segment: candidates[0] };
            input.request = { ...input.request, segment: candidates[0] };
          }
        }
        const selected = request.segment
          ? ready.find((a) => a.hashId === request.segment!.activityHashId)
          : null;
        if (!selected || !request.segment) {
          const fact = (
            task.facts as {
              protocol?: {
                selectionHash: string;
                segmentHash: string;
                answer: 'TEST' | 'ORDINARY' | 'SKIP';
              };
            }
          ).protocol;
          input.reason =
            fact?.selectionHash === selection.hash &&
            fact.segmentHash === fingerprint(null) &&
            fact.answer !== 'TEST'
              ? fact.answer === 'SKIP'
                ? 'PROTOCOL_UNCONFIRMED'
                : 'PROTOCOL_MISMATCH'
              : 'AMBIGUOUS_SCOPE';
          evidence.activityHashIds = ready.map((a) => a.hashId);
        } else {
          evidence.segment = {
            ...request.segment,
            endSeconds: request.segment.startSeconds + 1800,
          };
          const rows = await this.reader.samples(selected.id);
          input.samples = rows.map((r) => ({
            seconds: r.epochSeconds - selected.startTime!.getTime() / 1000,
            heartRate: r.heartRate,
          }));
          input.sampleSeconds = selected.sampleSec ?? 1;
          input.sourceChecksummed = selected.parquetFiles.some(
            (f) => f.type === 'record' && !!f.checksum,
          );
          evidence.includedCount = 1;
          evidence.activityHashIds = [selected.hashId];
          const facts = task.facts as {
            protocol?: {
              selectionHash: string;
              segmentHash: string;
              answer: 'TEST' | 'ORDINARY' | 'SKIP';
            };
          };
          if (
            facts.protocol?.selectionHash === selection.hash &&
            facts.protocol.segmentHash === fingerprint(request.segment)
          )
            input.protocol = facts.protocol.answer;
          const quality = calculateFieldLthr(
            input.samples,
            request.segment.startSeconds,
            input.sampleSeconds,
          );
          evidence.checks = quality.checks;
          const noKnownPause =
            selected.timerTime != null &&
            selected.elapsedTime != null &&
            selected.elapsedTime - selected.timerTime <= 30;
          evidence.checks.push({
            code: 'NO_KNOWN_PAUSE',
            passed: noKnownPause,
          });
          if (!noKnownPause) quality.valid = false;
          if (!rows.length) input.reason = 'MISSING_SIGNAL';
          else if (!quality.valid) input.reason = 'QUALITY_REJECTED';
          else if (!input.protocol) input.reason = 'PROTOCOL_UNKNOWN';
          else if (input.protocol !== 'TEST')
            input.reason =
              input.protocol === 'SKIP'
                ? 'PROTOCOL_UNCONFIRMED'
                : 'PROTOCOL_MISMATCH';
        }
      } else if (method.recipe === 'POWER_DURATION') {
        const best = new Map<number, number>();
        let sampleCount = 0;
        for (const activity of ready) {
          if (
            resolveMeasuredPowerEvidence(activity.activitySources) !==
            'RELIABLE'
          )
            continue;
          if (
            !activity.parquetFiles.some(
              (f) => f.type === 'record' && !!f.checksum,
            )
          )
            input.sourceChecksummed = false;
          const samples = await this.reader.samples(activity.id);
          sampleCount += samples.length;
          if (sampleCount > 300_000) {
            input.reason = 'RESOURCE_LIMIT';
            evidence.truncated = true;
            break;
          }
          const peaks = measuredPowerPeaks(
            samples.map((r) => ({ seconds: r.epochSeconds, power: r.power })),
            activity.sampleSec ?? 1,
          );
          if (!peaks.length) continue;
          evidence.includedCount++;
          evidence.activityHashIds.push(activity.hashId);
          for (const p of peaks)
            best.set(p.seconds, Math.max(best.get(p.seconds) ?? 0, p.value));
        }
        input.peaks = [...best]
          .map(([seconds, value]) => ({ seconds, value }))
          .sort((a, b) => a.seconds - b.seconds);
        if (!input.reason && !input.peaks.length)
          input.reason = 'MISSING_SIGNAL';
      } else {
        input.preview = {
          performances: [],
          heartRatePeaks: [],
          vo2: [],
          daily: [],
        };
        evidence.activityHashIds = ready.map((a) => a.hashId);
        for (const a of ready) {
          const allowPace =
            a.sportType !== 'RUN' ||
            !['WALKING', 'HIKING'].includes(a.sportDefinitionCode ?? '');
          for (const p of a.activityPeakMetrics) {
            if (p.value == null || !Number.isFinite(p.value) || p.value <= 0)
              continue;
            if (
              allowPace &&
              p.type === 'pace' &&
              p.scaleType === 'DISTANCE' &&
              p.scaleValue > 0 &&
              p.scaleValue <= (a.distance ?? 0) + 1 &&
              p.scaleValue / p.value <= (a.elapsedTime ?? 0) + 1
            )
              input.preview.performances.push({
                activityHashId: a.hashId,
                distanceM: p.scaleValue,
                speedMps: p.value,
              });
            if (
              p.type === 'hr' &&
              p.scaleType === 'TIME' &&
              p.scaleValue > 0 &&
              p.scaleValue <= (a.elapsedTime ?? 0)
            )
              input.preview.heartRatePeaks.push({
                activityHashId: a.hashId,
                seconds: p.scaleValue,
                value: p.value,
              });
          }
          if (allowPace && a.vo2max && a.startTime) {
            const v = resolveEffectiveActivityVo2Max(
              a.vo2max,
              baseline.profile?.defaultVdotSource,
              baseline.profile?.vo2maxCorrectionFactor,
            );
            if (v)
              input.preview.vo2.push({
                activityHashId: a.hashId,
                date: a.startTime.toISOString(),
                ...v,
              });
          }
        }
      }
    } catch (error) {
      input.reason =
        error instanceof Error && error.message === 'FITNESS_RESOURCE_LIMIT'
          ? 'RESOURCE_LIMIT'
          : 'EXECUTION_FAILED';
      if (input.reason === 'RESOURCE_LIMIT') evidence.truncated = true;
    }
    // Readers ran outside transactions. Refuse a mixed publication snapshot.
    const after = tz
      ? await this.reader.selection(context.userId, request, window)
      : selection;
    if (after.hash !== selection.hash)
      throw new ConflictException('Evidence changed while reading; retry');
    const calculationId = randomUUID();
    let status: FitnessStatus = 'NEEDS_INPUT';
    if (input.reason)
      status = [
        'PROTOCOL_UNKNOWN',
        'AMBIGUOUS_SCOPE',
        'TIMEZONE_REQUIRED',
      ].includes(input.reason)
        ? 'NEEDS_INPUT'
        : ['PROTOCOL_MISMATCH', 'PROTOCOL_UNCONFIRMED'].includes(
              input.reason ?? '',
            )
          ? 'OBSERVATION_ONLY'
          : 'UNAVAILABLE';
    if (input.reason === 'EXECUTION_FAILED') status = 'FAILED';
    if (
      method.recipe !== 'UNAVAILABLE' &&
      method.recipe !== 'DAILY_RESTING_HR' &&
      !ready.length &&
      processing
    ) {
      status = 'WAITING_DATA';
    } else if (
      method.recipe !== 'UNAVAILABLE' &&
      method.recipe !== 'DAILY_RESTING_HR' &&
      !ready.length &&
      selection.rows.some((a) =>
        ['FAILED', 'PARTIAL_FAILED'].includes(a.processingStatus),
      )
    ) {
      status = 'FAILED';
      input.reason = 'EXECUTION_FAILED';
    }
    const result = this.result(
      calculationId,
      task.id,
      task.revision,
      input,
      status,
      status === 'WAITING_DATA' ? undefined : input.reason,
    );
    result.preparationStatus =
      status === 'WAITING_DATA'
        ? 'WAITING_DATA'
        : !input.reason
          ? 'READY'
          : status === 'NEEDS_INPUT'
            ? 'NEEDS_INPUT'
            : 'UNAVAILABLE';
    if (result.preparationStatus === 'READY') result.nextActions = [];
    if (method.unavailableReason)
      result.limitations.push(method.unavailableReason);
    if (
      ['PROTOCOL_MISMATCH', 'PROTOCOL_UNCONFIRMED'].includes(
        input.reason ?? '',
      ) &&
      input.samples &&
      input.request.segment
    ) {
      const observed = calculateFieldLthr(
        input.samples,
        input.request.segment.startSeconds,
        input.sampleSeconds,
      );
      if (observed.rawMean != null)
        result.observations = [
          {
            metric: 'last20MinutesMeanHeartRate',
            value: observed.rawMean,
            unit: 'bpm',
          },
        ];
    }
    // Publish only if the task and preparation lease still belong to this attempt.
    await this.prisma.$transaction(async (tx) => {
      await lockFitnessUser(tx, context.userId);
      const lease = await tx.fitnessEvidenceRevision.findUnique({
        where: { userId: context.userId },
      });
      const currentTask = await tx.fitnessAssessmentTask.findUnique({
        where: { id: task.id },
      });
      if (
        lease?.leaseOwner !== leaseOwner ||
        !lease.leaseUntil ||
        lease.leaseUntil <= new Date() ||
        currentTask?.revision !== task.revision
      )
        throw new ConflictException('STALE');
      await tx.fitnessCalculation.create({
        data: {
          id: calculationId,
          userId: context.userId,
          taskId: task.id,
          taskRevision: task.revision,
          methodId: method.id,
          methodVersion: method.version,
          policyVersion: method.policyVersion,
          input: json(input),
          inputHash: fingerprint(input),
          selectionHash: selection.hash,
          baselineHash: baseline.hash,
          result: json(result),
        },
      });
      await tx.fitnessAssessmentTask.update({
        where: { id: task.id },
        data: {
          request: json(input.request),
          lastCalculationId: calculationId,
          stage:
            status === 'NEEDS_INPUT' && !!input.reason
              ? 'WAITING_USER'
              : 'EVIDENCE',
        },
      });
    });
    if (result.reasonCode)
      this.logger.log(
        JSON.stringify({
          event: 'fitness_assessment',
          method: method.id,
          metric: input.request.metric,
          status: result.status,
          reason: result.reasonCode,
          activityCount: result.evidence.activityCount,
        }),
      );
    return result;
  }
  private result(
    id: string,
    taskId: string,
    revision: number,
    input: FrozenFitnessInput,
    status: FitnessStatus,
    reason?: FitnessReason,
  ): FitnessAssessmentResult {
    const m = fitnessMethod(input.request.methodId)!;
    return {
      kind: 'fitness_assessment_result',
      schemaVersion: 1,
      taskId,
      taskRevision: revision,
      calculationId: id,
      sport: input.request.sport,
      requestedScope: input.request.scope,
      method: { id: m.id, version: m.version, policyVersion: m.policyVersion },
      status,
      reasonCode: reason,
      candidates: [],
      observations: [],
      evidence: input.evidence,
      timezone: input.timezone || undefined,
      assessedAt: new Date().toISOString(),
      limitations: [
        ...(input.evidence.readyCount < input.evidence.activityCount
          ? ['PARTIAL_EVIDENCE']
          : []),
        ...(input.evidence.candidateListTruncated
          ? ['CANDIDATE_LIST_LIMIT']
          : []),
      ],
      nextActions:
        reason === 'PROTOCOL_UNKNOWN'
          ? ['ANSWER_PROTOCOL']
          : reason === 'AMBIGUOUS_SCOPE'
            ? ['SELECT_SEGMENT']
            : status === 'WAITING_DATA'
              ? ['WAIT']
              : reason === 'EXECUTION_FAILED'
                ? ['RETRY']
                : reason === 'TIMEZONE_REQUIRED' ||
                    reason === 'PROTOCOL_UNCONFIRMED'
                  ? []
                  : reason === 'METHOD_UNAVAILABLE' ||
                      reason === 'SCOPE_UNSUPPORTED'
                    ? []
                    : reason
                      ? m.recipe === 'HR_TEST_SEGMENT'
                        ? ['FIND_TEST', 'OFFER_WORKOUT']
                        : ['RECOMPUTE']
                      : [],
      applyOptions: [],
      noMetricWrite: true,
    };
  }
  async calculate(
    context: AssessmentContext,
    id: string,
  ): Promise<FitnessAssessmentResult> {
    const c = await this.calculation(context, id);
    if (c.appliedAt && c.appliedActionId)
      return {
        ...(c.result as unknown as FitnessAssessmentResult),
        application: {
          actionId: c.appliedActionId,
          appliedAt: c.appliedAt.toISOString(),
          refreshState: c.postProcessState === 'DONE' ? 'DONE' : 'PENDING',
        },
      };
    const method = fitnessMethod(c.methodId);
    if (
      !method ||
      method.version !== c.methodVersion ||
      method.policyVersion !== c.policyVersion ||
      methodDisabled(c.methodId)
    )
      throw new ConflictException('METHOD_UNAVAILABLE');
    if (c.state === 'COMPLETED')
      return c.result as unknown as FitnessAssessmentResult;
    if (c.taskRevision !== c.task.revision)
      throw new ConflictException('STALE');
    const input = c.input as unknown as FrozenFitnessInput;
    if (fingerprint(input) !== c.inputHash)
      throw new ConflictException('STALE');
    const prepared = c.result as unknown as FitnessAssessmentResult;
    if (input.reason || prepared.status === 'WAITING_DATA') return prepared;
    const result = this.result(
      c.id,
      c.taskId,
      c.taskRevision,
      input,
      'ESTIMATED',
    );
    // Persisted TP is speed (m/s); the public preview is explicitly s/km.
    const baselineValue = (metric: FitnessCandidate['metric']) => {
      const value = input.baseline.values[metric];
      return value === undefined
        ? null
        : metric === 'TP'
          ? Math.round((1000 / value) * 100) / 100
          : value;
    };
    const candidate = (
      metric: FitnessCandidate['metric'],
      value: number,
      unit: FitnessCandidate['unit'],
    ) => ({
      metric,
      value,
      unit,
      currentValue: baselineValue(metric),
      currentRecordedAt: input.baseline.recordedAt?.[metric] ?? null,
      delta:
        baselineValue(metric) === null ? null : value - baselineValue(metric)!,
    });
    if (
      method.recipe === 'HR_TEST_SEGMENT' ||
      method.recipe === 'HR_OBSERVATION'
    ) {
      const lthr = calculateFieldLthr(
        input.samples ?? [],
        input.evidence.segment!.startSeconds,
        input.sampleSeconds,
      );
      result.evidence.checks = input.evidence.checks;
      if (
        !lthr.valid ||
        (method.recipe === 'HR_TEST_SEGMENT' && input.protocol !== 'TEST') ||
        lthr.value === null
      )
        throw new ConflictException('Invalid frozen protocol evidence');
      result.observations = [
        {
          metric: 'last20MinutesMeanHeartRate',
          value: lthr.rawMean!,
          unit: 'bpm',
        },
      ];
      result.candidates = [candidate('LTHR', lthr.value, 'bpm')];
      const validation = validateFitnessMetricCandidate(
        { type: 'LTHR', value: lthr.value, sport: input.request.sport },
        input.baseline.values,
        { requireReferenceMetrics: true },
      );
      if (validation.valid === false)
        result.reasonCode = input.baseline.values.MAX_HR
          ? 'REFERENCE_CONFLICT'
          : 'REFERENCE_REQUIRED';
      result.limitations.push(
        ...(method.recipe === 'HR_TEST_SEGMENT'
          ? ['FIELD_ESTIMATE_NOT_LAB_MEASUREMENT', 'USER_REPORTED_PROTOCOL']
          : ['ORDINARY_ACTIVITY_LTHR', 'USER_ADOPTED_ESTIMATE']),
      );
    } else if (method.recipe === 'POWER_DURATION') {
      const cp = calculateCp(input.peaks ?? []);
      result.evidence.checks = [
        {
          code: 'FIT_CONVERGED',
          passed: cp.converged === true,
          observed: cp.iterations,
        },
        {
          code: 'OBSERVED_DURATIONS',
          passed: cp.valid,
          observed: input.peaks?.length ?? 0,
          required: 5,
        },
      ];
      if (!cp.valid) {
        result.status = 'UNAVAILABLE';
        result.reasonCode = cp.reason;
        result.nextActions = ['FIND_TEST'];
      } else {
        const values = {
          CP: candidate('CP', cp.cp!, 'W'),
          FTP: candidate('FTP', cp.ftp!, 'W'),
          W_PRIME: candidate('W_PRIME', cp.wPrime!, 'J'),
          P_MAX: candidate('P_MAX', cp.pMax!, 'W'),
        };
        result.candidates = [
          values[input.request.metric as 'CP' | 'FTP' | 'W_PRIME' | 'P_MAX'],
        ];
        result.limitations = [
          ...result.limitations,
          'USER_ADOPTED_ESTIMATE',
          'RECORDED_PERFORMANCE_NOT_MAXIMAL_CAPACITY',
          ...(input.request.metric === 'FTP'
            ? ['FTP_PRODUCT_MAPPING_095_UNVALIDATED']
            : []),
        ];
      }
    } else {
      if (!input.preview)
        throw new ConflictException('Missing frozen recipe input');
      const calculated = calculateFitnessPreview(
        method.recipe as PreviewRecipe,
        input.preview,
        input.request.sport,
        input.window.to,
      );
      result.candidates = calculated.candidates.map((c) =>
        candidate(c.metric, c.value, c.unit),
      );
      result.observations = calculated.observations;
      result.evidence.checks = calculated.checks;
      result.evidence.activityHashIds = calculated.activityHashIds;
      result.evidence.includedCount = calculated.activityHashIds.length;
      result.evidence.dailyRecordCount = calculated.dailyRecordCount;
      result.limitations.push(...calculated.limitations);
      if (calculated.reason) {
        result.status = 'UNAVAILABLE';
        result.reasonCode = calculated.reason;
        result.nextActions = ['RECOMPUTE'];
      } else if (calculated.observationOnly) result.status = 'OBSERVATION_ONLY';
    }
    const changes = result.candidates.length
      ? result.candidates
      : input.request.metric === 'MAX_HR' &&
          result.status === 'OBSERVATION_ONLY'
        ? result.observations
            .filter((o) => o.metric === 'observedMaxHr')
            .map((o) => candidate('MAX_HR', o.value, 'bpm'))
        : [];
    if (changes.length && !result.reasonCode) {
      const merged = { ...input.baseline.values };
      for (const change of changes) {
        const metric = normalizeFitnessMetric(
          change.metric,
        ) as UserFitnessMetricType;
        merged[metric] = fitnessStorageValue(change);
      }
      const valid = changes.every((change) => {
        const metric = normalizeFitnessMetric(
          change.metric,
        ) as UserFitnessMetricType;
        return validateFitnessMetricCandidate(
          {
            type: metric,
            value: fitnessStorageValue(change),
            sport: input.request.sport,
          },
          merged,
          { requireReferenceMetrics: true },
        ).valid;
      });
      if (!valid) result.reasonCode = 'REFERENCE_CONFLICT';
      if (!input.sourceChecksummed)
        result.limitations.push('SOURCE_VERSION_UNVERIFIED');
      if (!fitnessApplicationEnabled(method.id))
        result.limitations.push('APPLICATION_NOT_ENABLED');
      if (
        valid &&
        input.sourceChecksummed &&
        input.timezone &&
        fitnessApplicationEnabled(method.id) &&
        !(input.request.scope.kind === 'RECENT' && input.request.scope.asOf)
      ) {
        const effectiveDate = localDay(context.now, input.timezone);
        const expiresAt = new Date(
          Math.min(
            context.now.getTime() + 86400000,
            dateBoundary(effectiveDate, input.timezone).to.getTime(),
          ),
        ).toISOString();
        result.applyOptions = [
          {
            id: 'target',
            sport: input.request.sport,
            effectiveDate,
            changes,
            expiresAt,
            proposalDigest: fingerprint({
              userId: context.userId,
              sessionId: context.sessionId,
              branchId: context.branchId ?? null,
              taskId: c.taskId,
              inputHash: c.inputHash,
              methodVersion: c.methodVersion,
              policyVersion: c.policyVersion,
              id: c.id,
              revision: c.taskRevision,
              baselineHash: c.baselineHash,
              changes,
              effectiveDate,
              expiresAt,
            }),
          },
        ];
        result.nextActions = ['APPLY'];
      }
    }
    const updated = await this.prisma.fitnessCalculation.updateMany({
      where: { id: c.id, state: 'PREPARED' },
      data: {
        state: 'COMPLETED',
        result: json(result),
        resultHash: fingerprint(result),
        completedAt: context.now,
        applyExpiresAt: result.applyOptions[0]
          ? new Date(result.applyOptions[0].expiresAt)
          : null,
      },
    });
    if (!updated.count)
      return (await this.calculation(context, id))
        .result as unknown as FitnessAssessmentResult;
    await this.prisma.fitnessAssessmentTask.update({
      where: { id: c.taskId },
      data: { stage: 'RESULT' },
    });
    this.logger.log(
      JSON.stringify({
        event: 'fitness_assessment',
        method: c.methodId,
        metric: input.request.metric,
        status: result.status,
        reason: result.reasonCode ?? null,
        activityCount: result.evidence.activityCount,
      }),
    );
    return result;
  }
  async protocolReply(
    context: AssessmentContext,
    id: string,
    revision: number,
    answer: 'TEST' | 'ORDINARY' | 'SKIP',
    messageReference: string,
  ) {
    const c = await this.calculation(context, id);
    const input = c.input as unknown as FrozenFitnessInput;
    if (
      !['TEST', 'ORDINARY', 'SKIP'].includes(answer) ||
      c.taskRevision !== revision ||
      c.task.revision !== revision ||
      !c.presentedAt ||
      c.presentedAt >= context.now
    )
      throw new ConflictException('STALE');
    const changed = await this.prisma.$transaction(async (tx) => {
      await lockFitnessUser(tx, context.userId);
      return tx.fitnessAssessmentTask.updateMany({
        where: { id: c.taskId, revision: c.taskRevision },
        data: {
          revision: { increment: 1 },
          facts: json({
            protocol: {
              answer,
              selectionHash: c.selectionHash,
              segmentHash: fingerprint(input.request.segment ?? null),
              sourceMessageId: messageReference,
            },
          }),
        },
      });
    });
    if (!changed.count) throw new ConflictException('STALE');
    return this.prepare(context, { ...input.request, taskId: c.taskId });
  }
  async recompute(
    context: AssessmentContext,
    calculationId: string,
    taskId?: string,
  ) {
    const previous = await this.prisma.fitnessCalculation.findFirst({
      where: {
        id: calculationId,
        userId: context.userId,
        task: {
          sessionId: context.sessionId,
          branchId: context.branchId ?? null,
        },
      },
    });
    if (
      previous &&
      (!previous.presentedAt || previous.presentedAt >= context.now)
    )
      throw new ConflictException('STALE');
    const task = await this.task(context, previous?.taskId ?? taskId ?? '');
    const request =
      (previous?.input as unknown as FrozenFitnessInput | undefined)?.request ??
      (task.request as unknown as EvidenceRequest);
    return this.prepare(context, { ...request, taskId: task.id });
  }
  async markPresented(
    context: AssessmentContext,
    ids: string[],
    messageId: string,
  ) {
    await this.prisma.fitnessCalculation.updateMany({
      where: {
        id: { in: ids },
        userId: context.userId,
        task: {
          sessionId: context.sessionId,
          branchId: context.branchId ?? null,
        },
        presentedAt: null,
      },
      data: { presentedAt: new Date(), presentedMessageId: messageId },
    });
  }
  async currentTask(context: AssessmentContext) {
    return this.prisma.fitnessAssessmentTask.findFirst({
      where: {
        userId: context.userId,
        sessionId: context.sessionId,
        branchId: context.branchId ?? null,
        stage: { not: 'CLOSED' },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
