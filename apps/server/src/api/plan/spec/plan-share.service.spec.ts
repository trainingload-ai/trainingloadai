import { GoneException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PlanLoadSource } from '@prisma/client';
import { PlanShareService } from '../plan-share.service';
import { PlanShareRepository } from '../persistence/plan-share.repository';
import { PlanRepository } from '../persistence/plan.repository';

const SOURCE_PLAN = {
  id: 'plan-a',
  userId: 'user-a',
  title: 'Base Build',
  description: null,
  goal: 'Aerobic',
  periodWeeks: 1,
  status: 'DRAFT',
  derivedFromShareId: null,
  derivedFromLineageId: null,
  rootLineageId: null,
  workouts: [
    {
      weekIndex: 1,
      dayIndex: 1,
      sessionIndex: 1,
      sportType: 'RUN',
      name: 'Easy',
      notes: null,
      text: '40min Z2',
      structureKind: 'ENDURANCE',
    },
  ],
};

describe('PlanShareService', () => {
  type IdFilter = string | { in?: string[]; not?: string };
  type ShareWhere = {
    ownerUserId?: string;
    headPlanId?: string;
    status?: string;
    id?: IdFilter;
    publicId?: string;
    catalogSlug?: string;
    visibility?: string;
    origin?: string;
    lineageId?: string;
    userId?: string;
    derivedFromShareId?: string | null;
  };
  type ShareData = Record<string, unknown> & {
    parentLineageId?: string;
    lineageId?: string;
    title?: string;
    description?: string | null;
    goal?: string | null;
    sourceType?: string;
    periodWeeks?: number;
    workouts?: unknown;
  };
  type ShareRow = ShareData & {
    id: string;
    publicId?: string;
    lineageId?: string;
    status?: string;
  };
  type LineageRow = ShareData & {
    id: string;
    ownerUserId?: string;
    headPlanId?: string;
    status?: string;
    publicId?: string;
    catalogSlug?: string;
    visibility?: string;
    origin?: string;
    shares: ShareRow[];
    parentLineage?: LineageRow | null;
  };
  type PlanRow = ShareData & {
    id: string;
    userId: string;
    derivedFromShareId?: string | null;
    derivedFromLineageId?: string | null;
    rootLineageId?: string | null;
    status: string;
  };
  type CreatePlanDto = {
    title?: string;
    description?: string | null;
    goal?: string | null;
    sourceType?: string;
    periodWeeks?: number;
    workouts?: unknown;
  };
  type CreatePlanOptions = {
    lineage?: {
      derivedFromShareId?: string | null;
      derivedFromLineageId?: string | null;
      rootLineageId?: string | null;
    };
  };
  type DefinitionInput = {
    source?: string;
    structure?: unknown;
    text?: string;
    kind?: string;
  };

  function idEquals(filter: IdFilter | undefined, value: string): boolean {
    return typeof filter === 'string' && filter === value;
  }

  function idIsNot(filter: IdFilter | undefined, value: string): boolean {
    return Boolean(
      filter && typeof filter === 'object' && filter.not === value,
    );
  }

  let lineages: LineageRow[];
  let shares: ShareRow[];
  let plans: PlanRow[];
  let service: PlanShareService;
  let planService: {
    getPlanDetail: jest.Mock;
    createPlan: jest.Mock;
  };

  function makeTx() {
    return {
      planShareLineage: {
        findFirst: async ({ where }: { where: ShareWhere }) =>
          lineages.find(
            (row) =>
              row.ownerUserId === where.ownerUserId &&
              row.headPlanId === where.headPlanId &&
              (where.status ? row.status === where.status : true),
          ) ?? null,
        findUnique: async ({ where }: { where: ShareWhere }) =>
          lineages.find((row) => {
            if (where.id) return idEquals(where.id, row.id);
            if (where.publicId) return row.publicId === where.publicId;
            if (where.catalogSlug) return row.catalogSlug === where.catalogSlug;
            return false;
          }) ?? null,
        findMany: async ({ where }: { where?: ShareWhere }) =>
          lineages.filter((row) => {
            if (where?.ownerUserId && row.ownerUserId !== where.ownerUserId) {
              return false;
            }
            if (where?.visibility && row.visibility !== where.visibility) {
              return false;
            }
            if (where?.origin && row.origin !== where.origin) {
              return false;
            }
            if (where?.status && row.status !== where.status) {
              return false;
            }
            return true;
          }),
        create: async ({ data }: { data: ShareData }) => {
          const row: LineageRow = {
            id: `lin-${lineages.length + 1}`,
            shares: [],
            parentLineage: data.parentLineageId
              ? lineages.find((item) => item.id === data.parentLineageId)
              : null,
            ...data,
          };
          lineages.push(row);
          return row;
        },
        update: async ({
          where,
          data,
        }: {
          where: ShareWhere;
          data: ShareData;
        }) => {
          const row = lineages.find(
            (item) =>
              idEquals(where.id, item.id) || item.publicId === where.publicId,
          );
          Object.assign(row, data);
          return row;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: ShareWhere;
          data: ShareData;
        }) => {
          let count = 0;
          for (const row of lineages) {
            if (
              typeof where.id === 'object' &&
              where.id.in &&
              !where.id.in.includes(row.id)
            ) {
              continue;
            }
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      },
      planShare: {
        findUnique: async ({ where }: { where: ShareWhere }) => {
          const row = shares.find((item) => {
            if (where.id) return idEquals(where.id, item.id);
            if (where.publicId) return item.publicId === where.publicId;
            return false;
          });
          if (!row) return null;
          return {
            ...row,
            lineage: lineages.find((item) => item.id === row.lineageId),
          };
        },
        findFirst: async ({ where }: { where: ShareWhere }) =>
          shares.find((row) => {
            if (where.lineageId && row.lineageId !== where.lineageId) return false;
            if (where.status && row.status !== where.status) return false;
            if (idIsNot(where.id, row.id)) return false;
            return true;
          }) ?? null,
        findMany: async () => shares,
        create: async ({ data }: { data: ShareData }) => {
          const row: ShareRow = {
            id: `share-${shares.length + 1}`,
            ...data,
          };
          shares.push(row);
          const lineage = lineages.find((item) => item.id === data.lineageId);
          lineage?.shares.unshift(row);
          return row;
        },
        update: async ({
          where,
          data,
        }: {
          where: ShareWhere;
          data: ShareData;
        }) => {
          const row = shares.find((item) => idEquals(where.id, item.id));
          Object.assign(row, data);
          return row;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: ShareWhere;
          data: ShareData;
        }) => {
          let count = 0;
          for (const row of shares) {
            if (where.lineageId && row.lineageId !== where.lineageId) continue;
            if (where.status && row.status !== where.status) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      },
      plan: {
        findMany: async ({ where }: { where: ShareWhere }) =>
          plans.filter(
            (row) =>
              row.userId === where.userId &&
              row.derivedFromShareId === where.derivedFromShareId,
          ),
      },
    };
  }

  beforeEach(() => {
    lineages = [];
    shares = [];
    plans = [];
    const tx = makeTx();
    planService = {
      getPlanDetail: jest.fn(async () => ({ plan: SOURCE_PLAN })),
      createPlan: jest.fn(
        async (
          _userId: string,
          dto: CreatePlanDto,
          options?: CreatePlanOptions,
        ) => {
          const plan: PlanRow = {
            id: `plan-${plans.length + 1}`,
            userId: _userId,
            title: dto.title,
            description: dto.description ?? null,
            goal: dto.goal ?? null,
            sourceType: dto.sourceType,
            status: 'DRAFT',
            periodWeeks: dto.periodWeeks,
            derivedFromShareId: options?.lineage?.derivedFromShareId ?? null,
            derivedFromLineageId: options?.lineage?.derivedFromLineageId ?? null,
            rootLineageId: options?.lineage?.rootLineageId ?? null,
            workouts: dto.workouts,
          };
          plans.push(plan);
          return { plan };
        },
      ),
    };
    const prisma = {
      $transaction: async (fn: (txArg: typeof tx) => unknown) => fn(tx),
      planShareLineage: tx.planShareLineage,
      planShare: tx.planShare,
      plan: tx.plan,
    };
    service = new PlanShareService(
      prisma as never,
      planService as never,
      {
        resolve: jest.fn((input: DefinitionInput) => {
          if (input?.source === 'STRUCTURE') {
            return { structure: input.structure, text: '' };
          }
          return {
            text: input?.text ?? '40min Z2',
            structure: {
              kind: input?.kind ?? 'ENDURANCE',
              version: 1,
              blocks: [
                {
                  type: 'work',
                  steps: [{ duration: 2400, stepKind: 'WORK' }],
                },
              ],
            },
          };
        }),
      } as never,
      {
        estimateForViewerWorkouts: jest.fn(
          async (_userId: string, workouts: unknown[]) =>
            workouts.map(() => ({
              estimatedLoad: 41,
              estimatedLoadSource: 'HR',
            })),
        ),
      } as never,
      new PlanShareRepository(prisma as never),
      new PlanRepository(prisma as never),
    );
  });

  it('creates a lineage and returns the same head when the payload hash is unchanged', async () => {
    const first = await service.createFromPlan('user-a', 'plan-a');
    expect(first.reused).toBe(false);
    expect(first.share.version).toBe(1);
    expect(first.lineage.visibility).toBe('UNLISTED');

    const second = await service.createFromPlan('user-a', 'plan-a');
    expect(second.reused).toBe(true);
    expect(second.share.publicId).toBe(first.share.publicId);
    expect(shares).toHaveLength(1);
  });

  it('imports a fork as DRAFT and can share it as a new lineage', async () => {
    const created = await service.createFromPlan('user-a', 'plan-a');
    const imported = await service.importForUser(
      'user-b',
      created.share.publicId,
      { share: true },
    );
    expect(imported.plan.sourceType).toBe('IMPORTED');
    expect(imported.plan.status).toBe('DRAFT');
    expect(imported.plan.derivedFromShareId).toBe(shares[0].id);
    expect(imported.share?.lineage.publicId).not.toBe(created.lineage.publicId);
    expect(lineages).toHaveLength(2);
    expect(lineages[1].parentLineageId).toBe(lineages[0].id);
  });

  it('returns 410 after a version is revoked', async () => {
    const created = await service.createFromPlan('user-a', 'plan-a');
    await service.revokeShare('user-a', created.share.publicId);
    await expect(
      service.getPublicSharePreview(created.share.publicId),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('keeps catalog empty for UNLISTED user shares', async () => {
    await service.createFromPlan('user-a', 'plan-a');
    const catalog = await service.listCatalog();
    expect(catalog.items).toEqual([]);
  });

  it('hydrates endurance charts from TEXT definitions in the public preview', async () => {
    const created = await service.createFromPlan('user-a', 'plan-a');
    const preview = await service.getPublicSharePreview(created.share.publicId);
    expect(JSON.stringify(preview)).not.toContain('40min Z2');
    expect(preview.workouts[0].structure).toMatchObject({
      kind: 'ENDURANCE',
      blocks: [{ type: 'work', steps: [{ duration: 2400, stepKind: 'WORK' }] }],
    });
    expect(preview.workouts[0].durationSeconds).toBe(2400);
    expect(preview.workouts[0].previewLoad).toBe(32.7);
    expect(JSON.stringify(preview)).not.toContain('estimatedLoad');
  });

  it('personalizes preview load with the viewer thresholds', async () => {
    const created = await service.createFromPlan('user-a', 'plan-a');
    const preview = await service.getViewerSharePreview(
      'user-b',
      created.share.publicId,
    );
    expect(preview.loadPersonalized).toBe(true);
    expect(preview.workouts[0].estimatedLoad).toBe(41);
    expect(preview.workouts[0].previewLoad).toBe(41);
    expect(JSON.stringify(preview)).not.toContain('40min Z2');
    expect(service['loadEstimator'].estimateForViewerWorkouts).toHaveBeenCalledWith(
      'user-b',
      [
        expect.objectContaining({
          sportType: 'RUN',
          structureKind: 'ENDURANCE',
          text: '40min Z2',
        }),
      ],
    );
  });

  it('resolves viewer preview by lineage publicId', async () => {
    const created = await service.createFromPlan('user-a', 'plan-a');
    const preview = await service.getViewerSharePreview(
      'user-b',
      created.lineage.publicId,
    );
    expect(preview.publicId).toBe(created.share.publicId);
    expect(preview.lineagePublicId).toBe(created.lineage.publicId);
    expect(preview.loadPersonalized).toBe(true);
  });

  it('falls back to generic previewLoad when viewer estimate is empty', async () => {
    const created = await service.createFromPlan('user-a', 'plan-a');
    jest
      .spyOn(service['loadEstimator'], 'estimateForViewerWorkouts')
      .mockResolvedValue([
        {
          estimatedLoad: null,
          estimatedLoadSource: PlanLoadSource.NONE,
        },
      ]);
    const preview = await service.getViewerSharePreview(
      'user-b',
      created.share.publicId,
    );
    expect(preview.workouts[0].estimatedLoad).toBeNull();
    expect(preview.workouts[0].previewLoad).toBe(32.7);
  });

  it('does not attach estimatedLoad on the public preview', async () => {
    const created = await service.createFromPlan('user-a', 'plan-a');
    const preview = await service.getPublicSharePreview(created.share.publicId);
    expect(preview).not.toHaveProperty('loadPersonalized');
    expect(preview.workouts[0]).not.toHaveProperty('estimatedLoad');
    expect(preview.workouts[0].previewLoad).toBe(32.7);
  });

  it('returns 404 for an invalid public id', async () => {
    await expect(service.getPublicSharePreview('bad')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.getViewerSharePreview('user-b', 'not-a-share-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not auto-share an unshared draft', async () => {
    await expect(
      service.maybeSnapshotDraftPlan('user-a', 'plan-a'),
    ).resolves.toBeNull();
    expect(shares).toHaveLength(0);
  });

  it('creates a new share version when a shared draft changes', async () => {
    const created = await service.createFromPlan('user-a', 'plan-a');
    expect(created.share.version).toBe(1);
    const originalText = SOURCE_PLAN.workouts[0].text;
    SOURCE_PLAN.workouts[0].text = '50min Z2';
    try {
      const bumped = await service.maybeSnapshotDraftPlan('user-a', 'plan-a');
      expect(bumped?.reused).toBe(false);
      expect(bumped?.share.version).toBe(2);
      expect(shares).toHaveLength(2);
    } finally {
      SOURCE_PLAN.workouts[0].text = originalText;
    }
  });
});
