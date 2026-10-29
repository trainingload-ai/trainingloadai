import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExternalProviderConnection } from '@prisma/client';
import { NotificationKind, Prisma } from '@prisma/client';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { PrismaService } from '@/prisma/prisma.service';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import { ImportBatchService } from '@/importing/import-batch.service';
import { HealthDataIngestService } from '@/health-data/health-data-ingest.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { UserService } from '@/api/user/user.service';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import {
  IntervalsIcuApiError,
  IntervalsIcuClient,
  type IntervalsIcuAthleteProfile,
  type IntervalsIcuOAuthTokenResponse,
} from '@/integrations/intervals-icu/intervals-icu.client';
import {
  IntervalsIcuCredentialService,
  type IntervalsIcuApiCredential,
  type IntervalsIcuCredentialConnection,
  intervalsIcuAuthTypeFromConnection,
} from '@/integrations/intervals-icu/intervals-icu-credential.service';
import {
  intervalsIcuMetadataJson,
  intervalsIcuMetadataOf,
  intervalsIcuPlanSyncOf,
  type IntervalsIcuConnectionMetadata,
  type IntervalsIcuOAuthMetadata,
} from '@/integrations/intervals-icu/intervals-icu-metadata';
import type {
  ConnectIntervalsIcuDto,
  StartIntervalsIcuOAuthDto,
  SyncIntervalsIcuDto,
  UpdateIntervalsIcuSettingsDto,
} from './dto/intervals-icu.dto';
import { IntervalsIcuPlanSyncService } from './intervals-icu-plan-sync.service';
import {
  THIRD_PARTY_ERRORS,
  thirdPartyError,
  thirdPartyOAuthReason,
} from '@/integrations/external-provider/external-provider-errors';

/** 活动与健康同步实际依赖的最小 connection 形状。 */
export type IntervalsIcuSyncConnection = Pick<
  ExternalProviderConnection,
  'id' | 'userId' | 'status' | 'credentialCiphertext'
> & {
  externalAthleteId?: string | null;
  syncScheduledActivities?: boolean;
  syncWellness?: boolean;
  metadata?: unknown;
};

/** 凭证变更检测所需的最小 connection 形状。 */
type IntervalsIcuFingerprintConnection = Pick<
  ExternalProviderConnection,
  'credentialCiphertext'
> &
  Partial<Pick<ExternalProviderConnection, 'credentialFingerprint'>>;
import {
  dateKeyFromWellness,
  INTERVALS_ICU_AUTHORITATIVE_DAILY_METRIC_TYPES,
  mapIntervalsIcuWellnessToHealthCandidates,
} from './intervals-icu-health.mapper';
import {
  canonicalConnectionStatus,
  canonicalSettingsUpdateData,
  legacySettingsPatch,
  publicThirdPartySyncError,
} from '@/integrations/external-provider/external-provider-contract';
import { ExternalProviderOAuthStateService } from '@/integrations/external-provider/external-provider-oauth-state.service';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Date → `YYYY-MM-DD`（UTC ISO 切片）。 */
function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** 手动/首同步窗口：newest（默认今天）往前 60 天。 */
function latest60DayWindow(newest?: string) {
  const end = newest ? new Date(newest) : new Date();
  if (Number.isNaN(end.getTime())) {
    throw thirdPartyError(THIRD_PARTY_ERRORS.INTERVALS_ICU.INVALID_NEWEST_DATE);
  }
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 60);
  return {
    oldest: isoDate(start),
    newest: isoDate(end),
  };
}

/** 校验 IANA 时区名；非法则回退 UTC。 */
function normalizeTimezone(value?: unknown) {
  const timezoneName =
    typeof value === 'string' && value.trim() ? value.trim() : 'UTC';
  try {
    return dayjs().tz(timezoneName).format('YYYY-MM-DD') ? timezoneName : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** 定时同步窗口：用户本地时区的「昨天」单日。 */
function yesterdayWindow(timezoneName?: string, now = new Date()) {
  const day = dayjs(now)
    .tz(normalizeTimezone(timezoneName))
    .subtract(1, 'day')
    .format('YYYY-MM-DD');
  return {
    oldest: day,
    newest: day,
  };
}

/**
 * Intervals 的日期窗口是用户本地日期，其他来源可能使用 UTC epoch。
 * 两侧留出一天，既覆盖全球时区边界，也让同一轮发现共用一个稳定请求。
 */
function originSyncWindow(window: { oldest: string; newest: string }) {
  const start = new Date(`${window.oldest}T00:00:00.000Z`);
  const end = new Date(`${window.newest}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  end.setUTCDate(end.getUTCDate() + 2);
  return { start, end };
}

/** 非空 API Key；空则抛业务错误。 */
function normalizeApiKey(value?: string) {
  const apiKey = String(value ?? '').trim();
  if (!apiKey) {
    throw thirdPartyError(THIRD_PARTY_ERRORS.INTERVALS_ICU.API_KEY_REQUIRED);
  }
  return apiKey;
}

/** 可选 API Key（trim）；允许空字符串。 */
function optionalApiKey(value?: string) {
  return String(value ?? '').trim();
}

/** 从 AthleteProfile 提取远端运动员 id；缺失时用 `"0"`。 */
function extractExternalAthleteId(profile: IntervalsIcuAthleteProfile | null) {
  if (!profile) return '0';
  const nested = profile.athlete?.id;
  if (nested != null && String(nested).trim()) return String(nested);
  return '0';
}

/** trim 后非空字符串，否则 null。 */
function cleanString(value: unknown) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || null;
}

/** 逗号分隔 scope 字符串 → 列表。 */
function parseScopeString(value?: string | null) {
  return String(value ?? '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

/** scope 可能是数组或逗号字符串。 */
function parseScopeList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((scope) => cleanString(scope))
      .filter((scope): scope is string => Boolean(scope));
  }
  return parseScopeString(cleanString(value));
}

/** OAuth token 响应中的运动员 id。 */
function oauthAthleteId(token: IntervalsIcuOAuthTokenResponse) {
  const id = token.athlete?.id;
  return id == null || id === '' ? '0' : String(id);
}

/** 给 URL 追加/覆盖 query 参数。 */
function addQuery(url: string, values: Record<string, string>) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(values)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

/**
 * Intervals.icu 业务编排：连接（API Key/OAuth）、状态、手动/定时同步排队。
 * 活动写入走 import batch，不在此直接写 Activity。
 */
@Injectable()
export class IntervalsIcuService {
  private readonly logger = new Logger(IntervalsIcuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intervalsIcuClient: IntervalsIcuClient,
    private readonly intervalsIcuCredentials: IntervalsIcuCredentialService,
    private readonly importBatchService: ImportBatchService,
    private readonly notificationDomain: NotificationDomainService,
    private readonly intervalsIcuPlanSync: IntervalsIcuPlanSyncService,
    private readonly oauthStates: ExternalProviderOAuthStateService,
    private readonly providerConnections: ExternalProviderConnectionService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly healthDataIngest?: HealthDataIngestService,
    @Optional() private readonly i18n?: I18nService,
    @Optional() private readonly userService?: UserService,
  ) {}

  /** 异步通知文案只来自 i18n catalog；缺少翻译时保留稳定 key。 */
  private async translateNotification(
    userId: string,
    key: string,
    args?: Record<string, string | number>,
  ) {
    const lang =
      (await this.userService?.getPreferredLocale(userId).catch(() => null)) ??
      I18nContext.current()?.lang ??
      'en';
    const translated = this.i18n?.t(key, { lang, args });
    return typeof translated === 'string' && translated.trim()
      ? translated
      : key;
  }

  /**
   * 第三方连接模型
   */

  /** 同一 Intervals.icu 账号不可被其他用户 ACTIVE 占用。 */
  private async assertExternalAthleteAvailable(
    userId: string,
    externalAthleteId?: string | null,
  ) {
    const normalizedAthleteId = cleanString(externalAthleteId);
    if (!normalizedAthleteId || normalizedAthleteId === '0') return;

    const conflictingConnection = await this.providerConnections.model().findFirst({
      where: {
        provider: 'intervals_icu',
        externalAthleteId: normalizedAthleteId,
        status: 'ACTIVE',
        userId: { not: userId },
      },
      select: { userId: true },
    });
    if (conflictingConnection) {
      throw thirdPartyError(
        THIRD_PARTY_ERRORS.INTERVALS_ICU.ACCOUNT_ALREADY_CONNECTED,
      );
    }
  }

  /** 调 profile 验证 API Key；401 等转为业务错误。 */
  private async validateApiKey(apiKey: string) {
    try {
      return await this.intervalsIcuClient.getProfile(apiKey);
    } catch (error) {
      if (error instanceof IntervalsIcuApiError) {
        throw thirdPartyError(
          THIRD_PARTY_ERRORS.INTERVALS_ICU.API_KEY_VALIDATION_FAILED,
          { status: error.status },
        );
      }
      throw error;
    }
  }

  /** 读取已存 fingerprint；缺失时尝试从密文重算。 */
  private existingCredentialFingerprint(
    connection: IntervalsIcuFingerprintConnection,
  ) {
    if (connection?.credentialFingerprint) {
      return String(connection.credentialFingerprint);
    }
    if (!connection?.credentialCiphertext) return null;
    try {
      return this.intervalsIcuCredentials.fingerprint(
        this.intervalsIcuCredentials.decrypt(connection.credentialCiphertext),
      );
    } catch {
      return null;
    }
  }

  /** OAuth client id（配置 / 环境变量）。 */
  private oauthClientId() {
    return (
      this.configService?.get<string>('intervalsIcu.oauth.clientID') ??
      this.configService?.get<string>('INTERVALS_ICU_OAUTH_CLIENT_ID') ??
      process.env.INTERVALS_ICU_OAUTH_CLIENT_ID
    );
  }

  /** OAuth client secret。 */
  private oauthClientSecret() {
    return (
      this.configService?.get<string>('intervalsIcu.oauth.clientSecret') ??
      this.configService?.get<string>('INTERVALS_ICU_OAUTH_CLIENT_SECRET') ??
      process.env.INTERVALS_ICU_OAUTH_CLIENT_SECRET
    );
  }

  /** OAuth 回调地址（默认指向本服务 `/intervals-icu/oauth/callback`）。 */
  private oauthRedirectUri() {
    return (
      this.configService?.get<string>('intervalsIcu.oauth.redirectUri') ??
      this.configService?.get<string>('INTERVALS_ICU_OAUTH_REDIRECT_URI') ??
      process.env.INTERVALS_ICU_OAUTH_REDIRECT_URI ??
      `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(
        /\/+$/,
        '',
      )}/intervals-icu/oauth/callback`
    );
  }

  /** Intervals.icu 授权页 URL。 */
  private oauthAuthorizeUrl() {
    return (
      this.configService?.get<string>('intervalsIcu.oauth.authorizeUrl') ??
      this.configService?.get<string>('INTERVALS_ICU_OAUTH_AUTHORIZE_URL') ??
      process.env.INTERVALS_ICU_OAUTH_AUTHORIZE_URL ??
      'https://intervals.icu/oauth/authorize'
    );
  }

  /** 前端站点根 URL（用于默认 returnUrl）。 */
  private appBaseUrl() {
    return (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      'http://localhost:3002'
    ).replace(/\/+$/, '');
  }

  /** 允许的移动端 deep link scheme 集合。 */
  private mobileReturnUrlProtocols() {
    return new Set(
      [
        'trainingloadmobileapp:',
        process.env.OAUTH_MOBILE_REDIRECT_URI,
        ...(process.env.OAUTH_MOBILE_REDIRECT_URIS ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      ]
        .map((value) => {
          try {
            return value.endsWith(':') ? value : new URL(value).protocol;
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value)),
    );
  }

  /** 当前请求语言或 i18n 默认语言。 */
  private defaultAppLocale() {
    const contextLang = I18nContext.current()?.lang?.trim();
    if (contextLang) return contextLang;
    if (this.i18n) {
      return this.i18n.resolveLanguage('');
    }
    return 'en';
  }

  /** OAuth 完成后的默认回跳：`/{locale}/account`。 */
  private defaultAccountReturnUrl() {
    return `${this.appBaseUrl()}/${this.defaultAppLocale()}/account`;
  }

  /** 仅允许同源 web 或已配置移动端 scheme，防开放重定向。 */
  private sanitizeReturnUrl(value?: string | null) {
    const fallback = this.defaultAccountReturnUrl();
    if (!value) return fallback;
    try {
      const url = new URL(value);
      const allowedOrigins = new Set(
        [
          this.appBaseUrl(),
          process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
        ].filter(Boolean),
      );
      if (allowedOrigins.has(url.origin)) return url.toString();
      if (this.mobileReturnUrlProtocols().has(url.protocol)) {
        return url.toString();
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  /** 固定申请完整 WRITE scopes（含 CALENDAR），避免后续功能再重授权。 */
  private oauthScopes(_dto: StartIntervalsIcuOAuthDto) {
    // OAuth 绑定一次后会覆盖 API Key 绑定，所以这里按平台集成需要申请完整权限。
    // 计划课 UI 先禁用不代表 OAuth 不申请 CALENDAR；否则后续打开功能会要求用户重新授权。
    // Intervals.icu 的 WRITE scope 隐含 READ，不能同时传同一类的 READ 和 WRITE。
    // FITNESS 不是 Intervals.icu 当前支持的 OAuth scope。
    return [
      'ACTIVITY:WRITE',
      'CALENDAR:WRITE',
      'WELLNESS:WRITE',
      'SETTINGS:WRITE',
    ];
  }

  /** 优先用调用方覆盖凭证，否则从 connection 解密。 */
  private resolveCredential(
    connection: IntervalsIcuCredentialConnection,
    override?: IntervalsIcuApiCredential,
  ): IntervalsIcuApiCredential {
    return (
      override ??
      this.intervalsIcuCredentials.resolveConnectionCredential(connection)
    );
  }

  /** 签发 state 并返回浏览器授权 URL。 */
  async startOAuth(userId: string, dto: StartIntervalsIcuOAuthDto) {
    const clientId = this.oauthClientId();
    const clientSecret = this.oauthClientSecret();
    if (!clientId || !clientSecret) {
      throw thirdPartyError(
        THIRD_PARTY_ERRORS.INTERVALS_ICU.OAUTH_NOT_CONFIGURED,
      );
    }
    // 授权范围
    const scopes = this.oauthScopes(dto);
    // Shared store provides expiry, one-time consumption, and replay defense.
    const state = await this.oauthStates.issue({
      userId,
      provider: 'intervals_icu',
      payload: {
        returnUrl: this.sanitizeReturnUrl(dto.returnUrl),
        settings: dto,
      } as unknown as Prisma.InputJsonValue,
    });
    // 构建授权 URL
    const url = new URL(this.oauthAuthorizeUrl());

    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', this.oauthRedirectUri());
    url.searchParams.set('scope', scopes.join(','));
    url.searchParams.set('state', state);

    // 返回授权 URL 和 scopes
    return {
      authorizationUrl: url.toString(),
      scopes,
    };
  }

  /** OAuth 回调：换 token、落库连接，返回 302 目标 URL。 */
  async completeOAuthCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }) {
    let statePayload: {
      userId: string;
      returnUrl: string;
      settings: StartIntervalsIcuOAuthDto;
    } | null = null;
    try {
      const row = await this.oauthStates.consume('intervals_icu', query.state);
      const payload =
        row.payload &&
        typeof row.payload === 'object' &&
        !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {};
      statePayload = {
        userId: row.userId,
        returnUrl: this.sanitizeReturnUrl(
          typeof payload.returnUrl === 'string' ? payload.returnUrl : null,
        ),
        settings:
          payload.settings &&
          typeof payload.settings === 'object' &&
          !Array.isArray(payload.settings)
            ? (payload.settings as StartIntervalsIcuOAuthDto)
            : {},
      };
      // 如果错误，返回错误 URL
      if (query.error) {
        return addQuery(statePayload.returnUrl, {
          intervals_icu_oauth: 'error',
          reason: query.error,
        });
      }
      // 如果缺少 code，返回错误 URL
      if (!query.code) {
        return addQuery(statePayload.returnUrl, {
          intervals_icu_oauth: 'error',
          reason: 'missing_code',
        });
      }

      // 使用 code 换取 token
      const clientId = this.oauthClientId();
      const clientSecret = this.oauthClientSecret();
      if (!clientId || !clientSecret) {
        throw thirdPartyError(
          THIRD_PARTY_ERRORS.INTERVALS_ICU.OAUTH_NOT_CONFIGURED,
        );
      }

      // 获取 token
      const token = await this.intervalsIcuClient.exchangeOAuthCode({
        clientId,
        clientSecret,
        code: query.code,
      });
      // 拿到 token 后，创建/更新连接
      await this.applyOAuthConnection(
        statePayload.userId,
        token,
        statePayload.settings,
      );
      // 返回成功 URL
      return addQuery(statePayload.returnUrl, {
        intervals_icu_oauth: 'connected',
      });
    } catch (error) {
      const returnUrl = statePayload?.returnUrl ?? this.sanitizeReturnUrl(null);
      const reason = error instanceof Error ? error.message : 'oauth_failed';
      this.logger.warn(`[Intervals.icu][授权] 回调失败: ${reason}`);
      return addQuery(returnUrl, {
        intervals_icu_oauth: 'error',
        reason: thirdPartyOAuthReason(error) ?? 'oauth_failed',
      });
    }
  }

  /** 用 OAuth token 创建/更新连接并可选排队首同步。 */
  private async applyOAuthConnection(
    userId: string,
    token: IntervalsIcuOAuthTokenResponse,
    dto: StartIntervalsIcuOAuthDto,
  ) {
    if (!token.access_token) {
      throw thirdPartyError(
        THIRD_PARTY_ERRORS.INTERVALS_ICU.OAUTH_TOKEN_MISSING,
      );
    }
    const externalAthleteId = oauthAthleteId(token);
    // 验证运动员 ID 是否可用
    await this.assertExternalAthleteAvailable(userId, externalAthleteId);
    // 查找已存在的连接
    const existingConnection = await this.providerConnections.model().findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
    });
    // 获取历史同步设置
    const existingMetadata = intervalsIcuMetadataOf(existingConnection);
    // 获取历史计划课同步设置
    const existingPlanSync = intervalsIcuPlanSyncOf(existingMetadata);

    // 参数 normalize
    const syncActivities =
      dto.syncActivities ?? existingConnection?.syncActivities ?? true;
    const syncScheduledActivities =
      dto.syncScheduledActivities ??
      existingConnection?.syncScheduledActivities ??
      true;
    const syncPlannedWorkouts =
      dto.syncPlannedWorkouts ?? existingPlanSync.syncPlannedWorkouts ?? false;
    const exportPlannedWorkouts =
      dto.exportPlannedWorkouts ??
      existingPlanSync.exportPlannedWorkouts ??
      false;
    const syncWellness =
      dto.syncWellness ?? existingConnection?.syncWellness ?? false;
    const exportWellness =
      dto.exportWellness ?? existingConnection?.exportWellness ?? false;
    const exportActivities =
      dto.exportActivities ?? existingConnection?.exportActivities ?? false;
    const syncSportSettings =
      dto.syncSportSettings ?? existingConnection?.syncSportSettings ?? false;
    const exportSportSettings = false;
    const credential: IntervalsIcuApiCredential = {
      authType: 'oauth',
      token: token.access_token,
    };

    // 构建 metadata
    const metadata: IntervalsIcuConnectionMetadata = {
      ...existingMetadata,
      authType: 'oauth',
      athleteIdMode: '0',
      oauth: {
        tokenType: token.token_type ?? 'Bearer',
        grantedScopes: parseScopeString(token.scope),
        athlete: token.athlete ?? null,
        authorizedAt: new Date().toISOString(),
      } satisfies IntervalsIcuOAuthMetadata,
      planSync: {
        ...existingPlanSync,
        syncPlannedWorkouts,
        exportPlannedWorkouts,
      },
    };
    const canonical = canonicalSettingsUpdateData({
      provider: 'intervals_icu',
      connection: existingConnection
        ? { ...existingConnection, metadata }
        : { status: 'ACTIVE', metadata },
      patch: {
        importActivitiesAutomatically: syncScheduledActivities,
        exportActivitiesAutomatically: exportActivities,
        importPlannedWorkouts: syncPlannedWorkouts,
        exportPlannedWorkouts,
        importWellness: syncWellness,
        exportWellness,
        importAthleteProfile: syncSportSettings,
        exportAthleteProfile: exportSportSettings,
      },
    });
    // 更新/创建连接
    const connection = await this.providerConnections.model().upsert({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
      create: {
        userId,
        provider: 'intervals_icu',
        externalAthleteId,
        credentialCiphertext: this.intervalsIcuCredentials.encrypt(
          token.access_token,
        ),
        credentialLast4: this.intervalsIcuCredentials.last4(token.access_token),
        credentialFingerprint: this.intervalsIcuCredentials.fingerprint(
          token.access_token,
        ),
        status: 'ACTIVE',
        syncActivities,
        ...canonical.data,
        lastError: null,
      },
      update: {
        externalAthleteId,
        credentialCiphertext: this.intervalsIcuCredentials.encrypt(
          token.access_token,
        ),
        credentialLast4: this.intervalsIcuCredentials.last4(token.access_token),
        credentialFingerprint: this.intervalsIcuCredentials.fingerprint(
          token.access_token,
        ),
        status: 'ACTIVE',
        syncActivities,
        ...canonical.data,
        lastError: null,
      },
    });

    // 如果需要同步活动，排队首同步
    if (syncActivities) {
      await this.queueLatestActivitiesForConnection({
        userId,
        connection,
        credential,
        reason: 'initial',
      }).catch((error) => {
        this.logger.warn(
          `[Intervals.icu][OAuth] 首次活动同步启动失败：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }
    // 如果需要同步计划课，排队首同步
    if (syncPlannedWorkouts || exportPlannedWorkouts) {
      await this.intervalsIcuPlanSync
        .syncConnectionWeek({
          userId,
          connection,
          credential,
          weekStart: dto.plannedWorkoutWeekStart,
          trigger: 'initial',
        })
        .catch((error) => {
          this.logger.warn(
            `[Intervals.icu][OAuth] 首次计划课同步启动失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }
  }

  /**
   * API Key 连接/更新：验证 key、fingerprint 变更二次确认、落库开关，
   * 并在需要时排队首同步与计划课同步。
   */
  async connect(userId: string, dto: ConnectIntervalsIcuDto) {
    const existingConnection = await this.providerConnections.model().findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
    });
    const apiKey = optionalApiKey(dto.apiKey);
    const existingMetadata = intervalsIcuMetadataOf(existingConnection);
    const existingPlanSync = intervalsIcuPlanSyncOf(existingMetadata);

    if (!apiKey && !existingConnection?.credentialCiphertext) {
      normalizeApiKey(dto.apiKey);
    }

    const syncActivities =
      dto.syncActivities ?? existingConnection?.syncActivities ?? true;
    const syncScheduledActivities =
      dto.syncScheduledActivities ??
      existingConnection?.syncScheduledActivities ??
      true;
    const syncPlannedWorkouts =
      dto.syncPlannedWorkouts ?? existingPlanSync.syncPlannedWorkouts ?? false;
    const syncWellness =
      dto.syncWellness ?? existingConnection?.syncWellness ?? false;
    const exportActivities =
      dto.exportActivities ?? existingConnection?.exportActivities ?? false;
    const exportPlannedWorkouts =
      dto.exportPlannedWorkouts ??
      existingPlanSync.exportPlannedWorkouts ??
      false;
    const exportWellness =
      dto.exportWellness ?? existingConnection?.exportWellness ?? false;
    const syncSportSettings =
      dto.syncSportSettings ?? existingConnection?.syncSportSettings ?? false;
    const exportSportSettings = false;

    let profile: IntervalsIcuAthleteProfile | null = null;
    let credentialChanged = false;
    let apiKeyForInitialSync: string | undefined;
    const credentialData: {
      credentialCiphertext?: string;
      credentialLast4?: string;
      credentialFingerprint?: string;
    } = {};

    if (apiKey) {
      profile = await this.validateApiKey(apiKey);
      await this.assertExternalAthleteAvailable(
        userId,
        extractExternalAthleteId(profile),
      );
      const nextFingerprint = this.intervalsIcuCredentials.fingerprint(apiKey);
      const currentFingerprint =
        this.existingCredentialFingerprint(existingConnection);
      const isReplacingCredential =
        Boolean(existingConnection?.credentialCiphertext) &&
        Boolean(currentFingerprint) &&
        currentFingerprint !== nextFingerprint;

      if (isReplacingCredential && !dto.replaceCredentialConfirmed) {
        return {
          ...this.toConnectionStatus(existingConnection),
          keyChangeConfirmationRequired: true,
          pendingCredentialLast4: this.intervalsIcuCredentials.last4(apiKey),
          initialSync: null,
        };
      }

      if (!currentFingerprint || currentFingerprint !== nextFingerprint) {
        credentialData.credentialCiphertext =
          this.intervalsIcuCredentials.encrypt(apiKey);
        credentialChanged = true;
      }
      credentialData.credentialLast4 =
        this.intervalsIcuCredentials.last4(apiKey);
      credentialData.credentialFingerprint = nextFingerprint;
      apiKeyForInitialSync = apiKey;
    }

    const existingAuthType =
      existingMetadata.authType === 'oauth' ? 'oauth' : 'api_key';
    const metadata: IntervalsIcuConnectionMetadata = {
      ...existingMetadata,
      authType: apiKey ? 'api_key' : existingAuthType,
      ...(apiKey ? { oauth: null } : {}),
      ...(profile ? { profile } : {}),
      athleteIdMode: '0',
      planSync: {
        ...existingPlanSync,
        syncPlannedWorkouts,
        exportPlannedWorkouts,
      },
    };
    const canonical = canonicalSettingsUpdateData({
      provider: 'intervals_icu',
      connection: existingConnection
        ? { ...existingConnection, metadata }
        : { status: 'ACTIVE', metadata },
      patch: {
        importActivitiesAutomatically: syncScheduledActivities,
        exportActivitiesAutomatically: exportActivities,
        importPlannedWorkouts: syncPlannedWorkouts,
        exportPlannedWorkouts,
        importWellness: syncWellness,
        exportWellness,
        importAthleteProfile: syncSportSettings,
        exportAthleteProfile: exportSportSettings,
      },
    });

    const connection = await this.providerConnections.model().upsert({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
      create: {
        userId,
        provider: 'intervals_icu',
        externalAthleteId: profile ? extractExternalAthleteId(profile) : '0',
        credentialCiphertext: credentialData.credentialCiphertext,
        credentialLast4: credentialData.credentialLast4,
        credentialFingerprint: credentialData.credentialFingerprint,
        status: 'ACTIVE',
        syncActivities,
        ...canonical.data,
        lastError: null,
      },
      update: {
        ...(profile
          ? { externalAthleteId: extractExternalAthleteId(profile) }
          : {}),
        ...credentialData,
        status: apiKey ? 'ACTIVE' : (existingConnection?.status ?? 'ACTIVE'),
        syncActivities,
        ...canonical.data,
        lastError: apiKey ? null : (existingConnection?.lastError ?? null),
      },
    });

    let initialSync: Record<string, unknown> | null = null;
    const shouldQueueInitialSync =
      syncActivities &&
      (!existingConnection || credentialChanged || dto.syncActivities === true);
    if (shouldQueueInitialSync) {
      try {
        const syncResult = await this.queueLatestActivitiesForConnection({
          userId,
          connection,
          apiKey: apiKeyForInitialSync,
          reason: 'initial',
        });
        initialSync = {
          started: Boolean(syncResult.batch),
          ...syncResult,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[Intervals.icu] 连接后启动首次活动同步失败：${message}`,
        );
        initialSync = {
          started: false,
          error: message,
        };
      }
    }

    let plannedWorkoutSync: Record<string, unknown> | null = null;
    if (syncPlannedWorkouts || exportPlannedWorkouts) {
      try {
        // 连接时只做计划课的当前窗口同步；历史完成活动仍走 initial activity sync。
        plannedWorkoutSync = await this.intervalsIcuPlanSync.syncConnectionWeek(
          {
            userId,
            connection,
            apiKey: apiKeyForInitialSync,
            weekStart: dto.plannedWorkoutWeekStart,
            trigger: 'initial',
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[Intervals.icu] 连接后同步计划课失败：${message}`);
        plannedWorkoutSync = {
          enabled: true,
          error: message,
        };
      }
    }

    const latestConnection = await this.providerConnections.model().findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
    });

    return {
      ...this.toConnectionStatus(latestConnection ?? connection),
      initialSync,
      plannedWorkoutSync,
    };
  }

  /** 更新同步/导出开关（不改凭证）。 */
  async updateSettings(userId: string, dto: UpdateIntervalsIcuSettingsDto) {
    const connection = await this.providerConnections.model().findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
    });
    if (!connection || connection.status !== 'ACTIVE') {
      throw thirdPartyError(THIRD_PARTY_ERRORS.INTERVALS_ICU.NOT_CONNECTED);
    }

    // 已授权后的设置保存不要求重新 OAuth 或再次提交 API Key。
    // Canonical settings 写入 metadata.integration，并镜像旧列供滚动升级兼容。
    const canonical = canonicalSettingsUpdateData({
      provider: 'intervals_icu',
      connection,
      patch: legacySettingsPatch(dto as Record<string, unknown>),
    });

    const updated = await this.providerConnections.model().update({
      where: { id: connection.id },
      data: canonical.data as Prisma.ExternalProviderConnectionUncheckedUpdateInput,
    });

    return this.toConnectionStatus(updated);
  }

  /** 返回当前连接状态（未连接则 `{ connected: false }`）。 */
  async getStatus(userId: string) {
    const connection = await this.providerConnections.model().findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
    });
    return connection
      ? this.toConnectionStatus(connection)
      : { connected: false };
  }

  /** 断开连接并清空凭证字段（历史导入数据保留）。 */
  async disconnect(userId: string) {
    const connection = await this.providerConnections.model().findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
    });
    if (!connection) return { connected: false };

    await this.providerConnections.model().update({
      where: { id: connection.id },
      data: {
        status: 'DISCONNECTED',
        credentialCiphertext: '',
        credentialLast4: null,
        credentialFingerprint: null,
        lastError: null,
      },
    });

    return { connected: false };
  }

  /** 按窗口拉取 wellness 并写入统一健康管道。 */
  private async syncWellnessForConnection(args: {
    userId: string;
    connection: IntervalsIcuSyncConnection;
    apiKey?: string;
    credential?: IntervalsIcuApiCredential;
    newest?: string;
    reason: 'manual' | 'scheduled';
    timezone?: string;
  }) {
    const connection = args.connection;
    if (!connection || connection.status !== 'ACTIVE') {
      throw thirdPartyError(THIRD_PARTY_ERRORS.INTERVALS_ICU.NOT_CONNECTED);
    }
    if (!this.healthDataIngest) {
      throw new Error('HealthDataIngestService is not configured');
    }
    if (!args.apiKey && !args.credential && !connection.credentialCiphertext) {
      throw thirdPartyError(
        THIRD_PARTY_ERRORS.INTERVALS_ICU.CREDENTIAL_MISSING,
      );
    }

    const window =
      args.reason === 'scheduled'
        ? yesterdayWindow(args.timezone)
        : latest60DayWindow(args.newest);
    const startedAt = new Date();
    await this.providerConnections.model().update({
      where: { id: connection.id },
      data: {
        lastSyncStartedAt: startedAt,
        lastError: null,
      },
    });

    try {
      const credential = this.resolveCredential(
        connection,
        args.credential ?? args.apiKey,
      );
      const wellnessRecords = await this.intervalsIcuClient.listWellness(
        credential,
        {
          ...window,
          fields: [
            'id',
            'weight',
            'restingHR',
            'hrvSDNN',
            'sleepSecs',
            'sleepScore',
            'avgSleepingHR',
            'steps',
            'vo2max',
          ],
        },
      );
      const metricTypes = new Set<string>();
      const dates = new Set<string>();
      let sampleCount = 0;
      for (const record of wellnessRecords) {
        const dateKey = dateKeyFromWellness(record);
        if (!dateKey) continue;
        const candidates = mapIntervalsIcuWellnessToHealthCandidates({
          externalAthleteId: connection.externalAthleteId,
          connectionId: connection.id,
          record,
        });
        await this.healthDataIngest.replaceProviderDailyCandidates({
          userId: args.userId,
          provider: 'INTERVALS_ICU',
          connectionId: connection.id,
          localDate: new Date(`${dateKey}T00:00:00.000Z`),
          managedMetricTypes: INTERVALS_ICU_AUTHORITATIVE_DAILY_METRIC_TYPES,
          candidates,
        });
        sampleCount += candidates.length;
        candidates.forEach((candidate) =>
          metricTypes.add(candidate.metricType),
        );
        dates.add(dateKey);
      }
      const ingestResult = {
        sampleCount,
        projectedCount: sampleCount,
        metricTypes: [...metricTypes].sort(),
        dates: [...dates].sort(),
      };

      const completedAt = new Date();
      const latestConnection = await this.providerConnections.model().findUnique({
        where: { id: connection.id },
        select: { metadata: true },
      });
      const existingMetadata = intervalsIcuMetadataOf(latestConnection);
      await this.providerConnections.model().update({
        where: { id: connection.id },
        data: {
          lastSyncCompletedAt: completedAt,
          lastError: null,
          metadata: intervalsIcuMetadataJson({
            ...existingMetadata,
            wellnessSync: {
              lastStartedAt: startedAt.toISOString(),
              lastCompletedAt: completedAt.toISOString(),
              lastWindow: window,
              lastResult: {
                totalFetched: wellnessRecords.length,
                totalSamples: ingestResult.sampleCount,
                projectedCount: ingestResult.projectedCount,
                metricTypes: ingestResult.metricTypes,
                dates: ingestResult.dates,
              },
            },
          }),
        },
      });

      return {
        enabled: true,
        window,
        totalFetched: wellnessRecords.length,
        totalSamples: ingestResult.sampleCount,
        projectedCount: ingestResult.projectedCount,
        metricTypes: ingestResult.metricTypes,
        dates: ingestResult.dates,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Intervals.icu] wellness 同步失败：${message}`);
      await this.providerConnections.model().update({
        where: { id: connection.id },
        data: {
          status:
            error instanceof IntervalsIcuApiError &&
            (error.status === 401 || error.status === 403)
              ? 'INVALID'
              : connection.status,
          lastError: message,
        },
      });
      throw error;
    }
  }

  /**
   * 用户手动立即同步：活动（近 60 天）+ 可选计划课 + 可选 wellness。
   * 可关活动同步、只刷计划课。
   */
  async syncLatest(userId: string, dto?: SyncIntervalsIcuDto) {
    const connection = await this.providerConnections.model().findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals_icu',
        },
      },
    });

    if (!connection || connection.status !== 'ACTIVE') {
      throw thirdPartyError(THIRD_PARTY_ERRORS.INTERVALS_ICU.NOT_CONNECTED);
    }
    if (!connection.credentialCiphertext) {
      throw thirdPartyError(
        THIRD_PARTY_ERRORS.INTERVALS_ICU.CREDENTIAL_MISSING,
      );
    }

    const flags = this.intervalsIcuPlanSync.getPlanSyncFlags(connection);
    // 手动按钮是一次性动作，不受自动导入开关影响。
    const activityResult = await this.queueLatestActivitiesForConnection({
      userId,
      connection,
      newest: dto?.newest,
      reason: 'manual',
    });
    const plannedWorkouts =
      flags.syncPlannedWorkouts || flags.exportPlannedWorkouts
        ? await this.intervalsIcuPlanSync.syncConnectionWeek({
            userId,
            connection,
            weekStart: dto?.plannedWorkoutWeekStart,
            trigger: 'manual',
          })
        : null;
    const wellness =
      connection.syncWellness === true
        ? await this.syncWellnessForConnection({
            userId,
            connection,
            newest: dto?.newest,
            reason: 'manual',
          })
        : null;

    return {
      ...activityResult,
      plannedWorkouts,
      ...(wellness ? { wellness } : {}),
    };
  }

  /**
   * 定时/内部触发的连接同步：活动窗口为用户本地「昨天」；
   * 本方法不处理计划课（计划滚动另有任务）。
   */
  async syncConnectionLatest(args: {
    connection: IntervalsIcuSyncConnection;
    reason: 'scheduled';
    newest?: string;
    timezone?: string;
  }) {
    // 此入口只同步活动/健康数据；计划滚动由共享调度策略下的另一 task 负责。
    const activityResult =
      args.connection.syncScheduledActivities === false
        ? null
        : await this.queueLatestActivitiesForConnection({
            userId: args.connection.userId,
            connection: args.connection,
            newest: args.newest,
            reason: args.reason,
            timezone: args.timezone,
          });
    const plannedWorkouts = null;
    const wellness =
      args.connection.syncWellness === true
        ? await this.syncWellnessForConnection({
            userId: args.connection.userId,
            connection: args.connection,
            newest: args.newest,
            reason: args.reason,
            timezone: args.timezone,
          })
        : null;

    return {
      ...(activityResult ?? {
        window: null,
        totalFetched: 0,
        batch: null,
        queuedCount: 0,
        skippedCount: 0,
        skippedReason: '定时活动同步已关闭',
      }),
      plannedWorkouts,
      ...(wellness ? { wellness } : {}),
    };
  }

  /**
   * 拉活动列表并创建 import batch（只排队，不直接写 Activity）。
   * scheduled → 昨天；manual/initial → 近 60 天。
   */
  private async queueLatestActivitiesForConnection(args: {
    userId: string;
    connection: IntervalsIcuSyncConnection;
    apiKey?: string;
    credential?: IntervalsIcuApiCredential;
    newest?: string;
    reason: 'initial' | 'manual' | 'scheduled';
    timezone?: string;
  }) {
    const connection = args.connection;
    if (!connection || connection.status !== 'ACTIVE') {
      throw thirdPartyError(THIRD_PARTY_ERRORS.INTERVALS_ICU.NOT_CONNECTED);
    }
    if (
      args.reason === 'scheduled' &&
      connection.syncScheduledActivities === false
    ) {
      throw thirdPartyError(
        THIRD_PARTY_ERRORS.INTERVALS_ICU.SCHEDULED_SYNC_DISABLED,
      );
    }
    if (!args.apiKey && !args.credential && !connection.credentialCiphertext) {
      throw thirdPartyError(
        THIRD_PARTY_ERRORS.INTERVALS_ICU.CREDENTIAL_MISSING,
      );
    }

    const window =
      args.reason === 'scheduled'
        ? yesterdayWindow(args.timezone)
        : latest60DayWindow(args.newest);
    await this.providerConnections.model().update({
      where: { id: connection.id },
      data: {
        lastSyncStartedAt: new Date(),
        lastError: null,
      },
    });

    try {
      const credential = this.resolveCredential(
        connection,
        args.credential ?? args.apiKey,
      );
      const activities = await this.intervalsIcuClient.listActivities(
        credential,
        {
          ...window,
        },
      );

      const result =
        await this.importBatchService.createIntervalsIcuImportBatch({
          userId: args.userId,
          connectionId: connection.id,
          activities,
          reason: args.reason,
          discoveryWindow: originSyncWindow(window),
        });

      // 只有既未创建直接导入批次，也没有活动在等待真实来源或处于阻塞状态时，
      // 才能把本次同步描述为“没有新活动”。
      if (
        !result.batch &&
        result.routedToOrigin === 0 &&
        result.mirrorsCreated === 0
      ) {
        const title = await this.translateNotification(
          args.userId,
          'common.notification.intervalsIcu.titleSyncCompleted',
        );
        const bodyMarkdown = await this.translateNotification(
          args.userId,
          args.reason === 'scheduled'
            ? 'common.notification.intervalsIcu.bodyNoNewActivitiesYesterday'
            : 'common.notification.intervalsIcu.bodyNoNewActivitiesRecent60Days',
        );
        await this.notificationDomain.ensureNotification({
          userId: args.userId,
          kind: NotificationKind.IMPORT_BATCH_COMPLETED,
          dedupeKey: [
            'intervals-icu-sync',
            connection.id,
            args.reason,
            window.oldest,
            window.newest,
            'no-new-activities',
          ].join(':'),
          title,
          bodyMarkdown,
          data: {
            connectionId: connection.id,
            window,
            totalFetched: activities.length,
            totalDiscovered: result.totalDiscovered,
            queuedCount: result.queuedCount,
            skippedCount: result.skippedCount,
          } as unknown as Prisma.InputJsonValue,
          digestId: undefined,
        });
      }

      await this.providerConnections.model().update({
        where: { id: connection.id },
        data: {
          lastSyncCompletedAt: new Date(),
          lastSyncedActivityAt: new Date(`${window.newest}T00:00:00.000Z`),
          lastError: null,
        },
      });

      return {
        window,
        totalFetched: activities.length,
        ...result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Intervals.icu] 同步失败：${message}`);
      await this.providerConnections.model().update({
        where: { id: connection.id },
        data: {
          status:
            error instanceof IntervalsIcuApiError &&
            (error.status === 401 || error.status === 403)
              ? 'INVALID'
              : connection.status,
          lastError: message,
        },
      });
      throw error;
    }
  }

  /**
   * 转换连接状态
   * @param connection
   * @returns
   */
  private toConnectionStatus(connection: {
    id: string;
    provider: string;
    status: string;
    externalAthleteId?: string | null;
    credentialLast4?: string | null;
    syncActivities: boolean;
    syncScheduledActivities: boolean;
    syncWellness: boolean;
    exportActivities: boolean;
    exportWellness: boolean;
    syncSportSettings: boolean;
    exportSportSettings?: boolean | null;
    lastSyncStartedAt?: Date | null;
    lastSyncCompletedAt?: Date | null;
    lastSyncedActivityAt?: Date | null;
    lastError?: string | null;
    createdAt: Date;
    updatedAt: Date;
    metadata?: unknown;
  }) {
    const metadata = intervalsIcuMetadataOf(connection);
    const planSync = intervalsIcuPlanSyncOf(metadata);
    const oauth = metadata.oauth ?? {};

    return {
      ...canonicalConnectionStatus('intervals_icu', connection, {
        settings: {
          importPlannedWorkouts: Boolean(planSync.syncPlannedWorkouts),
          exportPlannedWorkouts: Boolean(planSync.exportPlannedWorkouts),
        },
      }),
      connected: connection.status === 'ACTIVE',
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
      externalAthleteId: connection.externalAthleteId,
      credentialLast4: connection.credentialLast4,
      authType: intervalsIcuAuthTypeFromConnection(connection),
      grantedScopes: parseScopeList(oauth.grantedScopes ?? oauth.scope),
      oauthAthleteName: cleanString(oauth.athlete?.name) ?? null,
      syncActivities: connection.syncActivities,
      syncScheduledActivities: connection.syncScheduledActivities,
      syncPlannedWorkouts: Boolean(planSync.syncPlannedWorkouts),
      syncWellness: connection.syncWellness,
      exportActivities: connection.exportActivities,
      exportPlannedWorkouts: Boolean(planSync.exportPlannedWorkouts),
      exportWellness: connection.exportWellness,
      syncSportSettings: connection.syncSportSettings,
      exportSportSettings: connection.exportSportSettings ?? false,
      plannedWorkoutSync: {
        lastStartedAt: planSync.lastStartedAt ?? null,
        lastCompletedAt: planSync.lastCompletedAt ?? null,
        lastWindow: planSync.lastWindow ?? null,
        lastResult: planSync.lastResult ?? null,
        lastError: publicThirdPartySyncError(planSync.lastError),
      },
      lastSyncStartedAt: connection.lastSyncStartedAt,
      lastSyncCompletedAt: connection.lastSyncCompletedAt,
      lastSyncedActivityAt: connection.lastSyncedActivityAt,
      lastError: publicThirdPartySyncError(connection.lastError),
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}
