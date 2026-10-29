import {
  parseLocalStartHour,
  parsePositiveInt,
  parsePositiveMinutes,
} from '@/utils/config-number.util';
import { DEFAULT_LOCAL_STORAGE_PATH } from '@/storage/storage-path';

export interface RedisConfigType {
  host: string;
  port: string;
  password: string;
  database: number;
  ttl: string;
}

export interface JWTConfigType {
  secret: string;
  expiryTime: string;
}

const config = () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    type: process.env.DATABASE_TYPE,
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10) || 3306,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_DATABASE,
    name: process.env.DATABASE_NAME,
  },
  aiTodayWeather: {
    enabled: process.env.AI_TODAY_WEATHER_ENABLED === 'true',
    rolloutPercent: Math.max(
      0,
      Math.min(
        100,
        Number.parseInt(
          process.env.AI_TODAY_WEATHER_ROLLOUT_PERCENT || '5',
          10,
        ) || 0,
      ),
    ),
  },
  activityWeather: {
    enabled: process.env.ACTIVITY_WEATHER_ENABLED === 'true',
    pollMs: parsePositiveInt(
      process.env.ACTIVITY_WEATHER_WORKER_POLL_MS,
      1_000,
    ),
    batchSize: parsePositiveInt(
      process.env.ACTIVITY_WEATHER_WORKER_BATCH_SIZE,
      5,
    ),
    concurrency: parsePositiveInt(
      process.env.ACTIVITY_WEATHER_WORKER_CONCURRENCY,
      1,
    ),
    maxAttempts: parsePositiveInt(
      process.env.ACTIVITY_WEATHER_WORKER_MAX_ATTEMPTS,
      3,
    ),
    leaseMs: Math.max(
      60_000,
      parsePositiveInt(
        process.env.ACTIVITY_WEATHER_WORKER_LEASE_MS,
        5 * 60_000,
      ),
    ),
  },
  JWT: {
    secret: process.env.AUTH_SECRET,
    expiryTime: process.env.JWT_EXPIRY_TIME || '1d',
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    database: process.env.REDIS_DB,
    ttl: process.env.REDIS_TTL,
  },
  STORAGE_STRATEGY: process.env.STORAGE_STRATEGY || 'LOCAL',
  LOCAL_STORAGE_PATH:
    process.env.LOCAL_STORAGE_PATH || DEFAULT_LOCAL_STORAGE_PATH,
  LOCAL_STORAGE_CACHE_PATH:
    process.env.LOCAL_STORAGE_CACHE_PATH || '/data/cache/storage',

  elevation: {
    provider:
      process.env.ELEVATION_PROVIDER ||
      undefined,
    dataPath: process.env.ELEVATION_DATA_PATH || '/data/elevation',
    tileZoom: parseInt(process.env.ELEVATION_TILE_ZOOM, 10) || 13,
  },

  thirdPartyScheduler: {
    cron: process.env.THIRD_PARTY_SCHEDULER_CRON || '*/15 * * * *',
    startHourLocal: parseLocalStartHour(
      process.env.THIRD_PARTY_SCHEDULER_START_HOUR_LOCAL,
      2,
    ),
    staleStartedMinutes: parsePositiveMinutes(
      process.env.THIRD_PARTY_SCHEDULER_STALE_STARTED_MINUTES,
      60,
    ),
    batchSize: parsePositiveInt(
      process.env.THIRD_PARTY_SCHEDULER_BATCH_SIZE,
      20,
    ),
  },
  thirdPartyWebhookWorker: {
    pollMs: parsePositiveInt(
      process.env.THIRD_PARTY_WEBHOOK_WORKER_POLL_MS,
      1000,
    ),
    batchSize: parsePositiveInt(
      process.env.THIRD_PARTY_WEBHOOK_WORKER_BATCH_SIZE,
      10,
    ),
    maxAttempts: parsePositiveInt(
      process.env.THIRD_PARTY_WEBHOOK_WORKER_MAX_ATTEMPTS,
      8,
    ),
    staleAfterMs: parsePositiveInt(
      process.env.THIRD_PARTY_WEBHOOK_WORKER_STALE_AFTER_MS,
      5 * 60_000,
    ),
  },
  intervalsIcu: {
    apiBaseUrl:
      process.env.INTERVALS_ICU_API_BASE_URL || 'https://intervals.icu/api/v1',
    oauth: {
      clientID: process.env.INTERVALS_ICU_OAUTH_CLIENT_ID,
      clientSecret: process.env.INTERVALS_ICU_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.INTERVALS_ICU_OAUTH_REDIRECT_URI,
      authorizeUrl:
        process.env.INTERVALS_ICU_OAUTH_AUTHORIZE_URL ||
        'https://intervals.icu/oauth/authorize',
      tokenUrl:
        process.env.INTERVALS_ICU_OAUTH_TOKEN_URL ||
        'https://intervals.icu/api/oauth/token',
    },
    webhook: {
      secret: process.env.INTERVALS_ICU_WEBHOOK_SECRET,
      callbackUrl: process.env.INTERVALS_ICU_WEBHOOK_CALLBACK_URL,
    },
  },

  // 用于保护内部接口的共享密钥，优先使用该值
  internalApiSecret:
    process.env.INTERNAL_API_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET,
  externalProviderCredentialSecret:
    process.env.EXTERNAL_PROVIDER_CREDENTIAL_SECRET?.trim(),

  reviewWorker: {
    enabled: (process.env.REVIEW_WORKER_ENABLED ?? 'true') === 'true',
    pollMs:
      Number(process.env.REVIEW_WORKER_POLL_MS) > 0
        ? Number(process.env.REVIEW_WORKER_POLL_MS)
        : 1000,
    batchSize:
      Number(process.env.REVIEW_WORKER_BATCH_SIZE) > 0
        ? Number(process.env.REVIEW_WORKER_BATCH_SIZE)
        : 10,
    concurrency:
      Number(process.env.REVIEW_WORKER_CONCURRENCY) > 0
        ? Number(process.env.REVIEW_WORKER_CONCURRENCY)
        : 5,
    maxAttempts:
      Number(process.env.REVIEW_WORKER_MAX_ATTEMPTS) > 0
        ? Number(process.env.REVIEW_WORKER_MAX_ATTEMPTS)
        : 6,
  },

  importItemWorker: {
    enabled: (process.env.IMPORT_ITEM_WORKER_ENABLED ?? 'true') === 'true',
    pollMs:
      Number(process.env.IMPORT_ITEM_WORKER_POLL_MS) > 0
        ? Number(process.env.IMPORT_ITEM_WORKER_POLL_MS)
        : 1000,
    batchSize:
      Number(process.env.IMPORT_ITEM_WORKER_BATCH_SIZE) > 0
        ? Number(process.env.IMPORT_ITEM_WORKER_BATCH_SIZE)
        : 10,
    concurrency:
      Number(process.env.IMPORT_ITEM_WORKER_CONCURRENCY) > 0
        ? Number(process.env.IMPORT_ITEM_WORKER_CONCURRENCY)
        : 3,
    maxAttempts:
      Number(process.env.IMPORT_ITEM_WORKER_MAX_ATTEMPTS) > 0
        ? Number(process.env.IMPORT_ITEM_WORKER_MAX_ATTEMPTS)
        : 6,
    leaseMs:
      Number(process.env.IMPORT_ITEM_WORKER_LEASE_MS) >= 60_000
        ? Number(process.env.IMPORT_ITEM_WORKER_LEASE_MS)
        : 15 * 60_000,
  },

  userPostProcessWorker: {
    enabled:
      (process.env.USER_POST_PROCESS_WORKER_ENABLED ?? 'true') === 'true',
    pollMs:
      Number(process.env.USER_POST_PROCESS_WORKER_POLL_MS) > 0
        ? Number(process.env.USER_POST_PROCESS_WORKER_POLL_MS)
        : 1000,
    batchSize:
      Number(process.env.USER_POST_PROCESS_WORKER_BATCH_SIZE) > 0
        ? Number(process.env.USER_POST_PROCESS_WORKER_BATCH_SIZE)
        : 5,
    concurrency:
      Number(process.env.USER_POST_PROCESS_WORKER_CONCURRENCY) > 0
        ? Number(process.env.USER_POST_PROCESS_WORKER_CONCURRENCY)
        : 1,
    maxAttempts:
      Number(process.env.USER_POST_PROCESS_WORKER_MAX_ATTEMPTS) > 0
        ? Number(process.env.USER_POST_PROCESS_WORKER_MAX_ATTEMPTS)
        : 6,
    leaseMs:
      Number(process.env.USER_POST_PROCESS_WORKER_LEASE_MS) >= 60_000
        ? Number(process.env.USER_POST_PROCESS_WORKER_LEASE_MS)
        : 15 * 60_000,
  },

  /**
   * 分析服务：用户调整 FTP/LTHR 等基准指标后，增量复算回溯的活动天数（环境变量 ANALYZE_RECOMPUTE_WINDOW_DAYS，默认 7）
   */
  analyze: {
    recomputeWindowDays:
      parseInt(process.env.ANALYZE_RECOMPUTE_WINDOW_DAYS ?? '', 10) >= 1
        ? parseInt(process.env.ANALYZE_RECOMPUTE_WINDOW_DAYS ?? '', 10)
        : 7,
  },

  activityRecomputeWorker: {
    enabled:
      (process.env.ACTIVITY_RECOMPUTE_WORKER_ENABLED ?? 'true') === 'true',
    pollMs:
      Number(process.env.ACTIVITY_RECOMPUTE_WORKER_POLL_MS) > 0
        ? Number(process.env.ACTIVITY_RECOMPUTE_WORKER_POLL_MS)
        : 1000,
    batchSize:
      Number(process.env.ACTIVITY_RECOMPUTE_WORKER_BATCH_SIZE) > 0
        ? Number(process.env.ACTIVITY_RECOMPUTE_WORKER_BATCH_SIZE)
        : 5,
    concurrency:
      Number(process.env.ACTIVITY_RECOMPUTE_WORKER_CONCURRENCY) > 0
        ? Number(process.env.ACTIVITY_RECOMPUTE_WORKER_CONCURRENCY)
        : 1,
    maxAttempts:
      Number(process.env.ACTIVITY_RECOMPUTE_WORKER_MAX_ATTEMPTS) > 0
        ? Number(process.env.ACTIVITY_RECOMPUTE_WORKER_MAX_ATTEMPTS)
        : 3,
  },

  activityAiReviewWorker: {
    enabled:
      (process.env.ACTIVITY_AI_REVIEW_WORKER_ENABLED ?? 'true') === 'true',
    pollMs:
      Number(process.env.ACTIVITY_AI_REVIEW_WORKER_POLL_MS) > 0
        ? Number(process.env.ACTIVITY_AI_REVIEW_WORKER_POLL_MS)
        : 1000,
    batchSize:
      Number(process.env.ACTIVITY_AI_REVIEW_WORKER_BATCH_SIZE) > 0
        ? Number(process.env.ACTIVITY_AI_REVIEW_WORKER_BATCH_SIZE)
        : 5,
    concurrency:
      Number(process.env.ACTIVITY_AI_REVIEW_WORKER_CONCURRENCY) > 0
        ? Number(process.env.ACTIVITY_AI_REVIEW_WORKER_CONCURRENCY)
        : 1,
    maxAttempts:
      Number(process.env.ACTIVITY_AI_REVIEW_WORKER_MAX_ATTEMPTS) > 0
        ? Number(process.env.ACTIVITY_AI_REVIEW_WORKER_MAX_ATTEMPTS)
        : 3,
    lockTimeoutMs:
      Number(process.env.ACTIVITY_AI_REVIEW_WORKER_LOCK_TIMEOUT_MS) > 0
        ? Number(process.env.ACTIVITY_AI_REVIEW_WORKER_LOCK_TIMEOUT_MS)
        : 15 * 60_000,
  },

  activityMapThumbWorker: {
    provider:
      process.env.ACTIVITY_MAP_THUMB_PROVIDER ||
      (process.env.SELF_HOST_MODE ? 'local' : 'mapbox'),
    enabled:
      (process.env.ACTIVITY_MAP_THUMB_WORKER_ENABLED ?? 'true') === 'true',
    pollMs:
      Number(process.env.ACTIVITY_MAP_THUMB_WORKER_POLL_MS) > 0
        ? Number(process.env.ACTIVITY_MAP_THUMB_WORKER_POLL_MS)
        : 1000,
    batchSize:
      Number(process.env.ACTIVITY_MAP_THUMB_WORKER_BATCH_SIZE) > 0
        ? Number(process.env.ACTIVITY_MAP_THUMB_WORKER_BATCH_SIZE)
        : 5,
    concurrency:
      Number(process.env.ACTIVITY_MAP_THUMB_WORKER_CONCURRENCY) > 0
        ? Number(process.env.ACTIVITY_MAP_THUMB_WORKER_CONCURRENCY)
        : 1,
    leaseMs:
      Number(process.env.ACTIVITY_MAP_THUMB_WORKER_LEASE_MS) > 0
        ? Number(process.env.ACTIVITY_MAP_THUMB_WORKER_LEASE_MS)
        : 60_000,
  },

  accountDeletionWorker: {
    enabled: (process.env.ACCOUNT_DELETION_WORKER_ENABLED ?? 'true') === 'true',
    pollMs:
      Number(process.env.ACCOUNT_DELETION_WORKER_POLL_MS) > 0
        ? Number(process.env.ACCOUNT_DELETION_WORKER_POLL_MS)
        : 1000,
    batchSize:
      Number(process.env.ACCOUNT_DELETION_WORKER_BATCH_SIZE) > 0
        ? Number(process.env.ACCOUNT_DELETION_WORKER_BATCH_SIZE)
        : 1,
    leaseMs:
      Number(process.env.ACCOUNT_DELETION_WORKER_LEASE_MS) > 0
        ? Number(process.env.ACCOUNT_DELETION_WORKER_LEASE_MS)
        : 5 * 60_000,
  },

  userDataExportWorker: {
    enabled: (process.env.USER_DATA_EXPORT_WORKER_ENABLED ?? 'true') === 'true',
    pollMs:
      Number(process.env.USER_DATA_EXPORT_WORKER_POLL_MS) > 0
        ? Number(process.env.USER_DATA_EXPORT_WORKER_POLL_MS)
        : 1000,
    batchSize:
      Number(process.env.USER_DATA_EXPORT_WORKER_BATCH_SIZE) > 0
        ? Number(process.env.USER_DATA_EXPORT_WORKER_BATCH_SIZE)
        : 1,
    leaseMs:
      Number(process.env.USER_DATA_EXPORT_WORKER_LEASE_MS) > 0
        ? Number(process.env.USER_DATA_EXPORT_WORKER_LEASE_MS)
        : 5 * 60_000,
    retentionDays:
      Number(process.env.USER_DATA_EXPORT_RETENTION_DAYS) > 0
        ? Number(process.env.USER_DATA_EXPORT_RETENTION_DAYS)
        : 7,
  },

  activityRecomputePolicy: {
    freeLookbackDays:
      Number(process.env.ACTIVITY_RECOMPUTE_FREE_LOOKBACK_DAYS) > 0
        ? Number(process.env.ACTIVITY_RECOMPUTE_FREE_LOOKBACK_DAYS)
        : 7,
    vipLookbackDays:
      Number(process.env.ACTIVITY_RECOMPUTE_VIP_LOOKBACK_DAYS) > 0
        ? Number(process.env.ACTIVITY_RECOMPUTE_VIP_LOOKBACK_DAYS)
        : 30,
    vipUserIds: (process.env.ACTIVITY_RECOMPUTE_VIP_USER_IDS ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    defaultTimezone:
      process.env.ACTIVITY_RECOMPUTE_DEFAULT_TIMEZONE || 'Asia/Shanghai',
    nightlyStartHour:
      Number(process.env.ACTIVITY_RECOMPUTE_NIGHTLY_START_HOUR) >= 0 &&
      Number(process.env.ACTIVITY_RECOMPUTE_NIGHTLY_START_HOUR) <= 23
        ? Number(process.env.ACTIVITY_RECOMPUTE_NIGHTLY_START_HOUR)
        : 2,
    nightlyJitterMinutes:
      Number(process.env.ACTIVITY_RECOMPUTE_NIGHTLY_JITTER_MINUTES) >= 0
        ? Number(process.env.ACTIVITY_RECOMPUTE_NIGHTLY_JITTER_MINUTES)
        : 60,
  },

});

export type ConfigType = typeof config;
export default config;
