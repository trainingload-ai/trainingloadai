import type {
  V2ActivityListItem,
  V2ExternalActivityMirror,
} from "@/api/v2-activities";
import {
  THIRD_PARTY_PROVIDER_BRANDS,
  type ThirdPartyProviderBrand,
} from "@/components/third-party/provider-favicon";

export const DEV_ACTIVITY_FEED_FIXTURE_HASH_ID =
  "__dev_all_third_party_providers__";
export const DEV_EXTERNAL_ACTIVITY_MIRROR_ID =
  "__dev_external_activity_mirror__";

const ALL_THIRD_PARTY_PROVIDERS = Object.keys(
  THIRD_PARTY_PROVIDER_BRANDS,
) as ThirdPartyProviderBrand[];

/**
 * 仅用于开发环境目测活动卡片的同步来源布局；不会经过 API，也不会写入数据库。
 * 所有第三方都设为双向，确保左侧入站和右侧出站一次就能验收完整品牌集合。
 */
export const DEV_ALL_PROVIDERS_ACTIVITY: V2ActivityListItem = {
  id: -9_001,
  hashId: DEV_ACTIVITY_FEED_FIXTURE_HASH_ID,
  title: "DEV · 全部第三方同步预览",
  sportType: "RUN",
  subSportType: null,
  fitSubSport: null,
  subSport: null,
  startTime: "2026-09-15T12:00:00.000Z",
  timezone: "Asia/Shanghai",
  duration: 3_600,
  distance: 10_000,
  load: 88,
  ascent: 120,
  calories: 620,
  averageSpeed: 2.78,
  avgHeartRate: 152,
  avgPower: 268,
  avgCadence: 178,
  status: "READY",
  note: "仅 development 环境显示，不来自 API，也不会写入数据库。",
  providers: ["manual", ...ALL_THIRD_PARTY_PROVIDERS],
  primaryProvider: "manual",
  thirdPartyMappings: ALL_THIRD_PARTY_PROVIDERS.map((provider, index) => ({
    id: -(index + 1),
    provider,
    externalId: `dev-${provider}`,
    syncDirection: "BIDIRECTIONAL",
    isPrimary: false,
    lastSyncedAt: "2026-09-15T12:00:00.000Z",
  })),
  mapThumbnailUrl: null,
  mapThumbnailDarkUrl: null,
  linkedPlanWorkout: null,
  planLinkUiVisible: false,
  planLinkActiveStartDate: null,
  planLinkActiveEndDate: null,
};

/** 仅用于 development 环境目测影子活动，不经过 API，也不会写入数据库。 */
export const DEV_EXTERNAL_ACTIVITY_MIRROR: V2ExternalActivityMirror = {
  id: DEV_EXTERNAL_ACTIVITY_MIRROR_ID,
  kind: "external_activity_mirror",
  title: "午间轻松跑",
  startTime: "2026-10-10T04:20:00.000Z",
  discoveredVia: "intervals_icu",
  originProvider: "external_demo",
  status: "BLOCKED",
  reason: "ORIGIN_CONNECTION_REQUIRED",
  action: "MANAGE_CONNECTION",
};

export function isDevActivityFeedFixture(
  activity: Pick<V2ActivityListItem, "hashId">,
) {
  return activity.hashId === DEV_ACTIVITY_FEED_FIXTURE_HASH_ID;
}

export function injectDevelopmentActivityFixture(
  items: V2ActivityListItem[],
  environment = process.env.NODE_ENV,
) {
  if (environment !== "development" || items.some(isDevActivityFeedFixture)) {
    return items;
  }
  return [DEV_ALL_PROVIDERS_ACTIVITY, ...items];
}
