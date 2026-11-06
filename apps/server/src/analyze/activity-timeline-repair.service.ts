import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { PmcRepository } from '@/training-load/persistence/pmc.repository';

export type ActivityTimelineRepairFinding = {
  userId: string;
  effectiveFrom: Date;
  affectedActivities: number;
  activityIds: number[];
  reasons: string[];
};

type RawFinding = {
  user_id: string;
  effective_from: Date;
  affected_activity_ids: Array<bigint | number>;
  reason: string;
};

export function mergeActivityTimelineRepairFindings(
  rows: readonly RawFinding[],
): ActivityTimelineRepairFinding[] {
  const merged = new Map<
    string,
    { effectiveFrom: Date; activityIds: Set<number>; reasons: Set<string> }
  >();
  for (const row of rows) {
    const current = merged.get(row.user_id);
    const activityIds = row.affected_activity_ids
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!current) {
      merged.set(row.user_id, {
        effectiveFrom: row.effective_from,
        activityIds: new Set(activityIds),
        reasons: new Set([row.reason]),
      });
      continue;
    }
    if (row.effective_from < current.effectiveFrom) {
      current.effectiveFrom = row.effective_from;
    }
    for (const activityId of activityIds) current.activityIds.add(activityId);
    current.reasons.add(row.reason);
  }
  return [...merged.entries()]
    .map(([userId, value]) => ({
      userId,
      effectiveFrom: value.effectiveFrom,
      affectedActivities: value.activityIds.size,
      activityIds: [...value.activityIds].sort((left, right) => left - right),
      reasons: [...value.reasons].sort(),
    }))
    .sort(
      (left, right) =>
        left.effectiveFrom.getTime() - right.effectiveFrom.getTime() ||
        left.userId.localeCompare(right.userId),
    );
}

@Injectable()
export class ActivityTimelineRepairService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadReadout: LoadReadoutService,
    private readonly pmc: PmcRepository,
  ) {}

  async scan(limit = 100): Promise<ActivityTimelineRepairFinding[]> {
    const scanLimit = Math.max(1, Math.min(10_000, Math.floor(limit)));
    const [
      snapshotRows,
      falseZeroRows,
      legacyAutoRows,
      stuckImportRows,
      terminalPostProcessRows,
      deadPendingPmcRows,
      pmcRows,
      missingTimeRows,
    ] = await Promise.all([
      this.scanSnapshotGaps(scanLimit),
      this.scanFalseZeroPowerLoads(scanLimit),
      this.scanLegacyAutoTimeline(scanLimit),
      this.scanStuckImportActivities(scanLimit),
      this.scanTerminalPostProcessActivities(scanLimit),
      this.scanDeadPendingPmc(scanLimit),
      this.scanPmcMismatches(scanLimit),
      this.scanMissingActivityTimes(scanLimit),
    ]);
    return mergeActivityTimelineRepairFindings([
      ...snapshotRows,
      ...falseZeroRows,
      ...legacyAutoRows,
      ...stuckImportRows,
      ...terminalPostProcessRows,
      ...deadPendingPmcRows,
      ...pmcRows,
      ...missingTimeRows,
    ]).slice(0, scanLimit);
  }

  async enqueue(findings: readonly ActivityTimelineRepairFinding[]) {
    let created = 0;
    let updated = 0;
    let running = 0;
    for (const finding of findings) {
      let dedupeKey = `activity-timeline-repair:v1:${finding.userId}`;
      let existing = await this.prisma.activityRecomputeJob.findUnique({
        where: { dedupeKey },
        select: {
          id: true,
          status: true,
          recomputeFrom: true,
          recomputeTo: true,
        },
      });
      while (existing?.status === 'RUNNING') {
        running += 1;
        // A running page owns its immutable input window. New evidence must
        // survive as a durable follow-up rather than being silently dropped.
        dedupeKey = `${dedupeKey}:followup`;
        existing = await this.prisma.activityRecomputeJob.findUnique({
          where: { dedupeKey },
          select: {
            id: true,
            status: true,
            recomputeFrom: true,
            recomputeTo: true,
          },
        });
      }
      const now = new Date();
      const data = {
        userId: finding.userId,
        reason: 'ACTIVITY_TIMELINE_DATA_REPAIR',
        metricType: 'DATA_REPAIR',
        sportType: null,
        affectedPipelines: ['FULL'],
        recomputeFrom: finding.effectiveFrom,
        recomputeTo: now,
        lookbackDays: Math.max(
          0,
          Math.ceil(
            (now.getTime() - finding.effectiveFrom.getTime()) / 86_400_000,
          ),
        ),
        status: 'SCHEDULED' as const,
        availableAt: now,
        priority: 10,
        replayCheckpoint: null,
        attempts: 0,
        maxAttempts: 10,
        lastError: null,
        triggerSource: 'activity_timeline_repair_command',
        triggerPayload: {
          schemaVersion: 2,
          reasons: finding.reasons,
          affectedActivities: finding.affectedActivities,
          includeActivityIds: finding.activityIds,
        },
        startedAt: null,
        completedAt: null,
      };
      if (existing) {
        await this.prisma.activityRecomputeJob.update({
          where: { id: existing.id },
          data: {
            ...data,
            recomputeFrom:
              existing.recomputeFrom < data.recomputeFrom
                ? existing.recomputeFrom
                : data.recomputeFrom,
            recomputeTo:
              existing.recomputeTo > data.recomputeTo
                ? existing.recomputeTo
                : data.recomputeTo,
          },
        });
        updated += 1;
      } else {
        await this.prisma.activityRecomputeJob.create({
          data: { ...data, dedupeKey },
        });
        created += 1;
      }
    }
    return { created, updated, running };
  }

  private scanMissingActivityTimes(limit: number) {
    return this.prisma.$queryRaw<RawFinding[]>`
      SELECT a.user_id, TIMESTAMP '1970-01-01' AS effective_from,
        ARRAY_AGG(a.id ORDER BY a.id) AS affected_activity_ids,
        'ACTIVITY_START_TIME_MISSING'::text AS reason
      FROM t_activity a WHERE a.state=1 AND a.start_time IS NULL
      GROUP BY a.user_id ORDER BY a.user_id LIMIT ${limit}
    `;
  }

  private scanSnapshotGaps(limit: number) {
    return this.prisma.$queryRaw<RawFinding[]>`
      SELECT
        a.user_id,
        MIN(a.start_time) AS effective_from,
        ARRAY_AGG(DISTINCT a.id ORDER BY a.id) AS affected_activity_ids,
        'SNAPSHOT_V4_OR_CAUSAL_INPUT_MISSING'::text AS reason
      FROM t_activity a
      LEFT JOIN t_activity_fitness_metrics_snapshot s ON s.activity_id = a.id
      WHERE a.start_time IS NOT NULL
        AND a.state = 1
        AND (a.processing_status = 'READY' OR a.ready_at IS NOT NULL)
        AND (
          s.activity_id IS NULL
          OR
          s.resolution_version < 5
          OR s.calculation_fingerprint IS NULL
          OR s.input_fingerprint IS NULL
          OR s.input_dimension_fingerprints IS NULL
          OR s.context_fingerprint IS NULL
          OR s.analysis_config_fingerprint IS NULL
          OR s.resolved_load_sources IS NULL
          OR s.pmc_local_date IS NULL
          OR ((s.ftp_value IS NULL OR s.ftp_value <= 0) AND a.e_ftp > 0)
          OR ((s.cp_value IS NULL OR s.cp_value <= 0) AND a.e_cp > 0)
        )
      GROUP BY a.user_id
      ORDER BY MIN(a.start_time), a.user_id
      LIMIT ${limit}
    `;
  }

  private scanFalseZeroPowerLoads(limit: number) {
    return this.prisma.$queryRaw<RawFinding[]>`
      SELECT
        a.user_id,
        MIN(a.start_time) AS effective_from,
        ARRAY_AGG(DISTINCT a.id ORDER BY a.id) AS affected_activity_ids,
        'FALSE_ZERO_POWER_LOAD'::text AS reason
      FROM t_activity a
      LEFT JOIN t_activity_fitness_metrics_snapshot s ON s.activity_id = a.id
      LEFT JOIN t_activity_coggan c ON c.activity_id = a.id
      LEFT JOIN t_activity_bike_score b ON b.activity_id = a.id
      WHERE a.start_time IS NOT NULL
        AND a.state = 1
        AND (a.processing_status = 'READY' OR a.ready_at IS NOT NULL)
        AND a.avg_power > 0
        AND (
          (c.activity_id IS NOT NULL AND (c.intensity_factor = 0 OR c.bike_stress = 0))
          OR (b.activity_id IS NOT NULL AND (b.relative_intensity = 0 OR b.bike_score = 0))
        )
        AND (
          COALESCE(s.ftp_value, 0) <= 0
          OR COALESCE(s.cp_value, 0) <= 0
        )
      GROUP BY a.user_id
      ORDER BY MIN(a.start_time), a.user_id
      LIMIT ${limit}
    `;
  }

  private scanLegacyAutoTimeline(limit: number) {
    return this.prisma.$queryRaw<RawFinding[]>`
      WITH affected AS (
        SELECT
          m.user_id,
          MIN(m.recorded_at) AS effective_from
        FROM t_user_fitness_metric m
        WHERE m.source = 'AUTO'
          AND (
            m.projection_version IS NULL
            OR m.projection_fingerprint IS NULL
          )
        GROUP BY m.user_id
        ORDER BY MIN(m.recorded_at), m.user_id
        LIMIT ${limit}
      )
      SELECT
        affected.user_id,
        affected.effective_from,
        COALESCE((
          SELECT ARRAY_AGG(a.id ORDER BY a.id)
          FROM t_activity a
          WHERE a.user_id = affected.user_id
            AND a.start_time >= affected.effective_from
            AND a.state = 1
            AND (a.processing_status = 'READY' OR a.ready_at IS NOT NULL)
        ), ARRAY[]::integer[]) AS affected_activity_ids,
        'LEGACY_OR_COMPRESSED_AUTO_TIMELINE'::text AS reason
      FROM affected
      ORDER BY affected.effective_from, affected.user_id
    `;
  }

  private scanStuckImportActivities(limit: number) {
    return this.prisma.$queryRaw<RawFinding[]>`
      SELECT
        i.user_id,
        MIN(a.start_time) AS effective_from,
        ARRAY_AGG(DISTINCT a.id ORDER BY a.id) AS affected_activity_ids,
        'IMPORT_DONE_ACTIVITY_NOT_READY'::text AS reason
      FROM t_import_item_job i
      JOIN t_activity a ON a.id = i.activity_id
      WHERE i.status = 'DONE'
        AND i.analysis_required = TRUE
        AND a.start_time IS NOT NULL
        AND a.state = 1
        AND (a.processing_status IS DISTINCT FROM 'READY' OR a.ready_at IS NULL)
      GROUP BY i.user_id
      ORDER BY MIN(a.start_time), i.user_id
      LIMIT ${limit}
    `;
  }

  private scanTerminalPostProcessActivities(limit: number) {
    return this.prisma.$queryRaw<RawFinding[]>`
      SELECT
        p.user_id,
        MIN(a.start_time) AS effective_from,
        ARRAY_AGG(DISTINCT a.id ORDER BY a.id) AS affected_activity_ids,
        'POST_PROCESS_TERMINAL_ACTIVITY_ANALYZING'::text AS reason
      FROM t_user_post_process_job p
      JOIN t_import_item_job i ON i.batch_job_id = p.batch_job_id
      JOIN t_activity a ON a.id = i.activity_id
      WHERE p.status IN ('COMPLETED', 'DEAD')
        AND i.status = 'DONE'
        AND i.analysis_required = TRUE
        AND a.start_time IS NOT NULL
        AND a.state = 1
        AND a.processing_status = 'ANALYZING'
      GROUP BY p.user_id
      ORDER BY MIN(a.start_time), p.user_id
      LIMIT ${limit}
    `;
  }

  private scanDeadPendingPmc(limit: number) {
    return this.prisma.$queryRaw<RawFinding[]>`
      SELECT
        j.user_id,
        (j.replay_checkpoint->>'pendingPmcRecomputeFrom')::timestamptz AS effective_from,
        COALESCE((
          SELECT ARRAY_AGG(value::integer ORDER BY value::integer)
          FROM jsonb_array_elements_text(
            COALESCE(j.trigger_payload->'includeActivityIds', '[]'::jsonb)
          ) AS value
          WHERE value ~ '^[0-9]+$'
        ), ARRAY[]::integer[]) AS affected_activity_ids,
        'DEAD_JOB_WITH_PENDING_PMC'::text AS reason
      FROM t_activity_recompute_job j
      WHERE j.status = 'DEAD'
        AND j.replay_checkpoint ? 'pendingPmcRecomputeFrom'
        AND NULLIF(j.replay_checkpoint->>'pendingPmcRecomputeFrom', '') IS NOT NULL
      ORDER BY (j.replay_checkpoint->>'pendingPmcRecomputeFrom')::timestamptz, j.user_id
      LIMIT ${limit}
    `;
  }

  private async scanPmcMismatches(limit: number): Promise<RawFinding[]> {
    const findings: RawFinding[] = [];
    const affectedUsers = new Set<string>();
    const pageSize = Math.min(1_000, Math.max(100, limit * 5));
    let cursor: string | undefined;
    while (affectedUsers.size < limit) {
      const rows = await this.pmc.findMany({
        orderBy: [{ date: 'desc' }, { userId: 'asc' }, { id: 'asc' }],
        take: pageSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, userId: true, date: true, dailyValue: true },
      });
      if (rows.length === 0) break;
      const userIds = [...new Set(rows.map((row) => row.userId))];
      const rangeStart = rows.reduce(
        (earliest, row) => (row.date < earliest ? row.date : earliest),
        rows[0].date,
      );
      const latestDay = rows.reduce(
        (latest, row) => (row.date > latest ? row.date : latest),
        rows[0].date,
      );
      // pmcLocalDate may be up to roughly one civil day away from UTC start
      // time, so query a bounded margin and group by the frozen snapshot key.
      const rangeMarginMs = 36 * 60 * 60 * 1000;
      const rangeEnd = new Date(latestDay.getTime() + rangeMarginMs);
      const queryStart = new Date(rangeStart.getTime() - rangeMarginMs);
      const activities = await this.prisma.activity.findMany({
        where: readyActivityWhere({
          userId: { in: userIds },
          startTime: { gte: queryStart, lte: rangeEnd },
        }),
        select: {
          id: true,
          userId: true,
          startTime: true,
          fitnessMetricsSnapshot: {
            select: { pmcLocalDate: true },
          },
        },
      });
      const readouts = await this.loadReadout.batchGetActualLoad(
        activities.map((activity) => activity.id),
      );
      const activitiesByDay = new Map<
        string,
        Array<{ id: number; actualLoad: number | null }>
      >();
      for (const activity of activities) {
        const localDate = activity.fitnessMetricsSnapshot?.pmcLocalDate;
        if (!localDate) continue;
        const key = `${activity.userId}:${localDate}`;
        const bucket = activitiesByDay.get(key) ?? [];
        bucket.push({
          id: activity.id,
          actualLoad: readouts.get(activity.id)?.actualLoad ?? null,
        });
        activitiesByDay.set(key, bucket);
      }
      for (const row of rows) {
        const localDate = row.date.toISOString().slice(0, 10);
        const dayActivities =
          activitiesByDay.get(`${row.userId}:${localDate}`) ?? [];
        if (!dayActivities.length) {
          if (Math.abs(row.dailyValue) <= 0.0001) continue;
          findings.push({
            user_id: row.userId,
            effective_from: row.date,
            affected_activity_ids: [],
            reason: 'PMC_FINAL_LOAD_MISMATCH',
          });
          affectedUsers.add(row.userId);
          continue;
        }
        // Unknown activity load is not zero. A partially unresolved day is
        // repaired by the snapshot/false-zero scans; PMC comparison waits
        // until every activity on that day has a final load value.
        if (dayActivities.some((activity) => activity.actualLoad == null)) {
          continue;
        }
        const expected = dayActivities.reduce(
          (sum, activity) => sum + activity.actualLoad!,
          0,
        );
        if (Math.abs(expected - row.dailyValue) > 0.0001) {
          findings.push({
            user_id: row.userId,
            effective_from: row.date,
            affected_activity_ids: dayActivities.map((activity) => activity.id),
            reason: 'PMC_FINAL_LOAD_MISMATCH',
          });
          affectedUsers.add(row.userId);
        }
      }
      cursor = rows.at(-1)?.id;
      if (rows.length < pageSize) break;
    }
    return findings;
  }
}
