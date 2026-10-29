import type {
  V2ActivityListItem,
  V2ActivitySourceProvider,
  V2ActivityThirdPartyMapping,
  V2ActivityThirdPartyProvider,
  V2ExternalActivityMirror,
} from "@/api/v2-activities";

function normalizeProvider(
  provider: string | null | undefined,
): V2ActivitySourceProvider {
  const value = String(provider ?? "").toLowerCase();
  if (value === "intervals_icu" || value === "intervals.icu")
    return "intervals_icu";
  return value || "manual";
}

function normalizeThirdPartyProvider(
  provider: string | null | undefined,
): V2ActivityThirdPartyProvider {
  const value = String(provider ?? "").toLowerCase();
  if (value === "intervals_icu" || value === "intervals.icu")
    return "intervals_icu";
  return value || "unknown";
}

function normalizeSyncDirection(
  value: string | null | undefined,
): V2ActivityThirdPartyMapping["syncDirection"] {
  const normalized = String(value ?? "").toUpperCase();
  if (
    normalized === "IMPORT" ||
    normalized === "EXPORT" ||
    normalized === "BIDIRECTIONAL"
  ) {
    return normalized;
  }
  return null;
}

function mapThirdPartyMappings(row: any): V2ActivityThirdPartyMapping[] {
  const raw = Array.isArray(row?.thirdPartyMappings)
    ? row.thirdPartyMappings
    : [];
  const seen = new Set<string>();
  const mapped: V2ActivityThirdPartyMapping[] = [];
  for (const item of raw) {
    const provider = normalizeThirdPartyProvider(item?.provider);
    const externalId =
      typeof item?.externalId === "string" && item.externalId.trim()
        ? item.externalId
        : null;
    const key = `${provider}:${externalId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mapped.push({
      id: Number(item?.id ?? 0),
      provider,
      externalId,
      syncDirection: normalizeSyncDirection(item?.syncDirection),
      isPrimary: Boolean(item?.isPrimary),
      lastSyncedAt: item?.lastSyncedAt ? String(item.lastSyncedAt) : null,
    });
  }
  return mapped;
}

function normalizeSportType(
  sportType: string | null | undefined,
): V2ActivityListItem["sportType"] {
  const value = String(sportType ?? "").toUpperCase();
  if (value === "RUN") return "RUN";
  if (value === "CYCLING") return "CYCLING";
  if (value === "SWIM") return "SWIM";
  if (value === "FITNESS") return "FITNESS";
  return "UNKNOWN";
}

function normalizeStatus(
  processingStatus: string | null | undefined,
  legacyStatus: string | null | undefined,
): V2ActivityListItem["status"] {
  const value = String(processingStatus ?? "").toUpperCase();
  if (value === "READY" || value === "DONE") return "READY";
  if (value === "PARTIAL_FAILED") return "PARTIAL_FAILED";
  if (value === "FAILED") return "FAILED";

  const legacy = String(legacyStatus ?? "").toUpperCase();
  if (legacy === "FINISHED") return "READY";
  if (legacy === "FAILED") return "FAILED";

  if (
    value === "RECEIVED" ||
    value === "NORMALIZED" ||
    value === "DEDUPED" ||
    value === "MATERIALIZED" ||
    value === "PARQUET_READY" ||
    value === "ANALYZING" ||
    value === "PARSING" ||
    value === "CALCULATING"
  ) {
    return "PROCESSING";
  }
  return "UNKNOWN";
}

function mapLinkedPlanWorkout(
  row: any,
): V2ActivityListItem["linkedPlanWorkout"] {
  const linked = row?.linkedPlanWorkout;
  if (!linked || typeof linked !== "object") return null;
  const rawSource = String(linked.source ?? "").toUpperCase();
  const source =
    rawSource === "AUTO" ? "AUTO" : rawSource === "AI" ? "AI" : "MANUAL";
  return {
    planId: String(linked.planId ?? ""),
    workoutId: String(linked.workoutId ?? ""),
    name: typeof linked.name === "string" ? linked.name : null,
    sportType: normalizeSportType(linked.sportType),
    source,
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function mapV2ActivityListItem(row: any): V2ActivityListItem {
  const activitySources = Array.isArray(row?.activitySources)
    ? row.activitySources
    : [];
  const primarySource =
    activitySources.find((source: any) => Boolean(source?.isPrimary)) ??
    activitySources[0];
  const sourceProvider = (source: any): V2ActivitySourceProvider =>
    String(source?.sourceKind ?? "").toUpperCase() === "FILE"
      ? "manual"
      : normalizeProvider(source?.provider);
  const primaryProvider = primarySource
    ? sourceProvider(primarySource)
    : normalizeProvider(row?.thirdPartyProvider);
  const thirdPartyMappings = mapThirdPartyMappings(row);
  const providers = Array.from(
    new Set<V2ActivitySourceProvider>([
      primaryProvider,
      ...activitySources.map(sourceProvider),
      ...thirdPartyMappings.flatMap((mapping) =>
        mapping.provider === "upload" || mapping.provider === "unknown"
          ? []
          : [mapping.provider],
      ),
    ]),
  );
  return {
    id: Number(row?.id ?? 0),
    hashId: String(row?.hashId ?? ""),
    title: String(row?.activityName ?? ""),
    sportType: normalizeSportType(row?.sportType),
    subSportType:
      typeof row?.subSportType === "string"
        ? row.subSportType
        : typeof row?.sportDefinitionCode === "string"
          ? row.sportDefinitionCode
          : null,
    fitSubSport:
      typeof row?.fitSubSport === "number" && Number.isFinite(row.fitSubSport)
        ? row.fitSubSport
        : typeof row?.subSport === "number" && Number.isFinite(row.subSport)
          ? row.subSport
          : null,
    subSport:
      typeof row?.subSport === "number" && Number.isFinite(row.subSport)
        ? row.subSport
        : null,
    startTime: row?.startTime ? String(row.startTime) : null,
    timezone:
      typeof row?.timezone === "string" && row.timezone.trim()
        ? row.timezone.trim()
        : null,
    duration:
      typeof row?.duration === "number"
        ? row.duration
        : typeof row?.elapsedTime === "number"
          ? row.elapsedTime
          : null,
    distance: typeof row?.distance === "number" ? row.distance : null,
    load: finiteNumber(row?.load),
    ascent: finiteNumber(row?.ascent),
    calories: finiteNumber(row?.calories),
    averageSpeed: finiteNumber(row?.averageSpeed),
    avgHeartRate: finiteNumber(row?.avgHeartRate),
    avgPower: finiteNumber(row?.avgPower),
    avgCadence: finiteNumber(row?.avgCadence),
    status: normalizeStatus(row?.processingStatus, row?.status),
    note: typeof row?.description === "string" ? row.description : null,
    providers,
    primaryProvider,
    thirdPartyMappings,
    mapThumbnailUrl:
      typeof row?.mapThumbnailUrl === "string" ? row.mapThumbnailUrl : null,
    mapThumbnailDarkUrl:
      typeof row?.mapThumbnailDarkUrl === "string"
        ? row.mapThumbnailDarkUrl
        : typeof row?.mapThumbnailUrl === "string"
          ? row.mapThumbnailUrl
          : null,
    linkedPlanWorkout: mapLinkedPlanWorkout(row),
    planLinkUiVisible: Boolean(row?.planLinkUiVisible),
    planLinkActiveStartDate:
      row?.planLinkActiveStartDate != null
        ? String(row.planLinkActiveStartDate)
        : null,
    planLinkActiveEndDate:
      row?.planLinkActiveEndDate != null
        ? String(row.planLinkActiveEndDate)
        : null,
  };
}

export function mapV2ExternalActivityMirror(
  row: any,
): V2ExternalActivityMirror | null {
  if (!row || typeof row !== "object" || !row.id) return null;
  const statuses = new Set(["ROUTING", "BLOCKED", "NOT_FOUND"]);
  const actions = new Set(["WAIT", "MANAGE_CONNECTION", "RETRY"]);
  const status = String(row.status ?? "BLOCKED").toUpperCase();
  const action = String(row.action ?? "MANAGE_CONNECTION").toUpperCase();
  return {
    id: String(row.id),
    kind: "external_activity_mirror",
    title: typeof row.title === "string" ? row.title : null,
    startTime: row.startTime ? String(row.startTime) : null,
    discoveredVia: normalizeProvider(row.discoveredVia ?? "intervals_icu"),
    originProvider: normalizeThirdPartyProvider(row.originProvider),
    status: statuses.has(status)
      ? (status as V2ExternalActivityMirror["status"])
      : "BLOCKED",
    reason: row.reason
      ? (String(row.reason) as V2ExternalActivityMirror["reason"])
      : null,
    action: actions.has(action)
      ? (action as V2ExternalActivityMirror["action"])
      : "MANAGE_CONNECTION",
  };
}
