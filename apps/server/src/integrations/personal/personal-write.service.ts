import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import Ajv from 'ajv';
import {
  Prisma,
  type ExternalProviderConnection,
  type PersonalProviderJob,
} from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CorosMcpClient,
  COROS_WRITE_TOOLS,
} from '../coros-mcp/coros-mcp.client';
import {
  PersonalConnectionService,
  personalRegion,
  personalSettings,
} from './personal-connection.service';
import { PersonalProviderError, record, requireId } from './personal-errors';
import { addDays, dateLabel, localToday } from './personal-dates';
import { PlanExternalSyncService } from '@/api/plan/application/plan-external-sync.service';
import { personalAccountRef } from './personal-identity';
import {
  corosRemoteId,
  verifyCorosWrite,
  corosMatchingObjects,
} from '../coros-mcp/coros-result-verification';

export function personalRequestHash(value: unknown) {
  const stable = (input: any): any =>
    Array.isArray(input)
      ? input.map(stable)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.keys(input)
              .sort()
              .map((key) => [key, stable(input[key])]),
          )
        : input;
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function localWorkoutChecksum(workout: {
  name: unknown;
  text: unknown;
  steps: unknown;
  revision: number;
}) {
  return personalRequestHash({
    name: workout.name,
    text: workout.text,
    steps: workout.steps,
    revision: workout.revision,
  });
}

/** Delivery owns validation/confirmation; it never generates a workout. */
@Injectable()
export class PersonalWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: PersonalConnectionService,
    private readonly coros: CorosMcpClient,
    private readonly plans: PlanExternalSyncService,
  ) {}
  private async assertDate(
    connection: ExternalProviderConnection,
    tool: string,
    args: Record<string, any>,
  ) {
    if (
      [
        'createScheduledWorkout',
        'updateScheduledWorkout',
        'scheduleWorkout',
      ].includes(tool)
    ) {
      if (typeof args.date !== 'string' || !/^\d{8}$/.test(args.date))
        throw new PersonalProviderError(
          'PROVIDER_DATE_INVALID',
          undefined,
          400,
        );
      const date = dateLabel(
        `${args.date.slice(0, 4)}-${args.date.slice(4, 6)}-${args.date.slice(6)}`,
      );
      const today = localToday(
        await this.connections.resolveAccountTimezone(connection.userId),
      );
      if (date < today || date > addDays(today, 90))
        throw new PersonalProviderError(
          'PROVIDER_DATE_RANGE_INVALID',
          undefined,
          400,
        );
    }
  }
  async preview(userId: string, input: unknown) {
    const parsed = z
      .object({
        tool: z.enum(COROS_WRITE_TOOLS),
        args: z.record(z.string(), z.unknown()),
        requestId: z.string().uuid(),
        localWorkout: z
          .object({
            id: z.string().min(1).max(160),
            revision: z.number().int().positive(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success || JSON.stringify(input).length > 2 * 1024 * 1024)
      throw new PersonalProviderError('PROVIDER_WRITE_INVALID', undefined, 400);
    const { tool, args, requestId } = parsed.data;
    const connection = await this.connections.require(userId, 'coros');
    if (!personalSettings(connection).allowWrites)
      throw new PersonalProviderError(
        'PROVIDER_WRITES_DISABLED',
        undefined,
        403,
      );
    const definition = this.connections
      .tools(connection)
      .find((item) => item.name === tool);
    if (!definition) throw new PersonalProviderError('PROVIDER_TOOL_MISSING');
    const ajv = new Ajv({ strict: false, validateFormats: false });
    if (!ajv.validate(definition.inputSchema, args))
      throw new PersonalProviderError(
        'PROVIDER_ARGUMENTS_INVALID',
        undefined,
        400,
      );
    await this.assertDate(connection, tool, args);
    let localWorkout:
      | { id: string; revision: number; checksum: string }
      | undefined;
    if (parsed.data.localWorkout) {
      const local = await this.plans.findLocalWorkout(
        userId,
        parsed.data.localWorkout.id,
      );
      if (!local || local.revision !== parsed.data.localWorkout.revision)
        throw new PersonalProviderError(
          'PROVIDER_LOCAL_WORKOUT_CHANGED',
          undefined,
          409,
        );
      if (
        ![
          'createSingleWorkout',
          'updateWorkoutDetails',
          'createScheduledWorkout',
          'updateScheduledWorkout',
          'scheduleWorkout',
        ].includes(tool)
      )
        throw new PersonalProviderError(
          'PROVIDER_LOCAL_WORKOUT_UNSUPPORTED',
          undefined,
          400,
        );
      localWorkout = {
        id: local.id,
        revision: local.revision,
        checksum: localWorkoutChecksum(local),
      };
    }
    const hash = personalRequestHash({
      tool,
      args,
      accountRef: personalAccountRef(connection),
      ...(localWorkout ? { localWorkout } : {}),
    });
    const old = await this.prisma.personalProviderJob.findUnique({
      where: {
        connectionId_requestId: { connectionId: connection.id, requestId },
      },
    });
    if (old) {
      if (record(old.payload).hash !== hash)
        throw new PersonalProviderError(
          'PROVIDER_REQUEST_ID_CONFLICT',
          undefined,
          409,
        );
      if (
        old.status === 'PREVIEW' &&
        Date.now() - old.createdAt.getTime() > 15 * 60_000
      )
        throw new PersonalProviderError(
          'PROVIDER_PREVIEW_EXPIRED',
          undefined,
          409,
        );
      return { operationId: old.id, status: old.status, hash };
    }
    let previous: unknown;
    if (tool === 'updateWorkoutDetails')
      previous = await this.connections.readCoros(
        connection.id,
        'queryWorkoutDetails',
        { workoutId: args.workoutId },
      );
    if (tool === 'updateScheduledWorkout')
      previous = await this.connections.readCoros(
        connection.id,
        'queryScheduledWorkoutDetails',
        { date: args.date, idInPlan: args.idInPlan },
      );
    if (tool === 'updateTrainingPlan')
      previous = await this.connections.readCoros(
        connection.id,
        'queryTrainingPlanDetails',
        { planId: args.planId ?? record(args.planInfo).planId },
      );
    // The content/precondition key deduplicates separate clicks with different request UUIDs.
    const dedupKey = personalRequestHash({
      tool,
      args,
      accountId: connection.externalAthleteId,
      accountRef: personalAccountRef(connection),
      previous,
      localWorkout,
    });
    const job = await this.prisma.personalProviderJob.upsert({
      where: {
        connectionId_dedupKey: { connectionId: connection.id, dedupKey },
      },
      update: {},
      create: {
        connectionId: connection.id,
        requestId,
        dedupKey,
        kind: 'WRITE',
        status: 'PREVIEW',
        payload: JSON.parse(
          JSON.stringify({
            tool,
            args,
            hash,
            credentialVersion: connection.credentialFingerprint,
            accountId: connection.externalAthleteId,
            accountRef: personalAccountRef(connection),
            schemaHash: personalRequestHash(definition),
            previousHash:
              previous === undefined ? null : personalRequestHash(previous),
            ...(localWorkout ? { localWorkout } : {}),
          }),
        ),
      },
    });
    if (
      job.status === 'PREVIEW' &&
      Date.now() - job.createdAt.getTime() > 15 * 60_000
    ) {
      const expired = await this.prisma.personalProviderJob.updateMany({
        where: { id: job.id, status: 'PREVIEW' },
        data: {
          status: 'CANCELLED',
          dedupKey: null,
          errorCode: 'PROVIDER_PREVIEW_EXPIRED',
        },
      });
      if (expired.count) return this.preview(userId, input);
      throw new PersonalProviderError(
        'PROVIDER_PREVIEW_EXPIRED',
        undefined,
        409,
      );
    }
    return {
      operationId: job.id,
      status: job.status,
      hash,
      tool,
      args,
      expiresAt: new Date(job.createdAt.getTime() + 15 * 60_000),
    };
  }
  async confirm(userId: string, operationId: string, input: unknown) {
    const parsed = z
      .object({
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        confirmed: z.literal(true),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success)
      throw new PersonalProviderError(
        'PROVIDER_CONFIRMATION_REQUIRED',
        undefined,
        400,
      );
    const job = await this.prisma.personalProviderJob.findFirst({
      where: { id: operationId, connection: { userId, provider: 'coros' } },
    });
    if (!job || record(job.payload).hash !== parsed.data.hash)
      throw new PersonalProviderError(
        'PROVIDER_PREVIEW_INVALID',
        undefined,
        409,
      );
    if (['SUCCEEDED', 'UNKNOWN', 'CANCELLED', 'FAILED'].includes(job.status))
      return { operationId: job.id, status: job.status };
    const connection = await this.connections.require(userId, 'coros');
    const local = record(record(job.payload).localWorkout);
    if (local.id) {
      const current = await this.plans.findLocalWorkout(userId, local.id);
      if (
        !current ||
        current.revision !== local.revision ||
        localWorkoutChecksum(current) !== local.checksum
      )
        throw new PersonalProviderError(
          'PROVIDER_LOCAL_WORKOUT_CHANGED',
          undefined,
          409,
        );
    }
    if (
      !personalSettings(connection).allowWrites ||
      connection.credentialFingerprint !== record(job.payload).credentialVersion
    )
      throw new PersonalProviderError(
        'PROVIDER_CONNECTION_CHANGED',
        undefined,
        409,
      );
    if (job.status === 'PREVIEW') {
      if (Date.now() - job.createdAt.getTime() > 15 * 60_000)
        throw new PersonalProviderError(
          'PROVIDER_PREVIEW_EXPIRED',
          undefined,
          409,
        );
      await this.prisma.personalProviderJob.updateMany({
        where: { id: job.id, status: 'PREVIEW' },
        data: { status: 'QUEUED' },
      });
    }
    return {
      operationId: job.id,
      status: job.status === 'PREVIEW' ? 'QUEUED' : job.status,
    };
  }
  async run(job: PersonalProviderJob, connection: ExternalProviderConnection) {
    const payload = record(job.payload),
      tool = String(payload.tool),
      args = record(payload.args);
    const local = record(payload.localWorkout);
    if (local.id) {
      const current = await this.plans.findLocalWorkout(
        connection.userId,
        local.id,
      );
      if (
        !current ||
        current.revision !== local.revision ||
        localWorkoutChecksum(current) !== local.checksum
      )
        throw new PersonalProviderError(
          'PROVIDER_LOCAL_WORKOUT_CHANGED',
          undefined,
          409,
        );
    }
    if (
      !personalSettings(connection).allowWrites ||
      connection.credentialFingerprint !== payload.credentialVersion
    )
      throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
    await this.assertDate(connection, tool, args);
    const definition = this.connections
      .tools(connection)
      .find((item) => item.name === tool);
    if (!definition || personalRequestHash(definition) !== payload.schemaHash)
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    let previous: unknown;
    if (tool === 'updateWorkoutDetails')
      previous = await this.connections.readCoros(
        connection.id,
        'queryWorkoutDetails',
        { workoutId: args.workoutId },
      );
    if (tool === 'updateScheduledWorkout')
      previous = await this.connections.readCoros(
        connection.id,
        'queryScheduledWorkoutDetails',
        { date: args.date, idInPlan: args.idInPlan },
      );
    if (tool === 'updateTrainingPlan')
      previous = await this.connections.readCoros(
        connection.id,
        'queryTrainingPlanDetails',
        { planId: args.planId ?? record(args.planInfo).planId },
      );
    if (
      payload.previousHash &&
      personalRequestHash(previous) !== payload.previousHash
    )
      throw new PersonalProviderError(
        'PROVIDER_REMOTE_CHANGED',
        undefined,
        409,
      );
    // Persist the point of no automatic retry before issuing a mutating upstream call.
    const authorized = await this.connections.credential(connection.id);
    if (
      authorized.connection &&
      (authorized.connection.credentialFingerprint !==
        payload.credentialVersion ||
        !personalSettings(authorized.connection).allowWrites ||
        personalAccountRef(authorized.connection) !==
          personalAccountRef(connection))
    )
      throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
    const fenced = await this.prisma.personalProviderJob.updateMany({
      where: {
        id: job.id,
        status: 'RUNNING',
        leaseUntil: { equals: job.leaseUntil, gt: new Date() },
      },
      data: { result: { sentAt: new Date().toISOString() } },
    });
    if (fenced.count !== 1)
      throw new PersonalProviderError('PROVIDER_LEASE_LOST');
    let response: unknown;
    try {
      response = await this.coros.call(
        personalRegion(connection),
        authorized.token,
        definition,
        args,
      );
      // Preserve the receipt before read-back; an outage can then be reconciled by ID.
      await this.prisma.personalProviderJob.updateMany({
        where: {
          id: job.id,
          OR: [
            { status: 'RUNNING', leaseUntil: job.leaseUntil },
            // Disconnect/reauthorization may pause an in-flight operation. Keep
            // its receipt without re-enabling it or changing its uncertain state.
            {
              status: 'UNKNOWN',
              result: { path: ['response'], equals: Prisma.AnyNull },
            },
          ],
        },
        data: {
          result: JSON.parse(
            JSON.stringify({ response, sentAt: new Date().toISOString() }),
          ),
        },
      });
      const root = record(response),
        data = record(root.data);
      if (
        root.success === false ||
        data.success === false ||
        Number(root.failedCount) > 0 ||
        Number(data.failedCount) > 0
      )
        throw new PersonalProviderError('PROVIDER_RESULT_UNKNOWN');
      let verified: unknown;
      if (['createSingleWorkout', 'updateWorkoutDetails'].includes(tool))
        verified = await this.connections.readCoros(
          connection.id,
          'queryWorkoutDetails',
          {
            workoutId: requireId(
              root.workoutId ??
                data.workoutId ??
                root.id ??
                data.id ??
                args.workoutId,
            ),
          },
        );
      else if (
        ['createScheduledWorkout', 'updateScheduledWorkout'].includes(tool)
      )
        verified = await this.connections.readCoros(
          connection.id,
          'queryScheduledWorkoutDetails',
          {
            date: args.date,
            idInPlan: requireId(
              root.idInPlan ?? data.idInPlan ?? args.idInPlan,
            ),
          },
        );
      else if (['createTrainingPlan', 'updateTrainingPlan'].includes(tool))
        verified = await this.connections.readCoros(
          connection.id,
          'queryTrainingPlanDetails',
          {
            planId: requireId(
              root.planId ?? data.planId ?? root.id ?? data.id ?? args.planId,
            ),
          },
        );
      else if (tool === 'scheduleWorkout') {
        verified = await this.connections.readCoros(
          connection.id,
          'queryTrainingSchedule',
          { startDate: args.date, endDate: args.date },
        );
        const containsWorkout = (value: unknown, depth = 0): boolean =>
          depth <= 8 &&
          (Array.isArray(value)
            ? value.some((item) => containsWorkout(item, depth + 1))
            : value && typeof value === 'object'
              ? String(record(value).workoutId ?? '') ===
                  String(args.workoutId) ||
                Object.values(record(value)).some(
                  (item) =>
                    typeof item === 'object' &&
                    containsWorkout(item, depth + 1),
                )
              : false);
        if (!containsWorkout(verified))
          throw new PersonalProviderError('PROVIDER_RESULT_UNKNOWN');
      }
      // Route processing is asynchronous. This is acceptance, never a watch-sync claim.
      else if (tool === 'uploadRouteFile') {
        if (
          !(
            root.accepted === true ||
            root.success === true ||
            data.accepted === true ||
            root.routeId ||
            data.routeId
          )
        )
          throw new PersonalProviderError('PROVIDER_RESULT_UNKNOWN');
        verified = { accepted: true, deviceSyncVerified: false };
      }
      if (
        verified == null ||
        (Array.isArray(verified) && verified.length === 0) ||
        (!Array.isArray(verified) && Object.keys(record(verified)).length === 0)
      )
        throw new PersonalProviderError('PROVIDER_RESULT_UNKNOWN');
      verifyCorosWrite(tool, args, verified);
      await this.complete(job, connection, response, verified);
    } catch {
      await this.prisma.personalProviderJob.updateMany({
        where: { id: job.id, status: 'RUNNING', leaseUntil: job.leaseUntil },
        data: {
          status: 'UNKNOWN',
          errorCode: 'PROVIDER_RESULT_UNKNOWN',
          leaseUntil: null,
          nextAttemptAt: new Date(Date.now() + 30_000),
        },
      });
    }
  }

  private async complete(
    job: PersonalProviderJob,
    connection: ExternalProviderConnection,
    response: unknown,
    verified: unknown,
  ) {
    const payload = record(job.payload),
      local = record(payload.localWorkout),
      args = record(payload.args);
    const current = await this.connections.require(connection.userId, 'coros');
    if (
      current.id !== connection.id ||
      personalAccountRef(current) !== personalAccountRef(connection)
    )
      throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
    await this.prisma.$transaction(async (tx) => {
      // Use the same connection -> job lock order as disconnect/reconnect.
      // This also fences the final receipt and mapping against a connection
      // replacement between the preflight read and this transaction.
      await tx.$executeRaw`SELECT id FROM t_external_provider_connection WHERE id=${connection.id} FOR UPDATE`;
      const active = await tx.externalProviderConnection.findUnique({
        where: { id: connection.id },
      });
      if (
        !active ||
        active.status !== 'ACTIVE' ||
        personalAccountRef(active) !== personalAccountRef(connection)
      )
        throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
      const changed = await tx.personalProviderJob.updateMany({
        where: {
          id: job.id,
          status: 'RUNNING',
          leaseUntil: { equals: job.leaseUntil, gt: new Date() },
        },
        data: {
          status: 'SUCCEEDED',
          result: JSON.parse(
            JSON.stringify({
              response: response ?? null,
              verified,
              deviceSyncVerified: false,
            }),
          ),
          errorCode: null,
          leaseUntil: null,
        },
      });
      if (changed.count !== 1)
        throw new PersonalProviderError('PROVIDER_LEASE_LOST');
      if (local.id)
        await this.plans.recordVerifiedDelivery(
          {
            userId: connection.userId,
            workoutId: local.id,
            revision: local.revision,
            provider: 'coros',
            connectionId: connection.id,
            accountId: personalAccountRef(connection),
            externalId: `${args.date ? 'calendar:' + args.date : 'library'}:${corosRemoteId(String(payload.tool), args, response)}`,
            destination: args.date ? 'calendar' : 'library',
            localChecksum: local.checksum,
            remoteChecksum: personalRequestHash(verified),
            rawRemote: JSON.parse(JSON.stringify(verified)),
            // Vendor JSON is a reference, not proof of lossless local IR conversion.
            localContentVerified: false,
          },
          tx,
        );
    });
  }

  /** Read-only recovery: UNKNOWN is never sent to a mutating MCP tool again. */
  async reconcile(
    job: PersonalProviderJob,
    connection: ExternalProviderConnection,
  ) {
    const payload = record(job.payload),
      args = record(payload.args),
      tool = String(payload.tool);
    let receipt = record(job.result).response;
    try {
      if (
        connection.credentialFingerprint !== payload.credentialVersion &&
        payload.accountRef !== personalAccountRef(connection)
      )
        throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
      if (
        !receipt &&
        ['createSingleWorkout', 'createScheduledWorkout'].includes(tool)
      ) {
        const list = await this.connections.readCoros(
          connection.id,
          tool === 'createSingleWorkout'
            ? 'queryWorkoutLibrary'
            : 'queryTrainingSchedule',
          tool === 'createSingleWorkout'
            ? { courseType: 'mcp' }
            : { startDate: args.date, endDate: args.date },
        );
        const matches = corosMatchingObjects(list, args.course);
        if (matches.length !== 1)
          throw new PersonalProviderError(
            matches.length > 1
              ? 'PROVIDER_RESULT_AMBIGUOUS'
              : 'PROVIDER_RESULT_UNKNOWN',
          );
        receipt = matches[0];
      }
      let verified: unknown;
      if (['createSingleWorkout', 'updateWorkoutDetails'].includes(tool))
        verified = await this.connections.readCoros(
          connection.id,
          'queryWorkoutDetails',
          { workoutId: corosRemoteId(tool, args, receipt) },
        );
      else if (
        ['createScheduledWorkout', 'updateScheduledWorkout'].includes(tool)
      )
        verified = await this.connections.readCoros(
          connection.id,
          'queryScheduledWorkoutDetails',
          { date: args.date, idInPlan: corosRemoteId(tool, args, receipt) },
        );
      else if (tool.includes('TrainingPlan'))
        verified = await this.connections.readCoros(
          connection.id,
          'queryTrainingPlanDetails',
          { planId: corosRemoteId(tool, args, receipt) },
        );
      else if (tool === 'scheduleWorkout')
        verified = await this.connections.readCoros(
          connection.id,
          'queryTrainingSchedule',
          { startDate: args.date, endDate: args.date },
        );
      else if (tool === 'uploadRouteFile' && receipt) verified = receipt;
      else throw new PersonalProviderError('PROVIDER_VERIFICATION_UNAVAILABLE');
      verifyCorosWrite(tool, args, verified);
      await this.complete(job, connection, receipt, verified);
    } catch (error) {
      await this.prisma.personalProviderJob.updateMany({
        where: { id: job.id, status: 'RUNNING', leaseUntil: job.leaseUntil },
        data: {
          status: 'UNKNOWN',
          errorCode:
            error instanceof PersonalProviderError
              ? error.code
              : 'PROVIDER_RESULT_UNKNOWN',
          leaseUntil: null,
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(30 * 60_000, 30_000 * 2 ** Math.min(job.attempts, 6)),
          ),
        },
      });
    }
  }
}
