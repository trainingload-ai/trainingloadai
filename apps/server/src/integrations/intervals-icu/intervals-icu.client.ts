import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IntervalsIcuApiCredential } from './intervals-icu-credential.service';

/**
 * Intervals.icu API client（`/api/v1`）。
 *
 * 官方文档：
 * - Swagger UI：https://intervals.icu/api/v1/docs/swagger-ui/index.html
 * - OpenAPI / RapiDoc：https://intervals.icu/api/v1/docs/
 * - 本地对接说明：`ai_docs/intervals-icu-api-integration.zh.md`
 */

/** Intervals.icu HTTP/API 失败；`body` 已截断，便于日志记录。 */
export class IntervalsIcuApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'IntervalsIcuApiError';
  }
}

/** 已完成活动列表项，来自 `GET /athlete/0/activities`。 */
export interface IntervalsIcuActivityListItem {
  id?: string | number;
  /** 我方 external id，用于幂等匹配 / 导出。 */
  external_id?: string | null;
  name?: string | null;
  type?: string | null;
  start_date?: string | null;
  start_date_local?: string | null;
  icu_sync_date?: string | null;
  [key: string]: unknown;
}

/** 通过 `/activity/{id}/{file|fit-file|gpx-file}` 下载到的活动二进制文件。 */
export interface IntervalsIcuDownloadedFile {
  buffer: Buffer;
  fileName: string;
  contentType?: string | null;
  /** 实际成功的下载端点（按顺序尝试）。 */
  endpoint: 'file' | 'fit-file' | 'gpx-file';
}

/** 以 multipart POST 上传活动 FIT/GPX 后的响应。 */
export interface IntervalsIcuUploadActivityResponse {
  icu_athlete_id?: string;
  id?: string;
  activities?: Array<{
    icu_athlete_id?: string;
    id?: string;
  }>;
}

/**
 * 日历事件上的结构化 workout_doc（OpenAPI 标成自由对象；
 * 实际解析见 intervals-icu-workout-doc.mapper）。
 */
export type IntervalsIcuWorkoutDocJson = {
  steps?: unknown[];
  duration?: number;
  [key: string]: unknown;
};

/**
 * EventEx.workout / 库内 Workout 子集。
 * 官方字段：file_contents(_base64)、filename、workout_doc。
 */
export type IntervalsIcuEventWorkout = {
  id?: number;
  name?: string | null;
  type?: string | null;
  workout_doc?: IntervalsIcuWorkoutDocJson | null;
  file_contents?: string | null;
  file_contents_base64?: string | null;
  filename?: string | null;
};

/**
 * 日历事件（计划训练 / 备注 / 赛事）。
 * 对齐 OpenAPI `Event` / 写路径 `EventEx`；与 `listActivities` 的已完成活动不同。
 */
export interface IntervalsIcuEvent {
  id?: string | number;
  uid?: string | null;
  external_id?: string | null;
  athlete_id?: string | null;
  category?: string | null;
  start_date_local?: string | null;
  end_date_local?: string | null;
  name?: string | null;
  description?: string | null;
  type?: string | null;
  updated?: string | null;
  /** Event：解析后的结构化课表。 */
  workout_doc?: IntervalsIcuWorkoutDocJson | null;
  /** EventEx：嵌套库内 workout（可带文件内容）。 */
  workout?: IntervalsIcuEventWorkout | null;
  file_contents?: string | null;
  file_contents_base64?: string | null;
  filename?: string | null;
}

/** 创建/更新日历事件的请求体（批量 upsert 或单条 PUT）；对齐 EventEx 可写字段。 */
export interface IntervalsIcuEventPayload {
  id?: string | number;
  uid?: string | null;
  /** 计划训练 upsert 时优先使用的幂等键。 */
  external_id?: string | null;
  category?: string | null;
  start_date_local?: string | null;
  end_date_local?: string | null;
  name?: string | null;
  description?: string | null;
  type?: string | null;
  filename?: string | null;
  file_contents?: string | null;
  file_contents_base64?: string | null;
  workout_doc?: IntervalsIcuWorkoutDocJson | null;
  workout?: IntervalsIcuEventWorkout | null;
}

/** 每日健康指标，来自 `GET /athlete/0/wellness`（OpenAPI `Wellness`）。 */
export interface IntervalsIcuWellness {
  /** 日期 id，通常为 `YYYY-MM-DD`。 */
  id?: string;
  athlete_id?: string;
  updated?: string | null;
  weight?: number | null;
  restingHR?: number | null;
  hrv?: number | null;
  hrvSDNN?: number | null;
  sleepSecs?: number | null;
  sleepScore?: number | null;
  avgSleepingHR?: number | null;
  steps?: number | null;
  vo2max?: number | null;
  fatigue?: number | null;
  stress?: number | null;
  mood?: number | null;
  readiness?: number | null;
  sportInfo?: IntervalsIcuSportInfo[] | null;
}

/** OpenAPI `SportInfo`（嵌在 Wellness.sportInfo）。 */
export type IntervalsIcuSportInfo = {
  type?: string;
  eftp?: number | null;
  wPrime?: number | null;
  pMax?: number | null;
};

/** 批量删除日历事件的结果（OpenAPI `DeleteEventsResponse`）。 */
export interface IntervalsIcuDeleteEventsResponse {
  eventsDeleted?: number;
}

/** OAuth 授权码换 token 的响应（`/api/oauth/token`）。 */
export interface IntervalsIcuOAuthTokenResponse {
  token_type?: string;
  access_token?: string;
  scope?: string;
  athlete?: {
    id?: string | number;
    name?: string | null;
  };
}

/** OpenAPI `SportSettings`。 */
export type IntervalsIcuSportSettings = {
  id?: number;
  athlete_id?: string;
  types?: string[];
  ftp?: number | null;
  indoor_ftp?: number | null;
  lthr?: number | null;
  max_hr?: number | null;
  resting_hr?: number | null;
  threshold_pace?: number | null;
  w_prime?: number | null;
  p_max?: number | null;
};

/**
 * OpenAPI `AthleteForProfile`：嵌在 `AthleteProfile.athlete`。
 */
export type IntervalsIcuAthleteForProfile = {
  id?: string;
  name?: string | null;
  profile_medium?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string | null;
  sex?: string | null;
  bio?: string | null;
  website?: string | null;
  email?: string | null;
  icu_coach?: boolean;
};

/**
 * `GET /athlete/{id}/profile` → OpenAPI `AthleteProfile`。
 * 体量小，适合验证 API Key；运动员 id 在 `athlete.id`。
 */
export type IntervalsIcuAthleteProfile = {
  athlete?: IntervalsIcuAthleteForProfile;
  sharedFolders?: unknown[];
  customItems?: unknown[];
};

/**
 * `GET /athlete/{id}` → OpenAPI `WithSportSettings`。
 * 运动阈值在 `sportSettings[]`；`icu_resting_hr` 为 Athlete 顶层字段。
 */
export type IntervalsIcuAthlete = {
  id?: string;
  name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  timezone?: string | null;
  email?: string | null;
  weight?: number | null;
  icu_resting_hr?: number | null;
  icu_weight?: number | null;
  sportSettings?: IntervalsIcuSportSettings[];
  custom_items?: unknown[];
};

/** Intervals.icu API Key 鉴权：HTTP Basic，用户名为 `API_KEY`。 */
function basicAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString('base64')}`;
}

/**
 * 根据凭证生成 Authorization：
 * 兼容旧版纯 API Key 字符串，以及结构化 `{ authType, token }`
 *（OAuth 用 Bearer，API Key 用 Basic）。
 */
function authorizationHeader(credential: IntervalsIcuApiCredential) {
  if (typeof credential === 'string') return basicAuthHeader(credential);
  if (credential.authType === 'oauth') return `Bearer ${credential.token}`;
  return basicAuthHeader(credential.token);
}

/** 去掉末尾斜杠，保证路径拼接稳定。 */
function trimSlashes(value: string) {
  return value.replace(/\/+$/, '');
}

/**
 * 编码 query 参数；跳过 null/空字符串。
 * 数组用逗号拼接（Intervals.icu 多值风格）。
 */
function encodeQuery(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

/** 从 `Content-Disposition` 解析文件名（优先 RFC 5987 的 `filename*`）。 */
function filenameFromDisposition(value: string | null) {
  if (!value) return null;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const match = value.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

/** 下载响应缺少 Content-Disposition 时的兜底文件名。 */
function fallbackFileName(activityId: string, endpoint: string) {
  const ext = endpoint === 'gpx-file' ? 'gpx' : 'fit';
  return `intervals-icu-${activityId}.${ext}`;
}

@Injectable()
export class IntervalsIcuClient {
  private readonly logger = new Logger(IntervalsIcuClient.name);
  private readonly baseUrl: string;
  private readonly oauthTokenUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = trimSlashes(
      this.configService.get<string>('intervalsIcu.apiBaseUrl') ||
        this.configService.get<string>('INTERVALS_ICU_API_BASE_URL') ||
        'https://intervals.icu/api/v1',
    );
    this.oauthTokenUrl =
      this.configService.get<string>('intervalsIcu.oauth.tokenUrl') ||
      this.configService.get<string>('INTERVALS_ICU_OAUTH_TOKEN_URL') ||
      'https://intervals.icu/api/oauth/token';
  }

  /** 底层 fetch：自动带 Authorization，非 2xx 抛 IntervalsIcuApiError。 */
  private async request(
    credential: IntervalsIcuApiCredential,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: authorizationHeader(credential),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new IntervalsIcuApiError(
        response.status,
        `Intervals.icu API request failed: ${response.status} ${response.statusText}`,
        body.slice(0, 1000),
      );
    }

    return response;
  }

  /** GET JSON 便捷封装。 */
  private async getJson<T>(
    credential: IntervalsIcuApiCredential,
    path: string,
    query?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.request(
      credential,
      `${path}${encodeQuery(query ?? {})}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
    return (await response.json()) as T;
  }

  /** POST/PUT/DELETE JSON 便捷封装；空响应体按 `{}` 处理。 */
  private async sendJson<T>(
    credential: IntervalsIcuApiCredential,
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.request(
      credential,
      `${path}${encodeQuery(query ?? {})}`,
      {
        method,
        body: body == null ? undefined : JSON.stringify(body),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );
    return (await response.json().catch(() => ({}))) as T;
  }

  /** 用授权码换 OAuth access token（独立于 API baseUrl 的 token 端点）。 */
  async exchangeOAuthCode(args: {
    clientId: string;
    clientSecret: string;
    code: string;
  }) {
    const form = new URLSearchParams();
    form.set('client_id', args.clientId);
    form.set('client_secret', args.clientSecret);
    form.set('code', args.code);

    const response = await fetch(this.oauthTokenUrl, {
      method: 'POST',
      body: form,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new IntervalsIcuApiError(
        response.status,
        `Intervals.icu OAuth token exchange failed: ${response.status} ${response.statusText}`,
        body.slice(0, 1000),
      );
    }

    return (await response.json()) as IntervalsIcuOAuthTokenResponse;
  }

  /** 拉取运动员 profile（OpenAPI AthleteProfile；适合验证 API Key）。 */
  getProfile(credential: IntervalsIcuApiCredential) {
    return this.getJson<IntervalsIcuAthleteProfile>(
      credential,
      '/athlete/0/profile',
    );
  }

  /** 拉取运动员 + sportSettings（OpenAPI WithSportSettings）。 */
  getAthlete(credential: IntervalsIcuApiCredential) {
    return this.getJson<IntervalsIcuAthlete>(credential, '/athlete/0');
  }

  /** 列出已完成活动（按 oldest/newest 窗口）。 */
  listActivities(
    credential: IntervalsIcuApiCredential,
    args: {
      oldest: string;
      newest?: string;
      limit?: number;
      fields?: string[];
    },
  ) {
    return this.getJson<IntervalsIcuActivityListItem[]>(
      credential,
      '/athlete/0/activities',
      args,
    );
  }

  /** 列出日历事件（计划训练等）；已完成活动请用 listActivities。 */
  listEvents(
    credential: IntervalsIcuApiCredential,
    args: {
      oldest?: string;
      newest?: string;
      category?: string | string[];
      limit?: number;
      calendar_id?: number;
      ext?: 'fit' | 'zwo' | 'mrc' | 'erg' | string;
      resolve?: boolean;
      powerRange?: number;
      hrRange?: number;
      paceRange?: number;
      locale?: string;
    },
  ) {
    return this.getJson<IntervalsIcuEvent[]>(
      credential,
      '/athlete/0/events',
      args,
    );
  }

  /** 拉取每日 wellness（睡眠、HRV、静息心率等）。 */
  listWellness(
    credential: IntervalsIcuApiCredential,
    args: {
      oldest?: string;
      newest?: string;
      fields?: string[];
    },
  ) {
    return this.getJson<IntervalsIcuWellness[]>(
      credential,
      '/athlete/0/wellness',
      args,
    );
  }

  /** 批量创建/upsert 日历事件；默认按 external_id 幂等。 */
  createEventsBulk(
    credential: IntervalsIcuApiCredential,
    events: IntervalsIcuEventPayload[],
    args?: {
      upsert?: boolean;
      upsertOnUid?: boolean;
      updatePlanApplied?: boolean;
    },
  ) {
    return this.sendJson<IntervalsIcuEvent[]>(
      credential,
      'POST',
      '/athlete/0/events/bulk',
      events,
      {
        upsert: args?.upsert ?? true,
        upsertOnUid: args?.upsertOnUid ?? false,
        updatePlanApplied: args?.updatePlanApplied ?? false,
      },
    );
  }

  /** 按 Intervals.icu event id 更新单条日历事件。 */
  updateEvent(
    credential: IntervalsIcuApiCredential,
    eventId: string | number,
    event: IntervalsIcuEventPayload,
  ) {
    return this.sendJson<IntervalsIcuEvent>(
      credential,
      'PUT',
      `/athlete/0/events/${encodeURIComponent(String(eventId))}`,
      event,
    );
  }

  /** 批量删除日历事件（可按 id 或 external_id）。 */
  deleteEventsBulk(
    credential: IntervalsIcuApiCredential,
    events: Array<{ id?: string | number; external_id?: string | null }>,
  ) {
    return this.sendJson<IntervalsIcuDeleteEventsResponse>(
      credential,
      'PUT',
      '/athlete/0/events/bulk-delete',
      events,
    );
  }

  /**
   * 下载活动二进制，按 `file` → `fit-file` → `gpx-file` 依次尝试。
   * 鉴权失败（401/403）立即中止；其它端点错误则继续尝试下一个。
   */
  async downloadActivityFile(
    credential: IntervalsIcuApiCredential,
    activityId: string,
  ): Promise<IntervalsIcuDownloadedFile> {
    const endpoints: Array<IntervalsIcuDownloadedFile['endpoint']> = [
      'file',
      'fit-file',
      'gpx-file',
    ];
    let lastError: unknown;

    for (const endpoint of endpoints) {
      try {
        const response = await this.request(
          credential,
          `/activity/${encodeURIComponent(activityId)}/${endpoint}`,
          {
            headers: {
              Accept: 'application/octet-stream,*/*',
            },
          },
        );
        const arrayBuffer = await response.arrayBuffer();
        const contentDisposition = response.headers.get('content-disposition');
        return {
          buffer: Buffer.from(arrayBuffer),
          fileName:
            filenameFromDisposition(contentDisposition) ??
            fallbackFileName(activityId, endpoint),
          contentType: response.headers.get('content-type'),
          endpoint,
        };
      } catch (error) {
        lastError = error;
        if (
          error instanceof IntervalsIcuApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw error;
        }
        this.logger.warn(
          `[Intervals.icu] activity ${activityId} ${endpoint} download failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(
          `Failed to download Intervals.icu activity file ${activityId}`,
        );
  }

  /** 上传活动文件（FIT/GPX）；可用 externalId 做幂等关联。 */
  async uploadActivityFile(
    credential: IntervalsIcuApiCredential,
    args: {
      buffer: Buffer;
      fileName: string;
      contentType?: string;
      name?: string | null;
      description?: string | null;
      deviceName?: string | null;
      externalId?: string | null;
    },
  ): Promise<IntervalsIcuUploadActivityResponse> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([args.buffer as BlobPart], {
        type: args.contentType ?? 'application/octet-stream',
      }),
      args.fileName,
    );

    const response = await this.request(
      credential,
      `/athlete/0/activities${encodeQuery({
        name: args.name,
        description: args.description,
        device_name: args.deviceName,
        external_id: args.externalId,
      })}`,
      {
        method: 'POST',
        body: form,
        headers: {
          Accept: 'application/json',
        },
      },
    );

    return (await response.json()) as IntervalsIcuUploadActivityResponse;
  }
}
