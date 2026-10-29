import { HttpException, Injectable, Logger } from '@nestjs/common';

/** Consecutive model failures that stop the current hourly review run. */
export const REVIEW_MODEL_MAX_CONSECUTIVE_FAILURES = 3;

const REVIEW_MODEL_CALL_TIMEOUT_MS_DEFAULT = 120_000;
const REVIEW_MODEL_CALL_TIMEOUT_MS_MIN = 10_000;
const REVIEW_MODEL_CALL_TIMEOUT_MS_MAX = 600_000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Hard deadline for one background review model call, including the SDK's own
 * retries. Without it the OpenAI SDK default (10 min x 3 attempts) let a single
 * digest job hang the review queue for 15-30 minutes.
 */
export function reviewModelCallTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const configured = Number(env.REVIEW_MODEL_CALL_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return REVIEW_MODEL_CALL_TIMEOUT_MS_DEFAULT;
  }
  return Math.min(
    REVIEW_MODEL_CALL_TIMEOUT_MS_MAX,
    Math.max(REVIEW_MODEL_CALL_TIMEOUT_MS_MIN, Math.floor(configured)),
  );
}

/** Top of the next UTC hour, i.e. the next `0 * * * *` review cron tick. */
export function nextReviewRunAt(now: Date): Date {
  return new Date((Math.floor(now.getTime() / HOUR_MS) + 1) * HOUR_MS);
}

export class ReviewModelCallTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`Review model call timeout after ${timeoutMs}ms (${label})`);
    this.name = 'ReviewModelCallTimeoutError';
  }
}

/**
 * Thrown when the current review run has been stopped after consecutive model
 * failures. Callers must NOT swallow it into a rule-based fallback; the review
 * worker turns it into a deferral of the job to `resumeAt`.
 */
export class ReviewModelDeferredError extends Error {
  constructor(
    readonly resumeAt: Date,
    readonly reason: string,
  ) {
    super(
      `Review model calls paused until ${resumeAt.toISOString()} after ${REVIEW_MODEL_MAX_CONSECUTIVE_FAILURES} consecutive failures (last: ${reason})`,
    );
    this.name = 'ReviewModelDeferredError';
  }
}

export function isReviewModelDeferredError(
  error: unknown,
): error is ReviewModelDeferredError {
  return error instanceof ReviewModelDeferredError;
}

/**
 * Process-wide guard for background review model calls (digest summary, plan
 * review judgment, adjustment composition).
 *
 * - Every call gets a hard timeout.
 * - A thrown/timed-out call, or a response without provider usage, counts as a
 *   failure; any healthy call resets the streak. Application errors
 *   (`HttpException`, e.g. missing AI data consent) are not model failures.
 * - Isolated failures keep the caller's existing fallback behaviour.
 * - On the 3rd consecutive failure within the same hour the guard pauses until
 *   the next hourly run and throws `ReviewModelDeferredError`; while paused,
 *   every call fails fast with the same error so the worker can defer jobs
 *   instead of hammering a broken provider.
 *
 * State is per process. With several worker instances each one trips on its
 * own; jobs stay in the shared DB queue, so a deferral never loses work.
 */
@Injectable()
export class ReviewModelCallGuard {
  private readonly logger = new Logger(ReviewModelCallGuard.name);
  private consecutiveFailures = 0;
  private failureWindowHour: number | null = null;
  private pausedUntil: Date | null = null;
  /** Time source; replaced in unit tests. */
  clock: () => Date = () => new Date();

  /** Resume time when the current run is paused, otherwise null. */
  pausedUntilAt(): Date | null {
    if (!this.pausedUntil) return null;
    if (this.clock().getTime() >= this.pausedUntil.getTime()) {
      this.pausedUntil = null;
      this.consecutiveFailures = 0;
      this.failureWindowHour = null;
      this.logger.log('[复盘][模型] 暂停结束，恢复调用模型');
      return null;
    }
    return this.pausedUntil;
  }

  assertNotPaused(): void {
    const resumeAt = this.pausedUntilAt();
    if (resumeAt) throw new ReviewModelDeferredError(resumeAt, 'paused');
  }

  async run<T>(
    label: string,
    call: (signal: AbortSignal) => Promise<T>,
    options: {
      /** Return a failure reason for a resolved but unusable response. */
      failureReason?: (result: NoInfer<T>) => string | null;
    } = {},
  ): Promise<T> {
    this.assertNotPaused();
    const timeoutMs = reviewModelCallTimeoutMs();
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new ReviewModelCallTimeoutError(label, timeoutMs);
        controller.abort(error);
        reject(error);
      }, timeoutMs);
      timer.unref?.();
    });

    let result: T;
    try {
      result = await Promise.race([call(controller.signal), timeout]);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const normalized = controller.signal.aborted
        ? new ReviewModelCallTimeoutError(label, timeoutMs)
        : error;
      this.recordFailure(label, errorMessage(normalized));
      throw normalized;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const reason = options.failureReason?.(result) ?? null;
    if (reason) this.recordFailure(label, reason);
    else this.recordSuccess();
    return result;
  }

  private recordSuccess() {
    this.consecutiveFailures = 0;
    this.failureWindowHour = null;
  }

  /** Throws `ReviewModelDeferredError` when this failure trips the guard. */
  private recordFailure(label: string, reason: string) {
    const now = this.clock();
    const hour = Math.floor(now.getTime() / HOUR_MS);
    if (this.failureWindowHour !== hour) {
      // A streak only counts within one hourly run.
      this.consecutiveFailures = 0;
      this.failureWindowHour = hour;
    }
    this.consecutiveFailures += 1;
    this.logger.warn(
      `[复盘][模型] 调用失败 label=${label} 连续失败=${this.consecutiveFailures}/${REVIEW_MODEL_MAX_CONSECUTIVE_FAILURES} reason=${reason}`,
    );
    if (this.consecutiveFailures < REVIEW_MODEL_MAX_CONSECUTIVE_FAILURES) {
      return;
    }
    const resumeAt = nextReviewRunAt(now);
    this.pausedUntil = resumeAt;
    this.consecutiveFailures = 0;
    this.failureWindowHour = null;
    this.logger.error(
      `[复盘][模型] 连续 ${REVIEW_MODEL_MAX_CONSECUTIVE_FAILURES} 次模型调用失败，本轮复盘停止，剩余任务顺延到 ${resumeAt.toISOString()} label=${label} reason=${reason}`,
    );
    throw new ReviewModelDeferredError(resumeAt, reason);
  }
}

/** Shared `failureReason` for review calls that return parsed usage. */
export function reviewUsageFailureReason(result: {
  usage?: { reported?: boolean } | null;
}): string | null {
  return result.usage?.reported === false ? 'usage_missing' : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
