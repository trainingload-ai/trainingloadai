import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';

export type StateUpdateTrigger = {
  triggerType: string;
  triggerRef?: string;
  preserveCaseId?: string;
  answerQuestionId?: string;
  explicit?: boolean;
};
export type StateUpdateRequest = StateUpdateTrigger & {
  userId: string;
  mode?: 'queued' | 'immediate';
  /** Daily fact scope; checked against the athlete's evidence window, not persisted. */
  healthDate?: Date;
};
export type StateUpdateJob = {
  user_id: string;
  status: string;
  requested_version: number;
  running_version: number;
  completed_version: number;
  available_at: Date | null;
  next_available_at: Date | null;
  pending_triggers: StateUpdateTrigger[];
  running_triggers: StateUpdateTrigger[];
  lease_token: string | null;
  lease_expires_at: Date | null;
  attempts: number;
};

export function stateUpdateDelayMs() {
  const value = Number(process.env.ATHLETE_STATE_UPDATE_DELAY_MS ?? 1_200_000);
  return Number.isFinite(value) && value >= 0 ? value : 1_200_000;
}
export const STATE_UPDATE_LEASE_MS = 300_000;

/** Database-only scheduling boundary, shared by all fact writers and runners. */
@Injectable()
export class AthleteStateUpdateQueue {
  constructor(private readonly prisma: PrismaService) {}

  async requestUpdate(
    input: StateUpdateRequest,
    tx?: PrismaTx,
  ): Promise<StateUpdateJob> {
    if (!tx)
      return this.prisma.$transaction((db) => this.requestUpdate(input, db));
    const now = new Date();
    const due = new Date(
      now.getTime() + (input.mode === 'immediate' ? 0 : stateUpdateDelayMs()),
    );
    const userId = input.userId;
    // Persist only the scheduling contract, never extra event envelope fields.
    const trigger: StateUpdateTrigger = {
      triggerType: input.triggerType,
      triggerRef: input.triggerRef,
      preserveCaseId: input.preserveCaseId,
      answerQuestionId: input.answerQuestionId,
      explicit: input.explicit === true ? true : undefined,
    };
    const rows = await tx.$queryRawUnsafe<StateUpdateJob[]>(
      `
      INSERT INTO t_athlete_state_update (user_id, status, requested_version, available_at, pending_triggers)
      VALUES ($1, 'PENDING', 1, $2, $3::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET
        requested_version = t_athlete_state_update.requested_version + 1,
        status = CASE WHEN t_athlete_state_update.status = 'RUNNING' THEN 'RUNNING' ELSE 'PENDING' END,
        attempts = CASE WHEN t_athlete_state_update.status IN ('DONE','SKIPPED','DEAD') THEN 0 ELSE t_athlete_state_update.attempts END,
        available_at = CASE WHEN t_athlete_state_update.status = 'RUNNING' THEN t_athlete_state_update.available_at
          WHEN t_athlete_state_update.status IN ('DONE','SKIPPED','DEAD') THEN EXCLUDED.available_at
          ELSE LEAST(t_athlete_state_update.available_at, EXCLUDED.available_at) END,
        next_available_at = CASE WHEN t_athlete_state_update.status = 'RUNNING'
          THEN LEAST(t_athlete_state_update.next_available_at, EXCLUDED.available_at) ELSE NULL END,
        pending_triggers = (SELECT COALESCE(jsonb_agg(DISTINCT item), '[]'::jsonb)
          FROM jsonb_array_elements(t_athlete_state_update.pending_triggers || EXCLUDED.pending_triggers) item),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      userId,
      due,
      JSON.stringify([trigger]),
    );
    return rows[0];
  }

  async find(userId: string): Promise<StateUpdateJob | null> {
    const rows = await this.prisma.$queryRawUnsafe<StateUpdateJob[]>(
      'SELECT * FROM t_athlete_state_update WHERE user_id = $1',
      userId,
    );
    return rows[0] ?? null;
  }

  async claim(userId?: string): Promise<StateUpdateJob | null> {
    const now = new Date();
    const rows = await this.prisma.$queryRawUnsafe<StateUpdateJob[]>(
      `
      WITH candidate AS (
        SELECT user_id FROM t_athlete_state_update
        WHERE (($1::text IS NULL) OR user_id = $1)
          AND ((status IN ('PENDING','RETRY_WAIT') AND available_at <= $2)
            OR (status = 'RUNNING' AND lease_expires_at <= $2))
        ORDER BY available_at, user_id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE t_athlete_state_update job SET
        status = 'RUNNING', running_version = requested_version,
        running_triggers = (SELECT COALESCE(jsonb_agg(DISTINCT item), '[]'::jsonb)
          FROM jsonb_array_elements(job.running_triggers || job.pending_triggers) item),
        pending_triggers = '[]'::jsonb, next_available_at = NULL,
        lease_token = $3, lease_expires_at = $4, heartbeat_at = $2,
        attempts = attempts + 1, updated_at = $2
      FROM candidate WHERE job.user_id = candidate.user_id RETURNING job.*`,
      userId ?? null,
      now,
      randomUUID(),
      new Date(now.getTime() + STATE_UPDATE_LEASE_MS),
    );
    return rows[0] ?? null;
  }

  async heartbeat(job: StateUpdateJob) {
    const now = new Date();
    const count = await this.prisma.$executeRawUnsafe(
      `UPDATE t_athlete_state_update
      SET heartbeat_at = $3, lease_expires_at = $4
      WHERE user_id = $1 AND lease_token = $2 AND status = 'RUNNING' AND lease_expires_at > $3`,
      job.user_id,
      job.lease_token,
      now,
      new Date(now.getTime() + STATE_UPDATE_LEASE_MS),
    );
    if (count !== 1) throw new Error('ATHLETE_STATE_UPDATE_LEASE_LOST');
  }

  async finish(job: StateUpdateJob, skippedReason?: string) {
    const rows = await this.prisma.$queryRawUnsafe<StateUpdateJob[]>(
      `UPDATE t_athlete_state_update SET
      status = CASE WHEN requested_version > $3 THEN 'PENDING' ELSE $4 END,
      completed_version = $3, running_triggers = '[]'::jsonb,
      available_at = CASE WHEN requested_version > $3 THEN next_available_at ELSE NULL END,
      next_available_at = NULL, lease_token = NULL, lease_expires_at = NULL,
      attempts = 0, last_error = $5, updated_at = $6
      WHERE user_id = $1 AND lease_token = $2 AND status = 'RUNNING' AND lease_expires_at > $6 RETURNING *`,
      job.user_id,
      job.lease_token,
      job.running_version,
      skippedReason ? 'SKIPPED' : 'DONE',
      skippedReason ?? null,
      new Date(),
    );
    if (!rows.length) throw new Error('ATHLETE_STATE_UPDATE_LEASE_LOST');
    return rows[0];
  }

  async fail(job: StateUpdateJob, errorCode: string) {
    const retryAt = new Date(
      Date.now() +
        Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts - 1, 7)),
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE t_athlete_state_update SET
      status = CASE WHEN requested_version > $3 THEN 'PENDING' WHEN attempts >= 8 THEN 'DEAD' ELSE 'RETRY_WAIT' END,
      available_at = LEAST(next_available_at, $4),
      pending_triggers = (SELECT COALESCE(jsonb_agg(DISTINCT item), '[]'::jsonb)
        FROM jsonb_array_elements(pending_triggers || running_triggers) item),
      running_triggers = '[]'::jsonb, next_available_at = NULL,
      lease_token = NULL, lease_expires_at = NULL, last_error = $5, updated_at = $6
      WHERE user_id = $1 AND lease_token = $2 AND status = 'RUNNING' AND lease_expires_at > $6`,
      job.user_id,
      job.lease_token,
      job.running_version,
      retryAt,
      errorCode,
      new Date(),
    );
  }
}
