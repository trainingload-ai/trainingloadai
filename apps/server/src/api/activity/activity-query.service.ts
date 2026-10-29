import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { $Enums, Activity, BodyMetricType, Prisma } from '@prisma/client';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import {
  normalizePlanLinkTimeZone,
  resolveActivityCalendarDayStr,
} from '@/api/plan/plan-link-calendar.util';
import { UserQueryService } from '@/api/user/user-query.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PrismaService } from '@/prisma/prisma.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { ActivityMapDerivationService } from './activity-map-derivation.service';
import { ActivityMapThumbJobService } from './activity-map-thumb-job.service';
import {
  LoadReadoutService,
  type ActualLoadReadout,
} from './load-readout.service';
import { ActivityWeatherService } from '@/weather/activity-weather.service';
import {
  ExternalActivityMirrorService,
  type ExternalActivityMirrorDto,
  type ExternalActivityTimelineCursor,
} from '@/importing/external-activity-mirror.service';

export interface ActivityFilters {
  sportType?: string;
  sportDefinitionCodes?: readonly string[];
  startDate?: Date;
  endDate?: Date;
  thirdPartyProvider?: string;
  search?: string;
  minDuration?: number;
  maxDuration?: number;
  minDistance?: number;
  maxDistance?: number;
  calendarTimeZone?: string;
}

export interface ActivityOrderOptions {
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

function isSportType(value: string): value is $Enums.SportType {
  return (Object.values($Enums.SportType) as string[]).includes(value);
}

function isThirdPartyProvider(
  value: string,
): value is $Enums.ThirdPartyProvider {
  return (Object.values($Enums.ThirdPartyProvider) as string[]).includes(value);
}

export const MAX_AI_LOAD_SORT_CANDIDATES = 2_000;

export class ActivityLoadSortLimitError extends BadRequestException {
  constructor() {
    super(
      `Load sorting supports at most ${MAX_AI_LOAD_SORT_CANDIDATES} activities; narrow the date range or filters.`,
    );
  }
}

const ACTIVITY_LIST_INCLUDE = {
  vo2max: true,
  planWorkoutLinks: {
    where: { unlinkedAt: null },
    take: 1,
    orderBy: { linkedAt: 'desc' as const },
    include: {
      planWorkout: {
        select: { id: true, name: true, sportType: true, planId: true },
      },
    },
  },
  thirdPartyMappings: {
    where: { isActive: true },
    orderBy: [
      { isPrimary: 'desc' as const },
      { lastSyncedAt: 'desc' as const },
    ],
    include: {
      thirdPartyActivity: {
        select: { provider: true, externalId: true },
      },
    },
  },
  activitySources: {
    where: { isActive: true },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
    select: {
      id: true,
      sourceKind: true,
      provider: true,
      externalId: true,
      isPrimary: true,
    },
  },
} satisfies Prisma.ActivityInclude;

type ActivityListDbRow = Prisma.ActivityGetPayload<{
  include: typeof ACTIVITY_LIST_INCLUDE;
}>;

type ActivityTimelineCursorPayload = {
  v: 1;
  startTime: string | null;
  kind: 'activity' | 'external_activity_mirror';
  id: string;
};

type ActivityTimelineCandidate =
  | {
      kind: 'activity';
      id: string;
      startTime: Date | null;
      activity: ActivityListDbRow;
    }
  | {
      kind: 'external_activity_mirror';
      id: string;
      startTime: Date | null;
      mirror: ExternalActivityMirrorDto;
    };

function timelineKindRank(kind: ActivityTimelineCandidate['kind']): number {
  return kind === 'activity' ? 0 : 1;
}

/** 与数据库查询一致：时间倒序、同一时刻正式活动在前、同类 ID 倒序。 */
function compareTimelineCandidates(
  left: ActivityTimelineCandidate,
  right: ActivityTimelineCandidate,
): number {
  const leftTime = left.startTime?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightTime = right.startTime?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) return rightTime - leftTime;
  const kindOrder = timelineKindRank(left.kind) - timelineKindRank(right.kind);
  if (kindOrder !== 0) return kindOrder;
  if (left.kind === 'activity' && right.kind === 'activity') {
    return Number(right.id) - Number(left.id);
  }
  return right.id.localeCompare(left.id);
}

function encodeTimelineCursor(candidate: ActivityTimelineCandidate): string {
  const payload: ActivityTimelineCursorPayload = {
    v: 1,
    startTime: candidate.startTime?.toISOString() ?? null,
    kind: candidate.kind,
    id: candidate.id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeTimelineCursor(
  value?: string,
): ExternalActivityTimelineCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<ActivityTimelineCursorPayload>;
    if (
      parsed.v !== 1 ||
      (parsed.kind !== 'activity' &&
        parsed.kind !== 'external_activity_mirror') ||
      typeof parsed.id !== 'string' ||
      !parsed.id
    ) {
      throw new Error('invalid cursor shape');
    }
    if (parsed.kind === 'activity') {
      const id = Number(parsed.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('invalid activity cursor id');
      }
    }
    const startTime = parsed.startTime ? new Date(parsed.startTime) : null;
    if (startTime && Number.isNaN(startTime.getTime())) {
      throw new Error('invalid cursor time');
    }
    return { startTime, kind: parsed.kind, id: parsed.id };
  } catch {
    throw new BadRequestException('Invalid activity timeline cursor');
  }
}

const ACTIVITY_FOR_AI_INCLUDE = {
  laps: true,
  activityZones: true,
  trimp: true,
  epoc: true,
  vo2max: true,
  coggan: true,
  bikeScore: true,
  fitnessMetricsSnapshot: true,
} satisfies Prisma.ActivityInclude;

const ACTIVITY_DETAIL_INCLUDE = {
  laps: true,
  activityPeakMetrics: {
    orderBy: [
      { type: 'asc' as const },
      { scaleType: 'asc' as const },
      { scaleValue: 'asc' as const },
    ],
  },
  activityPerformanceTTs: {
    orderBy: [
      { targetScaleType: 'asc' as const },
      { targetScaleValue: 'asc' as const },
    ],
  },
} satisfies Prisma.ActivityInclude;

type ActivityForAi = Prisma.ActivityGetPayload<{
  include: typeof ACTIVITY_FOR_AI_INCLUDE;
}> &
  ActualLoadReadout;

@Injectable()
export class ActivityQueryService {
  private readonly logger = new Logger(ActivityQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserQueryService,
    private readonly i18n: I18nService,
    private readonly planQuery: PlanQueryService,
    private readonly loadReadout: LoadReadoutService,
    private readonly thumbJobs: ActivityMapThumbJobService,
    private readonly mapDerivation: ActivityMapDerivationService,
    private readonly activityWeather: ActivityWeatherService,
    private readonly externalActivityMirrors: ExternalActivityMirrorService,
  ) {}

  private planLinkUiVisibleForActivity(
    startTime: Date | null | undefined,
    activityTimezone: string | null | undefined,
    clientCalendarTimeZone: string | null | undefined,
    userTimezone: string | null | undefined,
    activePlan: { startDate: Date | null; endDate: Date | null } | null,
  ): boolean {
    if (!activePlan?.startDate || !activePlan?.endDate || !startTime) {
      return false;
    }
    const instant = startTime instanceof Date ? startTime : new Date(startTime);
    if (Number.isNaN(instant.getTime())) return false;

    const activityYmd = resolveActivityCalendarDayStr(
      instant,
      activityTimezone,
      clientCalendarTimeZone,
      userTimezone,
    );
    if (!activityYmd) return false;

    const timeZone = normalizePlanLinkTimeZone(
      activityTimezone ?? clientCalendarTimeZone ?? userTimezone ?? undefined,
    );
    const startYmd = activePlan.startDate.toISOString().slice(0, 10);
    const endYmd = activePlan.endDate.toISOString().slice(0, 10);
    const visible = activityYmd >= startYmd && activityYmd <= endYmd;
    this.logger.debug(
      `[planLinkUi] startTime=${instant.toISOString()} activityTz=${activityTimezone ?? ''} clientTz=${clientCalendarTimeZone ?? ''} userTz=${userTimezone ?? ''} resolvedTz=${timeZone} activityYmd=${activityYmd} planRange=[${startYmd},${endYmd}] visible=${visible}`,
    );
    return visible;
  }

  private toPlanDateYmd(value: Date | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : date.toISOString().slice(0, 10);
  }

  private buildActivityWhere(
    userId: string,
    filters: ActivityFilters,
  ): Prisma.ActivityWhereInput {
    const where: Prisma.ActivityWhereInput = readyActivityWhere({ userId });

    if (filters.sportType && isSportType(filters.sportType)) {
      where.sportType = filters.sportType;
    }
    if (filters.sportDefinitionCodes?.length) {
      where.sportDefinitionCode = { in: [...filters.sportDefinitionCodes] };
    }
    if (filters.startDate || filters.endDate) {
      where.startTime = {};
      if (filters.startDate) where.startTime.gte = filters.startDate;
      if (filters.endDate) where.startTime.lte = filters.endDate;
    }

    if (filters.thirdPartyProvider === 'manual') {
      this.appendAnd(where, {
        OR: [
          {
            activitySources: {
              some: {
                sourceKind: $Enums.ImportSourceKind.FILE,
                isActive: true,
              },
            },
          },
        ],
      });
    } else if (
      filters.thirdPartyProvider &&
      isThirdPartyProvider(filters.thirdPartyProvider)
    ) {
      const provider = filters.thirdPartyProvider;
      this.appendAnd(where, {
        OR: [
          { thirdPartyProvider: provider },
          {
            thirdPartyMappings: {
              some: {
                isActive: true,
                thirdPartyActivity: { provider },
              },
            },
          },
          { activitySources: { some: { provider, isActive: true } } },
        ],
      });
    }

    if (filters.search) {
      where.OR = [
        { activityName: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.minDuration || filters.maxDuration) {
      where.elapsedTime = {};
      if (filters.minDuration) where.elapsedTime.gte = filters.minDuration;
      if (filters.maxDuration) where.elapsedTime.lte = filters.maxDuration;
    }
    if (filters.minDistance || filters.maxDistance) {
      where.distance = {};
      if (filters.minDistance) where.distance.gte = filters.minDistance;
      if (filters.maxDistance) where.distance.lte = filters.maxDistance;
    }

    return where;
  }

  private canIncludeMirrors(filters: ActivityFilters): boolean {
    return (
      !filters.sportType &&
      !filters.sportDefinitionCodes?.length &&
      !filters.minDuration &&
      !filters.maxDuration &&
      !filters.minDistance &&
      !filters.maxDistance
    );
  }

  private activityTimelineCursorWhere(
    cursor: ExternalActivityTimelineCursor | null,
  ): Prisma.ActivityWhereInput | null {
    if (!cursor) return null;
    if (cursor.startTime) {
      return {
        OR: [
          { startTime: { lt: cursor.startTime } },
          ...(cursor.kind === 'activity'
            ? [
                {
                  startTime: { equals: cursor.startTime },
                  id: { lt: Number(cursor.id) },
                },
              ]
            : []),
          { startTime: null },
        ],
      };
    }
    if (cursor.kind === 'activity') {
      return { startTime: null, id: { lt: Number(cursor.id) } };
    }
    // 同一 null 时间下，正式活动排在影子之前；游标已经落到影子后便无需再读正式活动。
    return { id: { lt: 0 } };
  }

  /**
   * 活动列表专用的统一时间线接口。
   *
   * Activity 与影子仍从各自的数据源读取，只在查询层组成带 kind 的只读 feed。
   * 排序与 keyset cursor 都由服务端负责，apps/client/mobile 只按 kind 渲染。
   */
  async getActivityTimeline(args: {
    userId: string;
    filters?: ActivityFilters;
    cursor?: string;
    limit: number;
    readOnly?: boolean;
  }) {
    const filters = args.filters ?? {};
    const cursor = decodeTimelineCursor(args.cursor);
    const where = this.buildActivityWhere(args.userId, filters);
    const cursorWhere = this.activityTimelineCursorWhere(cursor);
    if (cursorWhere) this.appendAnd(where, cursorWhere);
    const countWhere = this.buildActivityWhere(args.userId, filters);
    const includeMirrors = this.canIncludeMirrors(filters);

    const [
      totalActivities,
      activityRows,
      activePlanRow,
      userTzMetric,
      mirrorCandidates,
    ] = await Promise.all([
      this.prisma.activity.count({ where: countWhere }),
      this.prisma.activity.findMany({
        where,
        orderBy: [
          { startTime: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        include: ACTIVITY_LIST_INCLUDE,
        take: args.limit + 1,
      }),
      this.planQuery.findActiveDateRange(args.userId),
      this.users.bodyMetrics().findFirst({
        where: { userId: args.userId, type: BodyMetricType.TIMEZONE },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        select: { value: true },
      }),
      includeMirrors
        ? this.externalActivityMirrors.listTimelineCandidates({
            userId: args.userId,
            take: args.limit + 1,
            cursor,
            search: filters.search,
            provider: filters.thirdPartyProvider,
            startDate: filters.startDate,
            endDate: filters.endDate,
          })
        : Promise.resolve([]),
    ]);

    const candidates: ActivityTimelineCandidate[] = [
      ...activityRows.map((activity) => ({
        kind: 'activity' as const,
        id: String(activity.id),
        startTime: activity.startTime,
        activity,
      })),
      ...mirrorCandidates.map((candidate) => ({
        kind: 'external_activity_mirror' as const,
        id: candidate.mirror.id,
        startTime: candidate.sortTime,
        mirror: candidate.mirror,
      })),
    ].sort(compareTimelineCandidates);
    const pageCandidates = candidates.slice(0, args.limit);
    const selectedActivities = pageCandidates.flatMap((candidate) =>
      candidate.kind === 'activity' ? [candidate.activity] : [],
    );
    const mappedActivities = await this.mapActivityListRows({
      activities: selectedActivities,
      userId: args.userId,
      filters,
      activePlanRow,
      userTzFallback: userTzMetric?.value ?? null,
      readOnly: args.readOnly,
    });
    const activityById = new Map(
      mappedActivities.map((activity) => [activity.id, activity]),
    );
    const items: Array<
      | {
          kind: 'activity';
          activity: (typeof mappedActivities)[number];
        }
      | {
          kind: 'external_activity_mirror';
          mirror: ExternalActivityMirrorDto;
        }
    > = [];
    for (const candidate of pageCandidates) {
      if (candidate.kind === 'external_activity_mirror') {
        items.push({
          kind: 'external_activity_mirror',
          mirror: candidate.mirror,
        });
        continue;
      }
      const activity = activityById.get(candidate.activity.id);
      if (activity) items.push({ kind: 'activity', activity });
    }
    const hasMore = candidates.length > args.limit;
    const lastCandidate = pageCandidates[pageCandidates.length - 1];

    return {
      items,
      nextCursor:
        hasMore && lastCandidate ? encodeTimelineCursor(lastCandidate) : null,
      totalActivities,
    };
  }

  private async mapActivityListRows(args: {
    activities: ActivityListDbRow[];
    userId: string;
    filters: ActivityFilters;
    activePlanRow: { startDate: Date | null; endDate: Date | null } | null;
    userTzFallback: string | null;
    readOnly?: boolean;
  }) {
    const filteredActivities = args.activities.map((activity) => ({
      id: activity.id,
      activityName: activity.activityName,
      sportType: activity.sportType,
      sportDefinitionCode: activity.sportDefinitionCode ?? null,
      subSportType: activity.sportDefinitionCode ?? null,
      fitSubSport: activity.subSport ?? null,
      subSport: activity.subSport ?? null,
      startTime: activity.startTime,
      endTime: activity.endTime,
      timezone: activity.timezone ?? args.userTzFallback,
      duration: activity.elapsedTime,
      elapsedTime: activity.elapsedTime,
      distance: activity.distance,
      ascent: activity.enhancedAscent ?? activity.ascent ?? null,
      descent: activity.enhancedDescent ?? activity.descent ?? null,
      effectiveDistance: activity.effectiveDistance ?? null,
      averageSpeed: activity.avgSpeed ?? null,
      maxSpeed: activity.maxSpeed ?? null,
      avgHeartRate: activity.avgHeartRate ?? null,
      maxHeartRate: activity.maxHeartRate ?? null,
      minHeartRate: activity.minHeartRate ?? null,
      avgPower: activity.avgPower ?? null,
      maxPower: activity.maxPower ?? null,
      minPower: activity.minPower ?? null,
      avgCadence: activity.avgCadence ?? null,
      maxCadence: activity.maxCadence ?? null,
      calories: activity.calories ?? null,
      fatCalories: activity.fatCalories ?? null,
      cycles: activity.cycles ?? null,
      work: activity.work ?? null,
      strokes: activity.strokes ?? null,
      sessionRpe: activity.sessionRpe ?? null,
      avgAerobicEfficiency: activity.avgAerobicEfficiency ?? null,
      pwHr: activity.pwHr ?? null,
      paHr: activity.paHr ?? null,
      avgGAP: activity.avgGAP ?? null,
      NGP: activity.NGP ?? null,
      eftp: activity.eftp ?? null,
      ecp: activity.ecp ?? null,
      ewPrime: activity.ewPrime ?? null,
      epmax: activity.epmax ?? null,
      load: null as number | null,
      description: activity.description,
      thirdPartyProvider: activity.thirdPartyProvider,
      activitySources: activity.activitySources ?? [],
      thirdPartyMappings:
        activity.thirdPartyMappings?.map((mapping) => ({
          id: mapping.id,
          provider: mapping.thirdPartyActivity?.provider ?? null,
          externalId: mapping.thirdPartyActivity?.externalId ?? null,
          syncDirection: mapping.syncDirection ?? null,
          isPrimary: Boolean(mapping.isPrimary),
          lastSyncedAt: mapping.lastSyncedAt ?? null,
        })) ?? [],
      hashId: activity.hashId,
      createdAt: activity.createdAt,
      status: activity.status,
      processingStatus: activity.processingStatus,
      processingUpdatedAt: activity.processingUpdatedAt,
      readyAt: activity.readyAt,
      vo2maxVdotByRace: activity.vo2max?.vo2maxVdotByRace ?? null,
      vo2maxVdotByHr: activity.vo2max?.vo2maxVdotByHr ?? null,
      vo2maxVdotByFactor: activity.vo2max?.vo2maxVdotByFactor ?? null,
      mapThumbnailUrl: null as string | null,
      mapThumbnailDarkUrl: null as string | null,
      linkedPlanWorkout: (() => {
        const link = activity.planWorkoutLinks?.[0];
        const workout = link?.planWorkout;
        return link && workout
          ? {
              planId: workout.planId,
              workoutId: workout.id,
              name: workout.name,
              sportType: workout.sportType,
              source: link.source,
            }
          : null;
      })(),
      planLinkUiVisible: this.planLinkUiVisibleForActivity(
        activity.startTime,
        activity.timezone,
        args.filters.calendarTimeZone ?? null,
        args.userTzFallback,
        args.activePlanRow,
      ),
      planLinkActiveStartDate: args.activePlanRow
        ? this.toPlanDateYmd(args.activePlanRow.startDate)
        : null,
      planLinkActiveEndDate: args.activePlanRow
        ? this.toPlanDateYmd(args.activePlanRow.endDate)
        : null,
    }));

    const activityIds = filteredActivities.map((activity) => activity.id);
    const [thumbUrlMap, actualLoadMap] = await Promise.all([
      this.thumbJobs.getSucceededThumbUrlVariantMap(activityIds),
      this.loadReadout.batchGetActualLoad(activityIds),
    ]);
    for (const row of filteredActivities) {
      const urls = thumbUrlMap.get(row.id);
      row.mapThumbnailUrl = urls?.lightUrl ?? null;
      row.mapThumbnailDarkUrl = urls?.darkUrl ?? urls?.lightUrl ?? null;
      row.load = actualLoadMap.get(row.id)?.actualLoad ?? null;
    }

    const missingThumbIds = filteredActivities
      .filter((activity) => {
        const urls = thumbUrlMap.get(activity.id);
        return !urls?.lightUrl || !urls?.darkUrl;
      })
      .map((activity) => activity.id);
    if (!args.readOnly && missingThumbIds.length > 0) {
      void this.mapDerivation
        .ensureThumbsBestEffort(missingThumbIds, args.userId)
        .catch((error) => {
          this.logger.warn(
            `[活动地图缩略图] 列表兜底入队失败 userId=${args.userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    return filteredActivities;
  }

  async getActivities(
    userId: string,
    filters: ActivityFilters = {},
    orderOptions: ActivityOrderOptions = {},
    page?: number,
    perPage?: number,
    options: { readOnly?: boolean } = {},
  ) {
    try {
      const paginated =
        typeof page === 'number' &&
        typeof perPage === 'number' &&
        page > 0 &&
        perPage > 0;
      const skip = paginated ? (page - 1) * perPage : undefined;
      const take = paginated ? perPage : undefined;
      const where = this.buildActivityWhere(userId, filters);

      const { orderBy = 'startTime', orderDirection = 'desc' } = orderOptions;
      const orderField = this.resolveOrderField(orderBy);
      const orderByArg: Prisma.ActivityOrderByWithRelationInput[] = [
        { [orderField]: orderDirection },
        { id: orderDirection },
      ];
      // 是否包含外部活动镜像
      const includeMirrors = this.canIncludeMirrors(filters);
      const [
        total,
        activities,
        activePlanRow,
        userTzMetric,
        externalActivityMirrors,
      ] = await Promise.all([
        // 正式活动与影子分别查询：total 和 activities 永远只来自 t_activity。
        this.prisma.activity.count({ where }),
        this.prisma.activity.findMany({
          where,
          orderBy: orderByArg,
          include: ACTIVITY_LIST_INCLUDE,
          skip,
          take,
        }),
        this.planQuery.findActiveDateRange(userId),
        this.users.bodyMetrics().findFirst({
          where: { userId, type: BodyMetricType.TIMEZONE },
          orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
          select: { value: true },
        }),
        includeMirrors
          ? // 影子是并列的只读时间线投影，不能混入 Activity DTO 或活动统计。
            this.externalActivityMirrors.listForUser({
              userId,
              page,
              search: filters.search,
              provider: filters.thirdPartyProvider,
              startDate: filters.startDate,
              endDate: filters.endDate,
            })
          : Promise.resolve([]),
      ]);

      const userTzFallback = userTzMetric?.value ?? null;
      const filteredActivities = await this.mapActivityListRows({
        activities,
        userId,
        filters,
        activePlanRow,
        userTzFallback,
        readOnly: options.readOnly,
      });

      return { activities: filteredActivities, total, externalActivityMirrors };
    } catch (error) {
      this.logger.error(
        `[获取活动列表] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) throw error;
      throw this.internalError();
    }
  }

  private appendAnd(
    where: Prisma.ActivityWhereInput,
    clause: Prisma.ActivityWhereInput,
  ): void {
    const prior = where.AND;
    where.AND = [
      ...(Array.isArray(prior) ? prior : prior ? [prior] : []),
      clause,
    ];
  }

  private resolveOrderField(
    requested: string,
  ): 'startTime' | 'distance' | 'elapsedTime' | 'createdAt' {
    if (requested === 'totalDistance') return 'distance';
    if (requested === 'totalElapsedTime') return 'elapsedTime';
    return requested === 'distance' ||
      requested === 'elapsedTime' ||
      requested === 'createdAt'
      ? requested
      : 'startTime';
  }

  async getActivityElevationComparison(userId: string, activityId: number) {
    try {
      const activity = await this.prisma.activity.findFirst({
        where: readyActivityWhere({ id: activityId, userId }),
        select: {
          id: true,
          activityName: true,
          ascent: true,
          descent: true,
          enhancedAscent: true,
          enhancedDescent: true,
          enhancedMinElevation: true,
          enhancedMaxElevation: true,
        },
      });
      if (!activity) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: '活动不存在',
        });
      }
      return {
        activityId: activity.id,
        activityName: activity.activityName,
        original: {
          totalAscent: activity.ascent,
          totalDescent: activity.descent,
        },
        enhanced: {
          totalAscent: null,
          totalDescent: null,
          minElevation: null,
          maxElevation: null,
        },
        improvements: {
          ascentImprovement: null,
          descentImprovement: null,
        },
        hasEnhancedData: false,
      };
    } catch (error) {
      this.logger.error(
        `[获取活动海拔对比] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) throw error;
      throw this.internalError();
    }
  }

  async getActivityByHashId(
    hashId: string,
    userId?: string,
  ): Promise<
    Activity & {
      subSportType: string | null;
      fitSubSport: number | null;
      averageSpeed: number | null;
    }
  > {
    if (!hashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_hash_id_cannot_be_empty'),
      });
    }
    const where: Prisma.ActivityWhereInput = readyActivityWhere({ hashId });
    if (userId) where.userId = userId;
    let activity = await this.prisma.activity.findFirst({
      where,
      include: ACTIVITY_DETAIL_INCLUDE,
    });
    if (!activity && userId) {
      const mergedAlias = await this.prisma.activity.findFirst({
        where: {
          hashId,
          userId,
          state: 0,
          mergedIntoActivityId: { not: null },
        },
        select: { mergedIntoActivityId: true },
      });
      if (mergedAlias?.mergedIntoActivityId) {
        activity = await this.prisma.activity.findFirst({
          where: readyActivityWhere({
            id: mergedAlias.mergedIntoActivityId,
            userId,
          }),
          include: ACTIVITY_DETAIL_INCLUDE,
        });
      }
    }
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }
    if (activity.userId !== userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACCESS_FORBIDDEN,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }
    return {
      ...activity,
      subSportType: activity.sportDefinitionCode ?? null,
      fitSubSport: activity.subSport ?? null,
      averageSpeed: activity.avgSpeed ?? null,
    } as Activity & {
      subSportType: string | null;
      fitSubSport: number | null;
      averageSpeed: number | null;
    };
  }

  private async attachActivityDetailReadout<
    T extends { id: number; userId: string },
  >(activity: T) {
    const [urlMap, actualLoad, weather] = await Promise.all([
      this.thumbJobs.getSucceededThumbUrlVariantMap([activity.id]),
      this.loadReadout.getActualLoadForActivity(activity.id),
      this.activityWeather.read(activity.id, activity.userId),
    ]);
    const urls = urlMap.get(activity.id) ?? null;
    return {
      ...activity,
      actualLoadSource: actualLoad.actualLoadSource,
      load: actualLoad.actualLoad,
      mapThumbnailUrl: urls?.lightUrl ?? null,
      mapThumbnailDarkUrl: urls?.darkUrl ?? urls?.lightUrl ?? null,
      weather,
    };
  }

  async getActivityByIdentifier(identifier: string, userId: string) {
    const normalized = identifier?.trim();
    if (!normalized) return this.getActivityByHashId(normalized, userId);

    const byHashId = await this.prisma.activity.findFirst({
      where: readyActivityWhere({ hashId: normalized, userId }),
      include: ACTIVITY_DETAIL_INCLUDE,
    });
    if (byHashId)
      return this.attachActivityDetailReadout(this.withAliases(byHashId));

    const numericId = /^\d+$/.test(normalized) ? Number(normalized) : NaN;
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      const byNumericId = await this.prisma.activity.findFirst({
        where: readyActivityWhere({ id: numericId, userId }),
        include: ACTIVITY_DETAIL_INCLUDE,
      });
      if (byNumericId) {
        return this.attachActivityDetailReadout(this.withAliases(byNumericId));
      }
      const mergedAlias = await this.prisma.activity.findFirst({
        where: {
          id: numericId,
          userId,
          state: 0,
          mergedIntoActivityId: { not: null },
        },
        select: { mergedIntoActivityId: true },
      });
      if (mergedAlias?.mergedIntoActivityId) {
        const survivor = await this.prisma.activity.findFirst({
          where: readyActivityWhere({
            id: mergedAlias.mergedIntoActivityId,
            userId,
          }),
          include: ACTIVITY_DETAIL_INCLUDE,
        });
        if (survivor) {
          return this.attachActivityDetailReadout(this.withAliases(survivor));
        }
      }
    }
    return this.attachActivityDetailReadout(
      await this.getActivityByHashId(normalized, userId),
    );
  }

  private withAliases<
    T extends {
      sportDefinitionCode: string | null;
      subSport: number | null;
      avgSpeed: number | null;
    },
  >(activity: T) {
    return {
      ...activity,
      subSportType: activity.sportDefinitionCode ?? null,
      fitSubSport: activity.subSport ?? null,
      averageSpeed: activity.avgSpeed ?? null,
    };
  }

  async getActivityReadiness(hashId: string, userId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { hashId, userId, state: 1 },
      select: { hashId: true, processingStatus: true, readyAt: true },
    });
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }
    const status = String(activity.processingStatus ?? '').toUpperCase();
    return {
      activityHashId: activity.hashId,
      failed: status === 'FAILED' || status === 'PARTIAL_FAILED',
      ready: Boolean(activity.readyAt) || status === 'READY',
      status,
    };
  }

  async getActivityByHashIdForAi(
    hashId: string,
    userId: string,
  ): Promise<ActivityForAi> {
    if (!hashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_hash_id_cannot_be_empty'),
      });
    }
    this.assertUserId(userId);
    const activity = await this.prisma.activity.findFirst({
      where: readyActivityWhere({ hashId, userId }),
      include: ACTIVITY_FOR_AI_INCLUDE,
    });
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }
    return {
      ...activity,
      ...(await this.loadReadout.getActualLoadForActivity(activity.id)),
    };
  }

  async getRecentActivitiesForAi(args: {
    userId: string;
    limit: number;
    sportType?: string;
  }) {
    const { userId, limit, sportType } = args;
    this.assertUserId(userId);
    const take = Math.max(1, Math.min(20, Math.floor(limit || 10)));
    const value = String(sportType ?? '').trim();
    const where = isSportType(value)
      ? readyActivityWhere({ userId, sportType: value })
      : readyActivityWhere({ userId });
    const rows = await this.prisma.activity.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take,
      include: { trimp: true, vo2max: true, coggan: true },
    });
    const loads = await this.loadReadout.batchGetActualLoad(
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      ...row,
      aiLoad: loads.get(row.id)?.actualLoad ?? null,
      aiLoadSource: loads.get(row.id)?.actualLoadSource ?? null,
    }));
  }

  async searchActivitiesForAi(args: {
    userId: string;
    limit: number;
    offset?: number;
    sportType?: string;
    search?: string;
    from?: Date;
    to?: Date;
    sortBy?: 'startTime' | 'distance' | 'duration' | 'load';
    order?: 'asc' | 'desc';
  }) {
    const {
      userId,
      limit,
      offset = 0,
      sportType,
      search,
      from,
      to,
      sortBy,
      order,
    } = args;
    this.assertUserId(userId);
    const take = Math.max(1, Math.min(21, Math.floor(limit || 8)));
    const skip = Math.max(0, Math.min(10_000, Math.floor(offset || 0)));
    const value = String(sportType ?? '').trim();
    const direction: 'asc' | 'desc' = order === 'asc' ? 'asc' : 'desc';
    const where: Prisma.ActivityWhereInput = isSportType(value)
      ? readyActivityWhere({ userId, sportType: value })
      : readyActivityWhere({ userId });
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime.gte = from;
      if (to) where.startTime.lte = to;
    }
    const query = String(search ?? '').trim();
    if (query) {
      where.OR = [
        { activityName: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    const orderBy =
      sortBy === 'distance'
        ? ({ distance: direction } as const)
        : sortBy === 'duration'
          ? ({ timerTime: direction } as const)
          : ({ startTime: direction } as const);
    const loadSort = sortBy === 'load';
    const rows = await this.prisma.activity.findMany({
      where,
      orderBy,
      ...(loadSort
        ? { take: MAX_AI_LOAD_SORT_CANDIDATES + 1 }
        : { skip, take }),
      include: { trimp: true, coggan: true },
    });
    if (loadSort && rows.length > MAX_AI_LOAD_SORT_CANDIDATES) {
      throw new ActivityLoadSortLimitError();
    }
    const loads = await this.loadReadout.batchGetActualLoad(
      rows.map((row) => row.id),
    );
    const enriched = rows.map((row) => ({
      ...row,
      aiLoad: loads.get(row.id)?.actualLoad ?? null,
      aiLoadSource: loads.get(row.id)?.actualLoadSource ?? null,
    }));
    if (!loadSort) return enriched;

    enriched.sort((left, right) => {
      if (left.aiLoad == null && right.aiLoad == null) {
        return this.compareActivityRecency(left, right);
      }
      if (left.aiLoad == null) return 1;
      if (right.aiLoad == null) return -1;
      const loadDifference =
        direction === 'asc'
          ? left.aiLoad - right.aiLoad
          : right.aiLoad - left.aiLoad;
      return loadDifference || this.compareActivityRecency(left, right);
    });
    return enriched.slice(skip, skip + take);
  }

  async getActivitiesWithZonesForAi(args: {
    userId: string;
    from: Date;
    to: Date;
  }) {
    const { userId, from, to } = args;
    this.assertUserId(userId);
    return this.prisma.activity.findMany({
      where: readyActivityWhere({
        userId,
        startTime: { gte: from, lte: to },
      }),
      include: { activityZones: true },
    });
  }

  /**
   * Bounded, user-scoped activity facts for MCP aggregate statistics.
   * The internal numeric id is used only to resolve the canonical load and is
   * never exposed by the MCP provider.
   */
  async getStatisticsRowsForMcp(args: {
    userId: string;
    from: Date;
    to: Date;
    sportType?: string;
    limit: number;
  }) {
    this.assertUserId(args.userId);
    const sportType = String(args.sportType ?? '').trim();
    const rows = await this.prisma.activity.findMany({
      where: readyActivityWhere({
        userId: args.userId,
        startTime: { gte: args.from, lte: args.to },
        ...(isSportType(sportType) ? { sportType } : {}),
      }),
      orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
      take: Math.max(1, Math.min(1_001, Math.floor(args.limit + 1))),
      select: {
        id: true,
        startTime: true,
        sportType: true,
        timerTime: true,
        elapsedTime: true,
        distance: true,
      },
    });
    const loads = await this.loadReadout.batchGetActualLoad(
      rows.slice(0, args.limit).map((row) => row.id),
    );
    return rows.map((row) => ({
      ...row,
      actualLoad: loads.get(row.id)?.actualLoad ?? null,
    }));
  }

  private assertUserId(userId: string): void {
    if (userId) return;
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
      message: this.i18n.t('common.error.current_user_not_logged_in'),
    });
  }

  private compareActivityRecency(
    left: { id: number; startTime?: Date | null },
    right: { id: number; startTime?: Date | null },
  ) {
    const timeDifference =
      (right.startTime?.getTime() ?? 0) - (left.startTime?.getTime() ?? 0);
    return timeDifference || right.id - left.id;
  }

  private internalError(): BusinessException {
    return new BusinessException({
      code: BUSINESS_ERROR_CODE.COMMON,
      message: this.i18n.t('error.common.internal_server_error', {
        lang: I18nContext.current()?.lang,
      }),
    });
  }
}
