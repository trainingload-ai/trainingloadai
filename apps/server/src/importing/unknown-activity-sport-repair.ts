import type { Prisma, SportType } from '@prisma/client';

type Sport = { code: string; family: string; active: boolean };
type Mapping = {
  provider: string;
  externalCode: string;
  externalSubCode: string;
  sportCode: string;
  priority: number;
  active: boolean;
  direction: string;
};
type Classification = {
  sportType: SportType | null;
  sportDefinitionCode: string | null;
};
export type UnknownSportEvidence = {
  activityId: number;
  sourceId: string | null;
  canonicalSnapshotId: string | null;
  current: Classification;
  provider: string | null;
  canonicalSport: string | null;
  metadata: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
};
export type UnknownSportFinding = {
  activityId: number;
  sourceId: string | null;
  canonicalSnapshotId: string | null;
  before: Classification;
  after: Classification | null;
  status: 'REPAIR' | 'PRESERVE' | 'UNRESOLVED';
  reason: string;
  evidence: string[];
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const fold = (value: unknown) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Only explicit source enums and the existing catalog are evidence, never names or sensor values. */
export function resolveUnknownActivitySport(
  input: UnknownSportEvidence,
  sports: readonly Sport[],
  mappings: readonly Mapping[],
): UnknownSportFinding {
  const finding: UnknownSportFinding = {
    activityId: input.activityId,
    sourceId: input.sourceId,
    canonicalSnapshotId: input.canonicalSnapshotId,
    before: input.current,
    after: null,
    status: 'UNRESOLVED',
    reason: 'SOURCE_SPORT_UNAVAILABLE',
    evidence: [],
  };
  if (!input.sourceId || !input.canonicalSnapshotId)
    return { ...finding, reason: 'PRIMARY_CANONICAL_MISSING' };
  if (
    input.current.sportType &&
    input.canonicalSport &&
    input.canonicalSport !== input.current.sportType
  ) {
    return {
      ...finding,
      status: 'PRESERVE',
      reason: 'USER_CLASSIFICATION_OVERRIDE',
    };
  }
  const byCode = new Map(
    sports.filter((s) => s.active).map((s) => [s.code, s]),
  );
  const current = byCode.get(input.current.sportDefinitionCode ?? '');
  const resolved = (sport: Sport, evidence: string[]): UnknownSportFinding => {
    const after = {
      sportType: sport.family as SportType,
      sportDefinitionCode: sport.code,
    };
    return {
      ...finding,
      after,
      evidence,
      status:
        after.sportType === input.current.sportType &&
        after.sportDefinitionCode === input.current.sportDefinitionCode
          ? 'PRESERVE'
          : 'REPAIR',
      reason:
        after.sportType === input.current.sportType &&
        after.sportDefinitionCode === input.current.sportDefinitionCode
          ? 'KNOWN_SPORT_CLASSIFICATION'
          : 'EXPLICIT_SOURCE_SPORT_RECOVERED',
    };
  };
  // Preserve an athlete's selected subtype, and repair only its inconsistent family.
  if (current && current.code !== 'OTHER')
    return resolved(current, ['CURRENT_SPORT_DEFINITION:' + current.code]);

  const active = mappings.filter(
    (m) =>
      m.active &&
      ['IMPORT', 'BOTH'].includes(m.direction) &&
      byCode.has(m.sportCode) &&
      m.sportCode !== 'OTHER',
  );
  function lookup(
    provider: string,
    code: unknown,
    sub?: unknown,
  ): Sport | 'AMBIGUOUS' | null {
    if (!fold(code)) return null;
    const found = active.filter(
      (m) =>
        m.provider === provider &&
        fold(m.externalCode) === fold(code) &&
        fold(m.externalSubCode) === fold(sub),
    );
    if (!found.length) return null;
    const priority = Math.max(...found.map((m) => m.priority));
    const targets = [
      ...new Set(
        found.filter((m) => m.priority === priority).map((m) => m.sportCode),
      ),
    ];
    return targets.length === 1 ? byCode.get(targets[0])! : 'AMBIGUOUS';
  }
  const raw = input.rawPayload,
    meta = input.metadata;
  const original = object(raw.original),
    list = object(raw.listActivity);
  const providerCodes = [
    original.sport_type,
    original.type,
    list.sport_type,
    list.type,
    meta.providerSportType,
    meta.activityType,
    meta.type,
  ];
  let providerSport: Sport | null = null;
  let providerEvidence: string | null = null;
  for (const code of providerCodes) {
    const sport = input.provider ? lookup(input.provider, code) : null;
    if (sport === 'AMBIGUOUS')
      return {
        ...finding,
        reason: 'AMBIGUOUS_SPORT_MAPPING',
        evidence: [String(code)],
      };
    if (sport) {
      providerSport = sport;
      providerEvidence = String(code);
      break;
    }
  }
  const parent = meta.trackswapSport;
  const numericSub = Number(meta.trackswapSubSport);
  const sub =
    meta.trackswapSubSportRaw ??
    (
      { 19: 'flexibility_training', 20: 'strength_training' } as Record<
        number,
        string
      >
    )[numericSub] ??
    meta.trackswapSubSport;
  const parentVariants =
    fold(parent) === 'BIKING' ? [parent, 'CYCLING', 'BIKE'] : [parent];
  let fileSport: Sport | null = null;
  for (const code of parentVariants) {
    const sport = lookup('upload', code, sub) ?? lookup('upload', code);
    if (sport === 'AMBIGUOUS')
      return {
        ...finding,
        reason: 'AMBIGUOUS_SPORT_MAPPING',
        evidence: [String(parent), String(sub)],
      };
    if (sport) {
      fileSport = sport;
      break;
    }
  }
  const genericParent =
    !fold(parent) ||
    [
      'UNKNOWN',
      'TRAINING',
      'FITNESSEQUIPMENT',
      'GENERIC',
      'MULTISPORT',
      'OTHER',
    ].includes(fold(parent));
  // A generic container can carry a precise supported subtype. A specific
  // unsupported parent (for example martial arts) must never become stretching.
  if (!fileSport && genericParent && fold(sub)) {
    const sport = lookup('upload', sub);
    if (sport === 'AMBIGUOUS')
      return { ...finding, reason: 'AMBIGUOUS_SPORT_MAPPING' };
    fileSport = sport;
  }
  const sourceEvidence = [
    ...(providerEvidence ? ['PROVIDER_ENUM:' + providerEvidence] : []),
    ...(parent != null ? ['FILE_SPORT_ENUM:' + String(parent)] : []),
    ...(sub != null ? ['FILE_SUB_SPORT_ENUM:' + String(sub)] : []),
  ];
  if (
    providerSport &&
    ((fileSport && fileSport.code !== providerSport.code) ||
      (!fileSport && !genericParent))
  ) {
    return {
      ...finding,
      reason: 'SOURCE_SPORT_CONFLICT',
      evidence: sourceEvidence,
    };
  }
  if (providerSport || fileSport)
    return resolved((providerSport ?? fileSport)!, sourceEvidence);
  const evidence = [...providerCodes, parent, sub]
    .filter((v) => v != null && String(v).trim())
    .map(String);
  return {
    ...finding,
    evidence,
    reason: evidence.some(
      (v) =>
        ![
          'UNKNOWN',
          'GENERIC',
          'OTHER',
          'TRAINING',
          'FITNESSEQUIPMENT',
          'WORKOUT',
          'ACTIVITY',
          'NAVIGATE',
          'ADVENTURERACE',
          'CARDIOTRAINING',
        ].includes(fold(v)),
    )
      ? 'SPORT_MAPPING_NOT_SUPPORTED'
      : 'SOURCE_ONLY_GENERIC_SPORT',
  };
}

export async function scanUnknownActivitySports(
  tx: Prisma.TransactionClient,
  userId?: string,
) {
  const [sports, mappings, activities] = await Promise.all([
    tx.sportDefinition.findMany({
      select: { code: true, family: true, active: true },
    }),
    tx.providerSportMapping.findMany({
      where: { active: true, direction: { in: ['IMPORT', 'BOTH'] } },
    }),
    tx.$queryRaw<
      Array<{
        id: number;
        userId: string;
        sportType: SportType | null;
        sportDefinitionCode: string | null;
        sourceId: string | null;
        canonicalSnapshotId: string | null;
        provider: string | null;
        canonicalSport: string | null;
        metadata: unknown;
        rawPayload: unknown;
      }>
    >`
      SELECT a.id, a.user_id AS "userId", a.sport_type::text AS "sportType",
        a.sport_definition_code AS "sportDefinitionCode", s.id AS "sourceId",
        s.canonical_snapshot_id AS "canonicalSnapshotId", s.provider::text AS provider,
        c.payload->'summary'->>'sportType' AS "canonicalSport",
        c.payload->'metadata' AS metadata,
        jsonb_build_object(
          'original', jsonb_build_object('sport_type', o.raw_payload#>'{original,sport_type}', 'type', o.raw_payload#>'{original,type}'),
          'listActivity', jsonb_build_object('sport_type', o.raw_payload#>'{listActivity,sport_type}', 'type', o.raw_payload#>'{listActivity,type}')
        ) AS "rawPayload"
      FROM t_activity a
      LEFT JOIN t_activity_source s ON s.activity_id=a.id AND s.user_id=a.user_id AND s.is_active AND s.is_primary
      LEFT JOIN t_canonical_activity_snapshot c ON c.id=s.canonical_snapshot_id AND c.user_id=a.user_id
      LEFT JOIN t_import_source_object o ON o.id=s.source_object_id AND o.user_id=a.user_id
      WHERE a.state=1 AND (a.sport_type='UNKNOWN' OR a.sport_type IS NULL)
        AND (${userId ?? null}::text IS NULL OR a.user_id=${userId ?? null})
      ORDER BY a.id
    `,
  ]);
  return activities.map((a) => {
    return {
      ...resolveUnknownActivitySport(
        {
          activityId: a.id,
          sourceId: a.sourceId,
          canonicalSnapshotId: a.canonicalSnapshotId,
          current: a,
          canonicalSport: a.canonicalSport,
          provider: a.provider,
          metadata: object(a.metadata),
          rawPayload: object(a.rawPayload),
        },
        sports,
        mappings,
      ),
      userId: a.userId,
    };
  });
}

/** Called only inside the migration's user-locked transaction; immutable audit stays in its manifest. */
export async function applyUnknownActivitySportRepairs(
  tx: Prisma.TransactionClient,
  userId: string,
  migrationId: string,
) {
  const migration = await tx.activityDataMigration.findFirst({
    where: { id: migrationId, userId, status: 'MIGRATING' },
    select: { id: true },
  });
  if (!migration) throw new Error('ACTIVITY_SPORT_REPAIR_MIGRATION_FENCED');
  const findings = await scanUnknownActivitySports(tx, userId);
  for (const finding of findings.filter((f) => f.status === 'REPAIR')) {
    const updated = await tx.activity.updateMany({
      where: {
        id: finding.activityId,
        userId,
        state: 1,
        sportType: finding.before.sportType,
        sportDefinitionCode: finding.before.sportDefinitionCode,
        activitySources: {
          some: {
            id: finding.sourceId!,
            canonicalSnapshotId: finding.canonicalSnapshotId,
            isActive: true,
            isPrimary: true,
          },
        },
      },
      data: {
        ...finding.after!,
        processingStatus: 'ANALYZING',
        readyAt: null,
        processingUpdatedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error('ACTIVITY_SPORT_REPAIR_CONFLICT');
  }
  return {
    schemaVersion: 1,
    findings,
    repaired: findings.filter((f) => f.status === 'REPAIR').length,
    unresolved: findings.filter((f) => f.status === 'UNRESOLVED').length,
  };
}
