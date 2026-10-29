export type PublicReviewQuotaScope = 'VISITOR' | 'IP' | 'ACTIVITY' | 'GLOBAL';

export type PublicReviewQuotaSubject = {
  scope: PublicReviewQuotaScope;
  subjectHash: string;
};

export type PublicReviewQuotaSnapshot = {
  attempts: number;
  modelStarts: number;
  successes: number;
  failures: number;
  reservedWt: number;
  usedWt: number;
  nextSuccessRecoveryAt?: string;
  nextModelStartRecoveryAt?: string;
  nextTokenRecoveryAt?: string;
};

export type PublicReviewQuotaLimits = {
  visitorSuccesses: number;
  activitySuccesses: number;
  ipSuccesses: number;
  ipModelStarts: number;
  globalWeightedTokens: number;
  maxReservationWeightedTokens: number;
  reservationLeaseSeconds: number;
};

export type PublicReviewReservationInput = {
  admissionNonce: string;
  visitorHash: string;
  ipHash: string;
  activityHash: string;
};

export interface PublicReviewQuotaStore {
  snapshots(
    subjects: PublicReviewQuotaSubject[],
  ): Promise<Map<PublicReviewQuotaScope, PublicReviewQuotaSnapshot>>;
  reserve(
    input: PublicReviewReservationInput & {
      subjects: PublicReviewQuotaSubject[];
      reservedWt: number;
    },
    limits: PublicReviewQuotaLimits,
  ): Promise<{ reservationId: string }>;
  settle(input: {
    reservationId: string;
    outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    actualWt?: number;
  }): Promise<void>;
}

export type PublicReviewQuotaErrorCode =
  | 'ADMISSION_INVALID'
  | 'VISITOR_LIMIT_REACHED'
  | 'DUPLICATE_ACTIVITY_REVIEW'
  | 'NETWORK_LIMIT_REACHED'
  | 'ROLLING_BUDGET_EXHAUSTED';

export class PublicReviewQuotaError extends Error {
  constructor(
    readonly code: PublicReviewQuotaErrorCode,
    readonly nextRecoveryAt?: string,
  ) {
    super(code);
    this.name = 'PublicReviewQuotaError';
  }
}

const EMPTY: PublicReviewQuotaSnapshot = {
  attempts: 0,
  modelStarts: 0,
  successes: 0,
  failures: 0,
  reservedWt: 0,
  usedWt: 0,
};

function laterRecovery(...values: Array<string | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return timestamps.length
    ? new Date(Math.max(...timestamps)).toISOString()
    : undefined;
}

export function readPublicReviewQuotaLimits(): PublicReviewQuotaLimits {
  const positive = (keys: string[], fallback: number) => {
    for (const key of keys) {
      const value = Number(process.env[key]);
      if (Number.isFinite(value) && value > 0) return Math.floor(value);
    }
    return fallback;
  };
  return {
    visitorSuccesses: positive(
      [
        'PUBLIC_AI_REVIEW_VISITOR_ROLLING_24H_LIMIT',
        'PUBLIC_AI_REVIEW_VISITOR_DAILY_LIMIT',
      ],
      3,
    ),
    activitySuccesses: positive(
      [
        'PUBLIC_AI_REVIEW_ACTIVITY_ROLLING_24H_LIMIT',
        'PUBLIC_AI_REVIEW_ACTIVITY_DAILY_LIMIT',
      ],
      1,
    ),
    // The IP bucket is an abuse backstop, not the product-facing per-visitor
    // allowance. Keep enough headroom for shared networks and failed model
    // starts so it does not contradict the three-review visitor quota.
    ipSuccesses: positive(
      [
        'PUBLIC_AI_REVIEW_IP_ROLLING_24H_SUCCESS_LIMIT',
        'PUBLIC_AI_REVIEW_IP_DAILY_SUCCESS_LIMIT',
      ],
      12,
    ),
    ipModelStarts: positive(
      [
        'PUBLIC_AI_REVIEW_IP_ROLLING_24H_MODEL_START_LIMIT',
        'PUBLIC_AI_REVIEW_IP_DAILY_MODEL_START_LIMIT',
      ],
      24,
    ),
    globalWeightedTokens: positive(
      [
        'PUBLIC_AI_REVIEW_ROLLING_24H_WEIGHTED_TOKEN_BUDGET',
        'PUBLIC_AI_REVIEW_DAILY_WEIGHTED_TOKEN_BUDGET',
      ],
      1_000_000,
    ),
    maxReservationWeightedTokens: positive(
      ['PUBLIC_AI_REVIEW_MAX_RESERVATION_WEIGHTED_TOKENS'],
      24_000,
    ),
    // The upstream timeout can be configured up to five minutes. Keep the
    // lease longer so the reaper cannot expire a request that is still
    // legitimately generating a review.
    reservationLeaseSeconds: positive(
      ['PUBLIC_AI_REVIEW_RESERVATION_LEASE_SECONDS'],
      360,
    ),
  };
}

export class PublicReviewQuotaService {
  constructor(
    private readonly store: PublicReviewQuotaStore,
    private readonly limits = readPublicReviewQuotaLimits(),
  ) {}

  async checkAdmission(input: { visitorHash: string; ipHash: string }) {
    const snapshots = await this.store.snapshots([
      { scope: 'VISITOR', subjectHash: input.visitorHash },
      { scope: 'IP', subjectHash: input.ipHash },
      { scope: 'GLOBAL', subjectHash: 'GLOBAL' },
    ]);
    const visitor = snapshots.get('VISITOR') ?? EMPTY;
    const ip = snapshots.get('IP') ?? EMPTY;
    const global = snapshots.get('GLOBAL') ?? EMPTY;
    const remainingWeightedTokens = Math.max(
      0,
      this.limits.globalWeightedTokens - global.usedWt - global.reservedWt,
    );
    const sharedBudget = {
      rollingWindowWeightedTokenBudget: this.limits.globalWeightedTokens,
      remainingWeightedTokens,
      available:
        remainingWeightedTokens >= this.limits.maxReservationWeightedTokens,
      nextRecoveryAt: global.nextTokenRecoveryAt,
      rollingWindowHours: 24,
    };
    const visitorQuota = {
      rollingWindowReviewLimit: this.limits.visitorSuccesses,
      usedReviews: Math.min(visitor.successes, this.limits.visitorSuccesses),
      remainingReviews: Math.max(
        0,
        this.limits.visitorSuccesses - visitor.successes,
      ),
      available: visitor.successes < this.limits.visitorSuccesses,
      nextRecoveryAt: visitor.nextSuccessRecoveryAt,
      rollingWindowHours: 24,
    };

    if (!sharedBudget.available) {
      return {
        status: 'limit_reached' as const,
        code: 'ROLLING_BUDGET_EXHAUSTED' as const,
        nextRecoveryAt: sharedBudget.nextRecoveryAt,
        sharedBudget,
        visitorQuota,
      };
    }
    if (visitor.successes >= this.limits.visitorSuccesses) {
      return {
        status: 'limit_reached' as const,
        code: 'VISITOR_LIMIT_REACHED' as const,
        nextRecoveryAt: visitorQuota.nextRecoveryAt,
        sharedBudget,
        visitorQuota,
      };
    }
    if (
      ip.successes >= this.limits.ipSuccesses ||
      ip.modelStarts >= this.limits.ipModelStarts
    ) {
      return {
        status: 'limit_reached' as const,
        code: 'NETWORK_LIMIT_REACHED' as const,
        nextRecoveryAt: laterRecovery(
          ip.successes >= this.limits.ipSuccesses
            ? ip.nextSuccessRecoveryAt
            : undefined,
          ip.modelStarts >= this.limits.ipModelStarts
            ? ip.nextModelStartRecoveryAt
            : undefined,
        ),
        sharedBudget,
        visitorQuota,
      };
    }
    return { status: 'eligible' as const, sharedBudget, visitorQuota };
  }

  reserve(input: PublicReviewReservationInput) {
    return this.store.reserve(
      {
        ...input,
        reservedWt: this.limits.maxReservationWeightedTokens,
        subjects: [
          { scope: 'VISITOR', subjectHash: input.visitorHash },
          { scope: 'IP', subjectHash: input.ipHash },
          { scope: 'ACTIVITY', subjectHash: input.activityHash },
          { scope: 'GLOBAL', subjectHash: 'GLOBAL' },
        ],
      },
      this.limits,
    );
  }

  settle(input: Parameters<PublicReviewQuotaStore['settle']>[0]) {
    return this.store.settle(input);
  }
}
