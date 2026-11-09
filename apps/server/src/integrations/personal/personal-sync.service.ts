import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  Prisma,
  ZoneBase,
  ZoneType,
  type ExternalProviderConnection,
  type PersonalProviderJob,
} from '@prisma/client';
import { z } from 'zod';
import type { PersonalProvider } from '@shared/personal-integrations';
import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { ImportBatchService } from '@/importing/import-batch.service';
import { ImportingJobService } from '@/importing/importing-job.service';
import { HealthDataIngestService } from '@/health-data/health-data-ingest.service';
import { GarminPersonalClient } from '../garmin-personal/garmin-personal.client';
import { corosRecordPageLimit } from '../coros-mcp/coros-mcp.client';
import {
  PersonalConnectionService,
  isPersonalConnection,
  personalMetadata,
  personalRegion,
  personalSettings,
} from './personal-connection.service';
import { PersonalProviderError, record, requireId } from './personal-errors';
import { addDays, dateRange, localToday } from './personal-dates';
import { extractActivityArchive } from './personal-archive';
import { downloadCorosFile } from './personal-download';
import { garminHealthProjection } from './personal-health.mapper';
import {
  PERSONAL_ACTIVITY_PARKED_AT,
  isPersonalActivitySerialHeld,
  personalSyncCounts,
} from './personal-sync-summary';
import { corosHealthCandidates } from '../coros-mcp/coros-health.mapper';
import { ActivitySourceLifecycleService } from '@/sync/activity-source-lifecycle.service';
import { personalAccountRef } from './personal-identity';
import {
  garminSummaryMode,
  mapGarminHeartRateZones,
  normalizeGarminDailySummary,
  type PersonalSyncTrigger,
} from './personal-garmin-wellness';
import { UserService } from '@/api/user/user.service';

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class PersonalSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: PersonalConnectionService,
    private readonly garmin: GarminPersonalClient,
    private readonly imports: ImportBatchService,
    private readonly importJobs: ImportingJobService,
    private readonly health: HealthDataIngestService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly sourceLifecycle: ActivitySourceLifecycleService,
    private readonly users: UserService,
  ) {}
  async enqueue(
    userId: string,
    provider: PersonalProvider,
    input: unknown = {},
  ) {
    const parsed = z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        requestId: z.string().uuid().optional(),
        trigger: z
          .enum(['first_connect', 'focus', 'dawn', 'manual'])
          .optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success)
      throw new PersonalProviderError('PROVIDER_SYNC_INVALID', undefined, 400);
    const connection = await this.connections.require(userId, provider);
    const settings = {
      ...personalSettings(connection),
      timezone: await this.connections.resolveAccountTimezone(userId),
    };
    const endDate = parsed.data.endDate ?? localToday(settings.timezone);
    const startDate =
      parsed.data.startDate ??
      addDays(endDate, provider === 'garmin' ? -59 : -29);
    dateRange(startDate, endDate);
    if (endDate > localToday(settings.timezone))
      throw new PersonalProviderError(
        'PROVIDER_DATE_RANGE_INVALID',
        undefined,
        400,
      );
    const trigger: PersonalSyncTrigger = parsed.data.trigger ?? 'manual';
    const requestId = parsed.data.requestId ?? randomUUID();
    const job = await this.prisma.personalProviderJob.upsert({
      where: {
        connectionId_requestId: { connectionId: connection.id, requestId },
      },
      create: {
        connectionId: connection.id,
        requestId,
        kind: 'SYNC',
        payload: json({
          startDate,
          endDate,
          trigger,
          settings,
          credentialVersion: connection.credentialFingerprint,
          accountRef: personalAccountRef(connection),
        }),
        result: json({
          cursor: startDate,
          activityDone: !settings.activities,
          healthDone: !settings.wellness,
          heartRateZonesDone:
            trigger !== 'first_connect' || !settings.wellness || provider !== 'garmin',
          childIds: [],
          discovered: 0,
        }),
      },
      update: {},
    });
    const previous = record(job.payload);
    if (
      previous.startDate !== startDate ||
      previous.endDate !== endDate ||
      previous.trigger !== trigger ||
      previous.credentialVersion !== connection.credentialFingerprint ||
      ['timezone', 'activities', 'wellness'].some(
        (key) => record(previous.settings)[key] !== settings[key],
      )
    )
      throw new PersonalProviderError(
        'PROVIDER_REQUEST_CONFLICT',
        undefined,
        409,
      );
    if (job.status === 'QUEUED')
      await this.prisma.externalProviderConnection.updateMany({
        where: {
          id: connection.id,
          credentialFingerprint: connection.credentialFingerprint,
        },
        data: { lastSyncStartedAt: new Date() },
      });
    return { status: job.status, jobId: job.id };
  }
  /** First pull after connect: default window; wellness only when health was checked. */
  async enqueueAfterConnect(userId: string, provider: PersonalProvider) {
    const connection = await this.connections.require(userId, provider);
    const timezone = await this.connections.resolveAccountTimezone(userId);
    const base = personalSettings(connection);
    const settings = {
      ...base,
      timezone,
      activities: connection.syncActivities !== false && base.activities,
      wellness: connection.syncWellness === true && base.wellness,
    };
    if (!settings.activities && !settings.wellness)
      return { status: 'SKIPPED', jobId: null as string | null };
    const endDate = localToday(timezone);
    const startDate = addDays(endDate, provider === 'garmin' ? -59 : -29);
    dateRange(startDate, endDate);
    const requestId = randomUUID();
    const job = await this.prisma.personalProviderJob.create({
      data: {
        connectionId: connection.id,
        requestId,
        kind: 'SYNC',
        payload: json({
          startDate,
          endDate,
          trigger: 'first_connect' satisfies PersonalSyncTrigger,
          settings,
          credentialVersion: connection.credentialFingerprint,
          accountRef: personalAccountRef(connection),
        }),
        result: json({
          cursor: startDate,
          activityDone: !settings.activities,
          healthDone: !settings.wellness,
          heartRateZonesDone:
            !settings.wellness || provider !== 'garmin',
          childIds: [],
          discovered: 0,
        }),
      },
    });
    await this.prisma.externalProviderConnection.updateMany({
      where: {
        id: connection.id,
        credentialFingerprint: connection.credentialFingerprint,
      },
      data: { lastSyncStartedAt: new Date() },
    });
    return { status: job.status, jobId: job.id };
  }
  /**
   * Web focus short-window sync. Server enforces ≥1h since last successful sync
   * and skips when a SYNC job is already in flight.
   */
  async enqueueFocus(userId: string, provider: PersonalProvider) {
    const connection = await this.connections.require(userId, provider);
    if (!connection.syncActivities && !connection.syncWellness)
      return { status: 'SKIPPED', jobId: null as string | null, reason: 'disabled' };
    if (
      connection.lastSyncCompletedAt &&
      Date.now() - connection.lastSyncCompletedAt.getTime() < 60 * 60_000
    )
      return { status: 'SKIPPED', jobId: null as string | null, reason: 'throttled' };
    const active = await this.prisma.personalProviderJob.findFirst({
      where: {
        connectionId: connection.id,
        kind: 'SYNC',
        status: { in: ['QUEUED', 'RUNNING', 'WAITING'] },
      },
      select: { id: true },
    });
    if (active)
      return { status: 'SKIPPED', jobId: null as string | null, reason: 'in_flight' };
    const timezone = await this.connections.resolveAccountTimezone(userId);
    const endDate = localToday(timezone);
    const startDate = addDays(endDate, -1);
    const settings = {
      ...personalSettings(connection),
      timezone,
      activities: connection.syncActivities !== false,
      wellness: connection.syncWellness === true,
    };
    const requestId = createHash('sha256')
      .update(`focus:${connection.id}:${endDate}:${Math.floor(Date.now() / 3600_000)}`)
      .digest('hex');
    const job = await this.prisma.personalProviderJob.upsert({
      where: {
        connectionId_requestId: { connectionId: connection.id, requestId },
      },
      update: {},
      create: {
        connectionId: connection.id,
        requestId,
        kind: 'SYNC',
        payload: json({
          startDate,
          endDate,
          trigger: 'focus' satisfies PersonalSyncTrigger,
          settings,
          credentialVersion: connection.credentialFingerprint,
          accountRef: personalAccountRef(connection),
        }),
        result: json({
          cursor: startDate,
          activityDone: !settings.activities,
          healthDone: !settings.wellness,
          heartRateZonesDone: true,
          childIds: [],
          discovered: 0,
        }),
      },
    });
    if (job.status === 'QUEUED')
      await this.prisma.externalProviderConnection.updateMany({
        where: { id: connection.id },
        data: { lastSyncStartedAt: new Date() },
      });
    return { status: job.status, jobId: job.id };
  }
  /** Dawn sync in each account TIMEZONE at/after 03:00; not a fifteen-minute poll. */
  async schedule() {
    const rows = await this.prisma.externalProviderConnection.findMany({
      where: {
        provider: { in: ['garmin', 'coros'] },
        status: 'ACTIVE',
        syncScheduledActivities: true,
      },
      take: 100,
    });
    for (const row of rows) {
      if (!isPersonalConnection(row)) continue;
      if (!row.syncActivities && !row.syncWellness) continue;
      const timezone = await this.connections.resolveAccountTimezone(row.userId);
      const now = new Date();
      const localHour = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          hourCycle: 'h23',
        }).format(now),
      );
      if (!Number.isFinite(localHour) || localHour < 3) continue;
      const today = localToday(timezone, now);
      if (
        row.lastSyncCompletedAt &&
        localToday(timezone, row.lastSyncCompletedAt) >= today
      )
        continue;
      if (
        row.lastSyncStartedAt &&
        Date.now() - row.lastSyncStartedAt.getTime() < 45 * 60_000 &&
        (!row.lastSyncCompletedAt ||
          row.lastSyncStartedAt > row.lastSyncCompletedAt)
      )
        continue;
      const active = await this.prisma.personalProviderJob.findFirst({
        where: {
          connectionId: row.id,
          kind: 'SYNC',
          status: { in: ['QUEUED', 'RUNNING', 'WAITING'] },
        },
      });
      if (active) continue;
      const endDate = today;
      const startDate = addDays(endDate, -1);
      const settings = {
        ...personalSettings(row),
        timezone,
        activities: row.syncActivities !== false,
        wellness: row.syncWellness === true,
      };
      if (!settings.activities && !settings.wellness) continue;
      const requestId = createHash('sha256')
        .update(`dawn:${row.id}:${today}`)
        .digest('hex');
      await this.prisma.personalProviderJob.upsert({
        where: { connectionId_requestId: { connectionId: row.id, requestId } },
        update: {},
        create: {
          connectionId: row.id,
          requestId,
          kind: 'SYNC',
          payload: json({
            startDate,
            endDate,
            trigger: 'dawn' satisfies PersonalSyncTrigger,
            settings,
            credentialVersion: row.credentialFingerprint,
            accountRef: personalAccountRef(row),
          }),
          result: json({
            cursor: startDate,
            childIds: [],
            discovered: 0,
            activityDone: !settings.activities,
            healthDone: !settings.wellness,
            heartRateZonesDone: true,
          }),
        },
      });
      await this.prisma.externalProviderConnection.updateMany({
        where: { id: row.id },
        data: { lastSyncStartedAt: new Date() },
      });
    }
  }
  private async checkpoint(
    job: PersonalProviderJob,
    result: Record<string, unknown>,
    delay = 0,
    status = 'WAITING',
  ) {
    const changed = await this.prisma.personalProviderJob.updateMany({
      where: this.leaseWhere(job),
      data: {
        status,
        result: json(result),
        leaseUntil: null,
        attempts: 0,
        errorCode: null,
        nextAttemptAt: new Date(Date.now() + delay),
      },
    });
    return changed.count === 1;
  }
  async run(job: PersonalProviderJob, connection: ExternalProviderConnection) {
    this.leaseWhere(job);
    const version = record(job.payload).credentialVersion;
    if (version && version !== connection.credentialFingerprint)
      throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
    if (
      (job.kind === 'ACTIVITY' && connection.syncActivities === false) ||
      (job.kind === 'HEALTH' && connection.syncWellness === false)
    ) {
      await this.checkpoint(job, record(job.result), 0, 'CANCELLED');
      return;
    }
    if (
      job.kind === 'HEALTH' &&
      record(job.payload).timezone !==
        (await this.connections.resolveAccountTimezone(connection.userId))
    )
      throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
    if (job.kind === 'ACTIVITY') return this.activity(job, connection);
    if (job.kind === 'HEALTH') return this.wellness(job, connection);
    if (job.kind !== 'SYNC')
      throw new PersonalProviderError('PROVIDER_JOB_KIND_INVALID');
    const payload = record(job.payload),
      result = record(job.result);
    if (payload.credentialVersion !== connection.credentialFingerprint)
      throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
    const settings = record(payload.settings);
    const childIds: string[] = Array.isArray(result.childIds)
      ? result.childIds
      : [];
    if (!result.activityDone && connection.syncActivities !== false) {
      const day = result.cursor as string;
      let activities: Array<{
        id: string;
        title?: string;
        sportType?: number;
        day?: string;
      }>;
      if (connection.provider === 'garmin') {
        // Full selected startDate–endDate with offset pages (not one calendar day
        // per request). Absence runs once after the last page of this window.
        const offset = Number(result.offset ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset >= 9900)
          throw new PersonalProviderError('PROVIDER_WINDOW_INCOMPLETE');
        activities = await this.connections.authorized(
          connection.id,
          (c, token) =>
            this.garmin.activities(
              personalRegion(c),
              token,
              String(payload.startDate),
              String(payload.endDate),
              offset,
            ),
        );
      } else {
        let pageLimit = corosRecordPageLimit(
          this.connections.tools(connection),
        );
        let items: unknown[];
        for (;;) {
          const raw = await this.connections.readCoros(
            connection.id,
            'querySportRecords',
            {
              startDate: day.replace(/-/g, ''),
              endDate: day.replace(/-/g, ''),
              limit: pageLimit,
            },
          );
          const page = Array.isArray(raw)
            ? raw
            : (record(raw).records ??
              record(raw).activities ??
              record(raw).data);
          const envelope = record(raw);
          if (
            envelope.success === false ||
            envelope.error != null ||
            (typeof envelope.code === 'number' &&
              ![0, 200].includes(envelope.code))
          )
            throw new PersonalProviderError('PROVIDER_TOOL_FAILED');
          if (!Array.isArray(page))
            throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
          items = page;
          if (
            items.length < pageLimit &&
            envelope.hasMore !== true &&
            !(
              typeof envelope.total === 'number' &&
              envelope.total > items.length
            )
          )
            break;
          const larger = corosRecordPageLimit(
            this.connections.tools(connection),
            pageLimit * 2,
          );
          if (larger === pageLimit)
            throw new PersonalProviderError('PROVIDER_WINDOW_INCOMPLETE');
          pageLimit = larger;
        }
        activities = items.map((item) => {
          const activity = record(item);
          if (!Number.isInteger(activity.sportType))
            throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
          return {
            id: requireId(activity.labelId),
            sportType: activity.sportType,
            title:
              typeof activity.name === 'string'
                ? activity.name.slice(0, 500)
                : undefined,
          };
        });
      }
      await this.current(job, connection, 'ACTIVITY');
      const previousIds: string[] =
        connection.provider === 'garmin' && Array.isArray(result.dayIds)
          ? result.dayIds
          : [];
      const ids = activities.map((item) => item.id);
      const dayIds = [...previousIds, ...ids];
      if (
        new Set(dayIds).size !== dayIds.length ||
        (activities.length > 99 && connection.provider === 'garmin')
      )
        throw new PersonalProviderError('PROVIDER_WINDOW_INCOMPLETE');
      const anotherPage =
        connection.provider === 'garmin' && activities.length === 99;
      if (!anotherPage) {
        // Absence needs a complete observation window and two separated misses.
        // Garmin: whole startDate–endDate after the last offset page.
        // COROS: still one calendar day.
        const previous = await this.prisma.personalProviderJob.findMany({
          where: {
            connectionId: connection.id,
            kind: 'ACTIVITY',
            requestId: {
              startsWith: `activity:${personalAccountRef(connection)}:`,
            },
            ...(connection.provider === 'garmin'
              ? {}
              : { payload: { path: ['day'], equals: day } }),
          },
        });
        const present = new Set(dayIds);
        for (const prior of previous) {
          const priorDay = String(record(prior.payload).day ?? '');
          if (
            connection.provider === 'garmin' &&
            (priorDay < String(payload.startDate) ||
              priorDay > String(payload.endDate))
          )
            continue;
          if (!present.has(String(record(prior.payload).id))) {
            const old = record(prior.result);
            if (old.remoteDeleted) continue;
            const first =
              typeof old.missingSince === 'string'
                ? Date.parse(old.missingSince)
                : NaN;
            if (Number.isFinite(first) && Date.now() - first >= 30 * 60_000) {
              if (connection.provider === 'garmin') {
                // Sync path no longer calls activity detail. Without an
                // authoritative 404, keep the reversible missing marker only.
                continue;
              }
              await this.current(job, connection, 'ACTIVITY');
              await this.sourceLifecycle.deactivateProviderData({
                userId: connection.userId,
                provider: connection.provider,
                externalIds: [String(record(prior.payload).id)],
                sourceUids: [
                  `${connection.provider}:${personalAccountRef(connection)}:${record(prior.payload).id}`,
                ],
              });
              await this.prisma.personalProviderJob.updateMany({
                where: { id: prior.id, status: { not: 'RUNNING' } },
                data: {
                  result: json({ ...old, remoteDeleted: true }),
                  errorCode: 'PROVIDER_REMOTE_DELETED',
                },
              });
            } else if (!Number.isFinite(first))
              await this.prisma.personalProviderJob.updateMany({
                where: { id: prior.id, status: { not: 'RUNNING' } },
                data: {
                  result: json({
                    ...old,
                    missingSince: new Date().toISOString(),
                  }),
                },
              });
          }
        }
      }
      for (const activity of activities) {
        const requestId = `activity:${personalAccountRef(connection)}:${activity.id}`;
        let child = await this.prisma.personalProviderJob.findUnique({
          where: {
            connectionId_requestId: { connectionId: connection.id, requestId },
          },
        });
        if (!child)
          child = await this.prisma.personalProviderJob.create({
            data: {
              connectionId: connection.id,
              requestId,
              kind: 'ACTIVITY',
              // Park every discovery hit; releaseNextSerialActivity opens one slot.
              status: 'WAITING',
              nextAttemptAt: PERSONAL_ACTIVITY_PARKED_AT,
              payload: json({
                ...activity,
                day: activity.day ?? day,
                credentialVersion: connection.credentialFingerprint,
                accountRef: personalAccountRef(connection),
              }),
              result: json({ serialHeld: true }),
            },
          });
        // Retry failed/cancelled downloads only. SUCCEEDED with imported=1 stay
        // frozen so a later sync does not re-pull FIT unless we add an explicit force.
        // Keep siblings held so FIT downloads stay one-at-a-time instead of thrashing WAITING.
        const childResult = record(child.result);
        const alreadyImported =
          child.status === 'SUCCEEDED' &&
          childResult.imported === 1 &&
          !childResult.remoteDeleted;
        if (alreadyImported) {
          // Count toward this parent; do not reopen the FIT slot.
        } else if (['FAILED', 'SUCCEEDED', 'CANCELLED'].includes(child.status))
          await this.prisma.personalProviderJob.update({
            where: { id: child.id },
            data: {
              status: 'WAITING',
              errorCode: null,
              attempts: 0,
              nextAttemptAt: PERSONAL_ACTIVITY_PARKED_AT,
              ...{
                payload: json({
                  ...activity,
                  day: activity.day ?? day,
                  credentialVersion: connection.credentialFingerprint,
                  accountRef: personalAccountRef(connection),
                }),
                result: json({
                  ...childResult,
                  validateRemote: true,
                  missingSince: null,
                  serialHeld: true,
                }),
              },
            },
          });
        if (!childIds.includes(child.id)) childIds.push(child.id);
      }
      await this.releaseNextSerialActivity(connection.id, childIds);
      // Garmin finishes the whole window via offset pages; COROS still advances one day.
      const cursor =
        connection.provider === 'garmin'
          ? anotherPage
            ? day
            : addDays(String(payload.endDate), 1)
          : anotherPage
            ? day
            : addDays(day, 1);
      await this.checkpoint(
        job,
        {
          ...result,
          childIds,
          cursor,
          offset: anotherPage ? Number(result.offset ?? 0) + 99 : 0,
          dayIds: anotherPage ? dayIds : [],
          discovered: childIds.length,
          activityDone:
            connection.provider === 'garmin'
              ? !anotherPage
              : cursor > payload.endDate,
        },
        1000,
      );
      return;
    }
    if (
      !result.heartRateZonesDone &&
      connection.provider === 'garmin' &&
      connection.syncWellness !== false &&
      settings.wellness !== false
    ) {
      await this.importGarminHeartRateZones(job, connection);
      await this.checkpoint(
        job,
        { ...result, heartRateZonesDone: true },
        1000,
      );
      return;
    }
    if (!result.healthDone && connection.syncWellness !== false) {
      const day = result.healthCursor ?? payload.startDate;
      const trigger = String(payload.trigger ?? 'manual');
      const requestId = `health:${personalAccountRef(connection)}:${day}:${job.id}`;
      const child = await this.prisma.personalProviderJob.upsert({
        where: {
          connectionId_requestId: { connectionId: connection.id, requestId },
        },
        update: {},
        create: {
          connectionId: connection.id,
          requestId,
          kind: 'HEALTH',
          payload: json({
            day,
            timezone: settings.timezone,
            summaryMode: garminSummaryMode(trigger),
            trigger,
            credentialVersion: connection.credentialFingerprint,
            accountRef: personalAccountRef(connection),
          }),
        },
      });
      if (!childIds.includes(child.id)) childIds.push(child.id);
      const cursor = addDays(day, 1);
      await this.checkpoint(
        job,
        {
          ...result,
          childIds,
          healthCursor: cursor,
          healthDone: cursor > payload.endDate,
        },
        1000,
      );
      return;
    }
    await this.releaseNextSerialActivity(connection.id, childIds);
    const children = await this.prisma.personalProviderJob.findMany({
      where: { id: { in: childIds }, connectionId: connection.id },
      select: { status: true, kind: true, result: true },
    });
    const { failed, pending, ...totals } = personalSyncCounts(children);
    const counts = {
      ...result,
      ...totals,
      failed,
      pending,
    };
    if (pending) {
      // Serial handoff: wake soon while held/active downloads remain; long wait for import/backoff.
      const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN']);
      const activityPending = children.filter(
        (child) => child.kind === 'ACTIVITY' && !terminal.has(child.status),
      );
      const heldRemain = activityPending.some((child) =>
        isPersonalActivitySerialHeld(child.result),
      );
      const activeDownload = activityPending.some(
        (child) => !isPersonalActivitySerialHeld(child.result),
      );
      await this.checkpoint(
        job,
        counts,
        heldRemain || activeDownload ? 2_000 : 15_000,
      );
      return;
    }
    if (
      !(await this.checkpoint(job, counts, 0, failed ? 'FAILED' : 'SUCCEEDED'))
    )
      return;
    await this.prisma.externalProviderConnection.updateMany({
      where: {
        id: connection.id,
        credentialFingerprint: connection.credentialFingerprint,
      },
      data: {
        lastSyncCompletedAt: failed ? undefined : new Date(),
        lastError: failed ? 'PROVIDER_SYNC_PARTIAL_FAILED' : null,
      },
    });
  }
  /**
   * Personal FIT downloads share one claim slot per connection already, but enqueueing
   * every ACTIVITY as QUEUED still leaves dozens bouncing on WAITING backoff. Park
   * siblings with serialHeld and open exactly one claimable child at a time.
   */
  private async releaseNextSerialActivity(
    connectionId: string,
    childIds: string[],
  ) {
    if (!childIds.length) return false;
    const children = await this.prisma.personalProviderJob.findMany({
      where: {
        id: { in: childIds },
        connectionId,
        kind: 'ACTIVITY',
      },
      select: {
        id: true,
        status: true,
        result: true,
        createdAt: true,
        errorCode: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN']);
    const active = children.filter(
      (child) =>
        !terminal.has(child.status) &&
        !isPersonalActivitySerialHeld(child.result),
    );
    // After upgrade, pre-serial WAITING storms may still have many claimable
    // children. Keep the oldest active slot and re-park the rest.
    if (active.length > 1) {
      for (const extra of active.slice(1)) {
        await this.prisma.personalProviderJob.updateMany({
          where: {
            id: extra.id,
            connectionId,
            status: { in: ['QUEUED', 'WAITING'] },
          },
          data: {
            status: 'WAITING',
            nextAttemptAt: PERSONAL_ACTIVITY_PARKED_AT,
            result: json({
              ...record(extra.result),
              serialHeld: true,
            }),
          },
        });
      }
      return true;
    }
    if (active.length === 1) return false;
    const next = children.find(
      (child) =>
        child.status === 'WAITING' && isPersonalActivitySerialHeld(child.result),
    );
    if (!next) return false;
    const released = await this.prisma.personalProviderJob.updateMany({
      where: {
        id: next.id,
        connectionId,
        status: 'WAITING',
      },
      data: {
        status: 'QUEUED',
        errorCode: null,
        attempts: 0,
        nextAttemptAt: new Date(),
        result: json({
          ...record(next.result),
          serialHeld: false,
        }),
      },
    });
    return released.count === 1;
  }
  private async current(
    job: PersonalProviderJob,
    connection: ExternalProviderConnection,
    kind: 'ACTIVITY' | 'HEALTH',
    timezone?: string,
  ) {
    this.leaseWhere(job);
    const current = await this.connections.require(
      connection.userId,
      connection.provider as PersonalProvider,
    );
    this.leaseWhere(job);
    if (
      current.id !== connection.id ||
      current.credentialFingerprint !== connection.credentialFingerprint ||
      (kind === 'ACTIVITY' && current.syncActivities === false) ||
      (kind === 'HEALTH' &&
        (current.syncWellness === false ||
          (timezone &&
            (await this.connections.resolveAccountTimezone(current.userId)) !==
              timezone)))
    )
      throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
    return current;
  }
  private leaseWhere(
    job: PersonalProviderJob,
  ): Prisma.PersonalProviderJobWhereInput {
    const now = new Date();
    if (!job.leaseUntil || job.leaseUntil <= now)
      throw new PersonalProviderError('PROVIDER_LEASE_LOST');
    return {
      id: job.id,
      status: 'RUNNING',
      leaseUntil: { equals: job.leaseUntil, gt: now },
    };
  }
  private async reserveCorosFile(expected: ExternalProviderConnection) {
    await this.prisma.$transaction(async (tx) => {
      // Serialize reservations with each other and with credential replacement.
      // updatedAt alone is not a lock: two writes can share a millisecond.
      await tx.$executeRaw`SELECT id FROM t_external_provider_connection WHERE id=${expected.id} FOR UPDATE`;
      const connection = await tx.externalProviderConnection.findUnique({
        where: { id: expected.id },
      });
      if (
        !connection ||
        connection.status !== 'ACTIVE' ||
        connection.credentialFingerprint !== expected.credentialFingerprint
      )
        throw new PersonalProviderError('PROVIDER_CONNECTION_CHANGED');
      const metadata = personalMetadata(connection);
      const account = personalAccountRef(connection);
      const quotas = record(metadata.fitQuotas);
      const old = record(quotas[account]);
      const now = Date.now();
      // A fixed reset window can permit 100 downloads around its boundary.
      // Retain at most 50 reservations for a true rolling 24-hour budget.
      const reservations: number[] = Array.isArray(old.reservations)
        ? old.reservations
            .filter(
              (at: unknown): at is number =>
                typeof at === 'number' &&
                Number.isFinite(at) &&
                at > now - 86400_000,
            )
            .sort((a: number, b: number) => a - b)
        : Array(
            Math.min(50, Math.max(0, Math.floor(Number(old.count) || 0))),
          ).fill(now);
      if (reservations.length >= 50)
        throw new PersonalProviderError(
          'PROVIDER_RATE_LIMITED',
          reservations[0] + 86400_000 - now,
          429,
        );
      reservations.push(now);
      const updated = await tx.externalProviderConnection.updateMany({
        where: { id: connection.id, updatedAt: connection.updatedAt },
        data: {
          metadata: json({
            ...metadata,
            fitQuotas: { ...quotas, [account]: { reservations } },
          }),
        },
      });
      if (updated.count !== 1)
        throw new PersonalProviderError('PROVIDER_BUSY', 5000);
    });
  }
  private async activity(
    job: PersonalProviderJob,
    connection: ExternalProviderConnection,
  ) {
    const input = record(job.payload),
      result = record(job.result);
    if (
      connection.provider === 'garmin' &&
      result.validateRemote
    ) {
      // List → FIT only. An explicit re-sync clears the cached file so FIT is
      // fetched again; the importer still skips unchanged bytes by checksum.
      await this.checkpoint(
        job,
        {
          ...result,
          validateRemote: false,
          detailChanged: true,
          remoteDetail: null,
          fileKey: undefined,
          fileName: undefined,
          checksum: undefined,
          batchId: undefined,
        },
        0,
      );
      return;
    }
    if (
      connection.provider === 'coros' &&
      (result.validateRemote || !result.remoteHash)
    ) {
      const detail = await this.connections.readCoros(
        connection.id,
        'getActivityDetail',
        { labelId: input.id, sportType: input.sportType },
      );
      const remoteHash = createHash('sha256')
        .update(JSON.stringify({ detail, title: input.title ?? null }))
        .digest('hex');
      const unchanged =
        remoteHash === result.remoteHash &&
        !result.remoteDeleted &&
        result.imported === 1;
      await this.checkpoint(
        job,
        unchanged
          ? { ...result, validateRemote: false, missingSince: null }
          : {
              remoteHash,
              remoteDetail: detail,
              detailChanged: true,
              validateRemote: false,
            },
        0,
        unchanged ? 'SUCCEEDED' : 'WAITING',
      );
      return;
    }
    if (result.batchId) {
      const batch = await this.importJobs.batchJobs().findFirst({
        where: { id: result.batchId, userId: connection.userId },
        select: { status: true },
      });
      if (!batch) throw new PersonalProviderError('PROVIDER_IMPORT_MISSING');
      if (batch.status === 'COMPLETED') {
        await this.checkpoint(
          job,
          { ...result, batchId: result.batchId, imported: 1 },
          0,
          'SUCCEEDED',
        );
        return;
      }
      if (['FAILED', 'PARTIAL_FAILED', 'CANCELLED'].includes(batch.status))
        throw new PersonalProviderError('PROVIDER_IMPORT_FAILED');
      await this.checkpoint(job, result, 10_000);
      return;
    }
    let fileKey: string = result.fileKey,
      fileName: string = result.fileName,
      checksum: string = result.checksum;
    if (!fileKey) {
      let file: { buffer: Buffer; fileName: string };
      if (connection.provider === 'garmin') {
        const bytes = await this.connections.authorized(
          connection.id,
          (c, token) =>
            this.garmin.download(personalRegion(c), token, input.id),
        );
        file = await extractActivityArchive(bytes);
      } else {
        await this.reserveCorosFile(connection);
        const response = await this.connections.readCoros(
          connection.id,
          'queryActivityFitFileDownloadUrls',
          { labelId: input.id, sportType: input.sportType, limit: 1 },
        );
        const root = record(response);
        const files = Array.isArray(response)
          ? response
          : (root.files ?? root.data ?? root.urls);
        const first = record(Array.isArray(files) ? files[0] : response);
        const url = first.downloadUrl ?? first.url;
        if (typeof url !== 'string')
          throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
        file = {
          buffer: await downloadCorosFile(url),
          fileName: `${input.id}.fit`,
        };
      }
      const stored = await this.storage.uploadFile({
        buffer: file.buffer,
        originalname: file.fileName,
        size: file.buffer.length,
        mimetype: 'application/octet-stream',
      } as Express.Multer.File);
      fileKey = stored.fileKey;
      fileName = file.fileName;
      checksum = createHash('sha256').update(file.buffer).digest('hex');
      // Persist the cache before batch creation, so retries never request the same FIT URL again.
      const cached = await this.prisma.personalProviderJob.updateMany({
        where: this.leaseWhere(job),
        data: { result: json({ ...result, fileKey, fileName, checksum }) },
      });
      if (cached.count !== 1)
        throw new PersonalProviderError('PROVIDER_LEASE_LOST');
    }
    await this.current(job, connection, 'ACTIVITY');
    const batch = await this.imports.createExternalProviderImportBatch({
      userId: connection.userId,
      provider: connection.provider,
      sourceKind:
        connection.provider === 'garmin' ? 'GARMIN_PERSONAL_API' : 'COROS_MCP',
      candidates: [
        {
          sourceUid: `${connection.provider}:${personalAccountRef(connection)}:${input.id}`,
          externalId: input.id,
          accountRef: personalAccountRef(connection),
          objectType: 'ACTIVITY',
          rawChecksum: checksum,
          timelineTitle: input.title,
          sourceRef: { fileKey, fileName },
          metadata: {
            connectionMode: personalMetadata(connection).connectionMode,
            remoteDetail: result.remoteDetail ?? null,
            title: input.title ?? null,
          },
          rawPayload: result.remoteDetail,
        },
      ],
      requestContext: {
        trigger: 'PERSONAL_PROVIDER',
        connectionId: connection.id,
      },
      reuseRunningBatch: true,
      skipCompletedUnchanged: result.detailChanged ? false : undefined,
    });
    await this.checkpoint(
      job,
      {
        ...result,
        fileKey,
        fileName,
        checksum,
        batchId: batch.batch?.id ?? null,
        imported: batch.batch ? 0 : 1,
        skipped: batch.skippedCount,
      },
      batch.batch ? 10_000 : 0,
      batch.batch ? 'WAITING' : 'SUCCEEDED',
    );
  }
  private async wellness(
    job: PersonalProviderJob,
    connection: ExternalProviderConnection,
  ) {
    const input = record(job.payload),
      day = input.day as string;
    if (connection.provider === 'garmin') {
      const get = (path: string, query: Record<string, string> = {}) =>
        this.connections.authorized(connection.id, (c, token) =>
          this.garmin.get(personalRegion(c), token, path, query),
        );
      const snapshot: Record<string, unknown> = {};
      const resources: Record<string, string> = {};
      const previous = record(job.result);
      if (
        previous.healthCheckpointVersion === 1 &&
        previous.credentialVersion === connection.credentialFingerprint &&
        typeof previous.sourceObjectId === 'string'
      ) {
        const saved = await this.prisma.importSourceObject.findFirst({
          where: {
            id: previous.sourceObjectId,
            userId: connection.userId,
            sourceKind: 'GARMIN_PERSONAL_API',
            accountRef: personalAccountRef(connection),
            externalId: day,
          },
          select: { rawPayload: true },
        });
        const raw = record(saved?.rawPayload);
        if (raw.timezone === input.timezone) {
          for (const [name, value] of Object.entries(record(raw.snapshot))) {
            const state = record(previous.resources)[name];
            if (state === 'READ' || state === 'NO_DATA') {
              snapshot[name] = value;
              resources[name] = state;
            }
          }
        }
      }
      const errors: PersonalProviderError[] = [];
      const summaryMode =
        input.summaryMode === 'daily' || input.summaryMode === 'range'
          ? input.summaryMode
          : garminSummaryMode(String(input.trigger ?? 'manual'));
      // One-day requests fit all endpoint windows, including long historical backfills.
      const requests: Array<[string, string, Record<string, string>]> = [
        summaryMode === 'daily'
          ? [
              'summary',
              '/usersummary-service/usersummary/daily',
              { calendarDate: day },
            ]
          : [
              'summary',
              '/usersummary-service/v2/dailysummaries',
              { startDate: day, endDate: day },
            ],
        ['sleep', '/sleep-service/sleep/dailySleep', { date: day }],
        ['hrv', `/hrv-service/hrv/${day}`, {}],
        [
          'bodyBattery',
          '/wellness-service/wellness/bodyBattery/reports/daily',
          { startDate: day, endDate: day },
        ],
        ['spo2', `/wellness-service/wellness/daily/spo2acclimation/${day}`, {}],
        ['weight', `/weight-service/weight/all/${day}/${day}`, {}],
      ];
      for (const [name, path, query] of requests) {
        if (Object.prototype.hasOwnProperty.call(snapshot, name)) continue;
        try {
          const raw = await get(path, query);
          snapshot[name] =
            raw === null
              ? null
              : name === 'summary' && summaryMode === 'daily'
                ? normalizeGarminDailySummary(raw, day)
                : raw;
          resources[name] = snapshot[name] === null ? 'NO_DATA' : 'READ';
        } catch (error) {
          if (
            !(error instanceof PersonalProviderError) ||
            error.code === 'PROVIDER_AUTH_REQUIRED' ||
            error.code === 'PROVIDER_CONNECTION_CHANGED'
          )
            throw error;
          errors.push(error);
          resources[name] = error.code;
          // Respect rate limits immediately; save the completed reads below.
          if (error.code === 'PROVIDER_RATE_LIMITED') break;
        }
      }
      await this.current(job, connection, 'HEALTH', input.timezone);
      const source = await this.healthSource(connection, day, {
        snapshot,
        resources,
        timezone: input.timezone,
      });
      const candidates = new Map<
        string,
        ReturnType<typeof garminHealthProjection>['candidates'][number]
      >();
      const managed = new Set<string>();
      for (const name of Object.keys(snapshot)) {
        try {
          const mapped = garminHealthProjection({
            day,
            timezone: input.timezone,
            accountId: personalAccountRef(connection),
            connectionId: connection.id,
            sourceObjectId: source.id,
            [name]: snapshot[name],
          });
          for (const type of mapped.managedMetricTypes) managed.add(type);
          for (const candidate of mapped.candidates)
            candidates.set(candidate.metricType, candidate);
        } catch (error) {
          if (!(error instanceof PersonalProviderError)) throw error;
          errors.push(error);
          resources[name] = error.code;
        }
      }
      await this.current(job, connection, 'HEALTH', input.timezone);
      const projected = await this.health.replaceProviderDailyCandidates({
        userId: connection.userId,
        provider: 'GARMIN',
        connectionId: connection.id,
        localDate: new Date(`${day}T00:00:00Z`),
        externalIdPrefix: `${personalAccountRef(connection)}:${day}:`,
        managedMetricTypes: [...managed],
        candidates: [...candidates.values()],
      });
      const result = {
        day,
        healthCheckpointVersion: 1,
        credentialVersion: connection.credentialFingerprint,
        sourceObjectId: source.id,
        projection: 'DAILY_METRICS',
        resources,
        metricCount: candidates.size,
        ...projected,
      };
      if (errors.length) {
        // Preserve partial progress while fail() applies the appropriate retry
        // policy. A 403/404 is never treated as an authoritative empty metric set.
        const saved = await this.prisma.personalProviderJob.updateMany({
          where: this.leaseWhere(job),
          data: { result: json(result) },
        });
        if (saved.count !== 1)
          throw new PersonalProviderError('PROVIDER_LEASE_LOST');
        throw (
          errors.find((error) => error.code === 'PROVIDER_RATE_LIMITED') ??
          errors[0]
        );
      }
      await this.checkpoint(job, result, 0, 'SUCCEEDED');
    } else {
      const tools = this.connections.tools(connection);
      const snapshot: Record<string, unknown> = {};
      for (const name of [
        'queryDailyHealthData',
        'querySleepOverview',
        'querySleepHrv',
      ]) {
        if (!tools.some((tool) => tool.name === name)) continue;
        if (
          name === 'queryDailyHealthData' &&
          day !== localToday(input.timezone)
        )
          continue;
        snapshot[name] = await this.connections.readCoros(
          connection.id,
          name,
          name === 'queryDailyHealthData'
            ? { days: 1 }
            : {
                startDate: day.replace(/-/g, ''),
                endDate: day.replace(/-/g, ''),
              },
        );
      }
      await this.current(job, connection, 'HEALTH', input.timezone);
      const source = await this.healthSource(connection, day, snapshot);
      const mapped = corosHealthCandidates({
        day,
        timezone: input.timezone,
        accountId: personalAccountRef(connection),
        connectionId: connection.id,
        sourceObjectId: source.id,
        snapshot,
      });
      if (Object.keys(snapshot).length && !mapped.managedMetricTypes.length)
        throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
      await this.current(job, connection, 'HEALTH', input.timezone);
      const projected = await this.health.replaceProviderDailyCandidates({
        userId: connection.userId,
        provider: 'COROS',
        connectionId: connection.id,
        localDate: new Date(`${day}T00:00:00Z`),
        externalIdPrefix: `${personalAccountRef(connection)}:${day}:`,
        ...mapped,
      });
      await this.checkpoint(
        job,
        {
          day,
          sourceObjectId: source.id,
          projection: 'DAILY_METRICS',
          metricCount: mapped.candidates.length,
          ...projected,
        },
        0,
        'SUCCEEDED',
      );
    }
  }
  private async importGarminHeartRateZones(
    job: PersonalProviderJob,
    connection: ExternalProviderConnection,
  ) {
    await this.current(job, connection, 'HEALTH');
    const payload = await this.connections.authorized(connection.id, (c, token) =>
      this.garmin.get(
        personalRegion(c),
        token,
        '/biometric-service/heartRateZones/v2',
      ),
    );
    const mapped = mapGarminHeartRateZones(payload);
    for (const entry of mapped) {
      await this.users.upsertImportedZoneSetting({
        userId: connection.userId,
        provider: 'garmin',
        sportType: entry.sportType,
        zoneType: ZoneType.HEART_RATE,
        zones: entry.zones,
        benchmark: ZoneBase.CUSTOM,
        externalId: personalAccountRef(connection),
        rawPayload: entry.raw,
      });
    }
  }
  private healthSource(
    connection: ExternalProviderConnection,
    day: string,
    raw: unknown,
  ) {
    // Raw evidence survives transient jobs and disconnects. Stable identity is
    // scoped to the vendor account, not the replaceable connection row.
    const version =
      connection.provider === 'garmin'
        ? `:${createHash('sha256').update(JSON.stringify(raw)).digest('hex')}`
        : '';
    const sourceUid = `${connection.provider}:${personalAccountRef(connection)}:health:${day}${version}`;
    const sourceKind =
      connection.provider === 'garmin' ? 'GARMIN_PERSONAL_API' : 'COROS_MCP';
    return this.prisma.importSourceObject.upsert({
      where: {
        import_source_object_identity_unique: {
          userId: connection.userId,
          sourceKind,
          sourceUid,
        },
      },
      create: {
        userId: connection.userId,
        sourceKind,
        provider: connection.provider,
        sourceUid,
        accountRef: personalAccountRef(connection),
        externalId: day,
        objectType: 'HEALTH',
        rawPayload: json(raw),
      },
      update: { rawPayload: json(raw), lastSeenAt: new Date() },
    });
  }
}
