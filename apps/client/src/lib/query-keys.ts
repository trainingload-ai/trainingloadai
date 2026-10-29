/**
 * TanStack Query key 工厂：与历史字面量保持一致，便于前缀失效与集中维护。
 *
 * 失效请优先使用 `@/lib/query-invalidation` 中的域级函数，避免在组件内手写长串
 * `invalidateQueries`。新增语义时先在此补工厂，再在 invalidation 模块挂载依赖。
 */

export const USER_ZONES_QUERY_KEY = ["userZones"] as const;

export const queryKeys = {
  /** 用于 invalidateQueries 前缀匹配的领域根 */
  root: {
    activity: ["activity"] as const,
    activities: ["activities"] as const,
    activityStats: ["activity-stats"] as const,
    plans: ["plans-list"] as const,
    planDetail: ["plan-detail"] as const,
    planWorkoutDetail: ["plan-workout-detail"] as const,
    userProfile: ["userProfile"] as const,
    userZones: ["userZones"] as const,
    home: ["v2-home"] as const,
    pmcData: ["pmc-data"] as const,
    fitnessStatus: ["fitness-status"] as const,
    pmcExtremes: ["pmc-extremes"] as const,
    notifications: ["notifications"] as const,
    competitionEvents: ["competition-events"] as const,
    /** 前缀失效图层 / 月历聚合 */
    activitiesLayer: ["activities-layer"] as const,
    activitiesMonthly: ["activities-monthly"] as const,
    /** FitnessStatus / 账户指标侧栏：按 sport 分支的查询前缀 */
    fitnessStatusMetricPair: ["fitness-status-metric-pair"] as const,
    userFitnessMetricPairs: ["user-fitness-metric-pairs"] as const,
  },

  /** 通知中心（与 root.notifications 前缀区分：此处为具体 tab） */
  notifications: {
    prefix: () => ["notifications"] as const,
    unread: () => ["notifications", "unread"] as const,
    listAll: () => ["notifications", "all"] as const,
    summary: () => ["notifications", "summary"] as const,
    infinite: (tab: string) => ["notifications", "infinite", tab] as const,
  },

  activity: {
    detail: (hashId: string) => ["activity", hashId] as const,
    strength: (hashId: string) => ["activity-strength", hashId] as const,
    /** 历史 digest 流（useAiAnalysis） */
    aiDigest: (activityId: string, locale: string, useCache: boolean) =>
      ["aiAnalysis", activityId, locale, useCache] as const,
    /** 单活动地图 layer（非首页聚合图层） */
    layer: (activityId: string) => ["activity-layer", activityId] as const,
    planLink: (activityId: string) =>
      ["activity-plan-link", activityId] as const,
    stats: (year?: number) => ["activity-stats", year] as const,
    /** 月历等活动列表（参数化） */
    monthly: (
      startDate: string,
      endDate: string,
      sportType?: string,
      orderBy?: string,
      orderDirection?: string,
    ) =>
      [
        "activities-monthly",
        startDate,
        endDate,
        sportType,
        orderBy,
        orderDirection,
      ] as const,
    aiReview: (activityId: number | string | null, lang: string) =>
      ["activityAiReview", activityId, lang] as const,
    metricSeries: (activityId: string, metric: unknown) =>
      ["activity-metric-series", activityId, metric] as const,
    swimOverview: (activityId: string | null) =>
      ["activitySwimOverview", activityId] as const,
  },

  import: {
    batch: (batchId: string | null | undefined) =>
      ["import-batch", batchId] as const,
    batchItems: (batchId: string | null | undefined) =>
      ["import-batch-items", batchId] as const,
  },

  home: {
    v2: () => ["v2-home"] as const,
    recentActivities: () => ["v2-home-recent-activities"] as const,
  },

  coach: {
    recentActivities: () => ["v2-coach-recent-activities"] as const,
  },

  timezone: {
    prompt: () => ["timezone-prompt"] as const,
  },

  plans: {
    list: () => ["plans-list"] as const,
    /** plan-workout-activity-link-control 等使用的历史 key */
    legacyPlans: () => ["plans"] as const,
    active: () => ["active-plan"] as const,
    detail: (planId?: string) => ["plan-detail", planId] as const,
    workoutDetail: (planId?: string, workoutId?: string) =>
      ["plan-workout-detail", planId, workoutId] as const,
    summary: (planId?: string) => ["plan-summary", planId] as const,
    scheduled: (start?: string, end?: string) =>
      ["scheduled-workouts", start, end] as const,
    templates: (goal?: string, locale?: string) =>
      ["plan-templates", goal, locale] as const,
    template: (slug?: string, locale?: string, variantId?: string) =>
      ["plan-template", slug, locale, variantId] as const,
    templateRecommendation: (goal?: string) =>
      ["plan-template-recommendation", goal] as const,
  },

  competitionEvents: {
    all: () => ["competition-events"] as const,
    range: (startDate?: string, endDate?: string, status?: string) =>
      ["competition-events", startDate, endDate, status] as const,
    detail: (eventId?: string) => ["competition-event", eventId] as const,
  },
  competitionImpact: {
    all: () => ["competition-impact"] as const,
    current: (
      scopeType?: string,
      startDate?: string,
      endDate?: string,
      anchorDate?: string,
      locale?: string,
    ) =>
      [
        "competition-impact",
        "current",
        scopeType,
        startDate,
        endDate,
        anchorDate,
        locale,
      ] as const,
  },

  user: {
    settings: () => ["user-settings"] as const,
    profile: (sport?: string) => ["userProfile", sport] as const,
    zones: () => USER_ZONES_QUERY_KEY,
    bodyMetrics: (type: string) => ["userBodyMetrics", type] as const,
    criticalPowerHistory: (sport: string | undefined, metric: string) =>
      ["userCriticalPowerHistory", sport, metric] as const,
    isNewUser: () => ["isNewUser"] as const,
    fitnessMetricPairs: (sportType?: string) =>
      ["user-fitness-metric-pairs", sportType] as const,
    fitnessStatusMetricPair: (sportType?: string) =>
      ["fitness-status-metric-pair", sportType] as const,
    autoUpdateConfig: () => ["auto-update-config"] as const,
    checkCriticalPowerUpdateNeeded: () =>
      ["checkCriticalPowerUpdateNeeded"] as const,
    fitnessMetricDialog: (type: string, sportType?: string) =>
      ["userFitnessMetricDialog", type, sportType] as const,
    fitnessMetricEffectiveHistory: (type: string, sportType?: string) =>
      ["userFitnessMetricEffectiveHistory", type, sportType] as const,
  },

  pmc: {
    data: () => queryKeys.root.pmcData,
    fitnessStatus: () => queryKeys.root.fitnessStatus,
    extremes: () => queryKeys.root.pmcExtremes,
    /** 日期区间 PMC 序列（与历史字面量 ["pmc-data", params] 一致） */
    series: (params?: unknown) => ["pmc-data", params] as const,
  },

  activitiesLayer: {
    all: (filters: unknown) => ["activities-layer", filters] as const,
  },

  aiCoach: {
    sessionsRoot: () => ["ai-coach-sessions"] as const,
    sidebar: () => ["ai-coach-sessions", "sidebar"] as const,
    history: () => ["ai-coach-sessions", "history"] as const,
    messages: (sid: string) => ["ai-coach-messages", sid] as const,
    /** 复盘入口卡组（hub） */
    reviewSessionsHub: (scope: "daily" | "weekly" | "monthly") =>
      ["ai-coach-review-sessions", scope] as const,
    /** 复盘全屏列表 infinite */
    reviewSessionsInfinite: (scope: "daily" | "weekly" | "monthly" | null) =>
      ["ai-coach-review-sessions-infinite", scope] as const,
  },

  ai: {
    pendingDecisions: () => ["ai-pending-decisions"] as const,
    featureAccess: () => ["feature-access"] as const,
    dataConsent: () => ["ai-data-consent"] as const,
    entitlements: () => ["ai-entitlements"] as const,
    planExecutionAdvice: (params: unknown) =>
      ["ai-plan-execution-advice", params] as const,
    usageSummary: () => ["ai-usage-summary"] as const,
    /** 前缀：失效所有带分页参数的 usage events */
    usageEvents: () => ["ai-usage-events"] as const,
    usageEventsQuery: (range?: {
      start?: string;
      end?: string;
      page?: number;
      limit?: number;
    }) =>
      [
        "ai-usage-events",
        range?.start,
        range?.end,
        range?.page,
        range?.limit,
      ] as const,
    usageTrend: (range?: {
      days?: number;
      start?: string;
      end?: string;
      timeZone?: string;
    }) =>
      [
        "ai-usage-trend",
        range?.days,
        range?.start,
        range?.end,
        range?.timeZone,
      ] as const,
  },

  selfHost: {
    aiConfiguration: () => ["self-host-ai-configuration"] as const,
    telemetryConsent: () => ["self-host-telemetry-consent"] as const,
  },

  /** /me 聚合页 */
  me: {
    userSettings: () => ["v2-me-user-settings"] as const,
    accounts: () => ["v2-me-accounts"] as const,
  },

  account: {
    verified: () => ["account-is-verified"] as const,
    passwordStatus: () => ["account-password-status"] as const,
    intervalsIcu: () => ["account-intervals-icu"] as const,
    externalProvider: (provider: string, resource = "status") =>
      ["account-external-provider", provider, resource] as const,
    oauthAuthorizations: () => ["account-oauth-authorizations"] as const,
  },

  charts: {
    weeklySummaryPair: (params: unknown) =>
      ["weekly-summary-pair", params] as const,
    configs: (location?: string) =>
      location
        ? (["chart-configs", location] as const)
        : (["chart-configs"] as const),
    activityMetricSummary: (key: unknown, params: unknown) =>
      ["activity-metric-summary", key, params] as const,
    summaryMetadata: (key: unknown, params: unknown) =>
      ["charts-summary-metadata", key, params] as const,
    summaryRows: (key: unknown, params: unknown) =>
      ["charts-summary-rows", key, params] as const,
    metrics: () => ["metrics"] as const,
    dimensions: () => ["dimensions"] as const,
    templates: () => ["chart-templates"] as const,
  },

  /** 校准 VO2 等活动选择器 */
  calibration: {
    activitySelector: (page: unknown, filters: unknown) =>
      ["activities-calibration-selector", page, filters] as const,
  },

  power: {
    activityBase: (activityId: string | null) =>
      ["activityPowerBase", activityId] as const,
    activityZones: (activityId: string | null) =>
      ["activityPowerZones", activityId] as const,
    zonesRoot: () => ["powerZones"] as const,
    zonePreviews: (sportType: string) =>
      ["powerZones", "preview", sportType] as const,
    zones: (activityId?: string | null, sportType?: unknown) =>
      ["powerZones", activityId, sportType] as const,
    durationCurve: (timeRanges: unknown, sportType: unknown) =>
      ["power/duration-curve", timeRanges, sportType] as const,
    mmpHistory: (
      time: unknown,
      sportType: unknown,
      bucket: unknown,
      duration: unknown,
    ) => ["power/mmp-history", time, sportType, bucket, duration] as const,
    zonesDistribution: (timeRanges: unknown, sportType: unknown) =>
      ["power/zones-distribution", timeRanges, sportType] as const,
    durationCurvePoints: (timeRanges: unknown, sportType: unknown) =>
      ["power/duration-curve-points", timeRanges, sportType] as const,
    activityDurationCurve: (activityId: string | null) =>
      ["activityPowerDurationCurve", activityId] as const,
  },

  heartRate: {
    powerRatio: (activityId: string) =>
      ["heartRatePowerRatio", activityId] as const,
    trimpPerMinute: (activityId: string) =>
      ["trimpPerMinute", activityId] as const,
    durationCurve: (timeRanges: unknown, sportType: unknown) =>
      ["heart-rate/duration-curve", timeRanges, sportType] as const,
    zonesDistribution: (timeRanges: unknown, sportType: unknown) =>
      ["heart-rate/zones-distribution", timeRanges, sportType] as const,
    activityDurationCurve: (activityId: string | null) =>
      ["activityHeartRateDurationCurve", activityId] as const,
    zonesRoot: () => ["heartRateZones"] as const,
    zonePreviews: (sportType: string) =>
      ["heartRateZones", "preview", sportType] as const,
    zones: (activityId?: string | null, sportType?: unknown) =>
      ["heartRateZones", activityId, sportType] as const,
    base: (activityId: string) => ["heartRateBase", activityId] as const,
    epoc: (activityId: string) => ["epoc-chart", activityId] as const,
  },

  pace: {
    bestPerformance: (
      timeRanges: unknown,
      sportType: unknown,
      distances: unknown,
      mode: unknown,
      targets: unknown,
      limit: unknown,
    ) =>
      [
        "pace/best-performance",
        timeRanges,
        sportType,
        distances,
        mode,
        targets,
        limit,
      ] as const,
    distanceCurve: (timeRanges: unknown, sportType: unknown) =>
      ["pace/distance-curve", timeRanges, sportType] as const,
    zonesRoot: () => ["pace/zones"] as const,
    zonePreviews: (sportType: string) =>
      ["pace/zones", "preview", sportType] as const,
    zones: (activityId?: string | null, sportType?: unknown) =>
      ["pace/zones", activityId, sportType] as const,
    zonesDistribution: (timeRanges: unknown, sportType: unknown) =>
      ["pace/zones-distribution", timeRanges, sportType] as const,
    distancePerformance: (timeRanges: unknown, sportType: unknown) =>
      ["pace/distance-performance", timeRanges, sportType] as const,
    cs: (sportType: unknown, windowDays: unknown) =>
      ["pace/cs", sportType, windowDays] as const,
  },

  paceAnalysis: {
    base: (activityId: string | undefined) =>
      ["pace/base", activityId] as const,
  },
} as const;

/** 与 @/api/ai-coach 历史导出一致，便于前缀失效 */
export const AI_COACH_SESSIONS_QUERY_KEY = ["ai-coach-sessions"] as const;
export const AI_COACH_SESSIONS_SIDEBAR_QUERY_KEY = [
  "ai-coach-sessions",
  "sidebar",
] as const;
export const AI_COACH_SESSIONS_HISTORY_QUERY_KEY = [
  "ai-coach-sessions",
  "history",
] as const;
