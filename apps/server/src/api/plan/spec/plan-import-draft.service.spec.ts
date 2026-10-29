import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { generateVdotPlan } from '@shared/vdot-plan';
import { PlanImportDraftService } from '../plan-import-draft.service';
import { PlanImportDraftRepository } from '../persistence/plan-import-draft.repository';

function makeDraft() {
  return generateVdotPlan(
    {
      schemaVersion: 1,
      vdot: 45,
      goalDistance: '10K',
      periodWeeks: 12,
      startDate: '2026-08-03',
      unitSystem: 'METRIC',
      currentWeeklyDistanceKm: 35,
      currentLongestRunKm: 14,
      runsPerWeek: 5,
      longRunDayIndex: 7,
    },
    { locale: 'zh', generatedAt: '2026-07-28T00:00:00.000Z' },
  );
}

describe('PlanImportDraftService', () => {
  type DraftRow = {
    id: string;
    tokenHash?: string;
    payload?: { title?: string };
    expiresAt?: Date;
    consumedAt?: Date | null;
    consumedByUserId?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  };
  type DraftWhere = {
    tokenHash?: string;
    id?: string;
    consumedAt?: Date | null;
    expiresAt?: { gt?: Date };
  };
  let row: DraftRow | null;
  let sequence = 0;
  let delegate: {
    deleteMany: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  let planService: { createPlan: jest.Mock };
  let service: PlanImportDraftService;

  beforeEach(() => {
    row = null;
    sequence = 0;
    delegate = {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        sequence += 1;
        row = {
          id: `draft-${sequence}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          consumedAt: null,
          consumedByUserId: null,
        };
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: DraftWhere }) =>
        row?.tokenHash === where.tokenHash ? row : null,
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: DraftWhere;
          data: Record<string, unknown>;
        }) => {
          if (
            !row ||
            row.id !== where.id ||
            (where.consumedAt === null && row.consumedAt !== null) ||
            (where.expiresAt?.gt &&
              row.expiresAt.getTime() <= where.expiresAt.gt.getTime())
          ) {
            return { count: 0 };
          }
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
    };
    planService = {
      createPlan: jest.fn(async () => ({
        plan: { id: 'plan-1', status: 'DRAFT', sourceType: 'GENERATED' },
      })),
    };
    service = new PlanImportDraftService(
      { planImportDraft: delegate } as never,
      planService as never,
      new PlanImportDraftRepository({ planImportDraft: delegate } as never),
    );
  });

  it('rejects an invalid public payload', async () => {
    await expect(service.create({ schemaVersion: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it('stores a canonical server-regenerated draft and returns a preview', async () => {
    const tampered = { ...makeDraft(), title: 'Tampered browser title' };
    const created = await service.create(tampered);
    const preview = await service.preview(created.token);

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{40,100}$/);
    expect(row.tokenHash).not.toBe(created.token);
    expect(row.payload.title).not.toBe('Tampered browser title');
    expect(preview.summary.vdot).toBe(45);
    expect(preview.summary.workoutCount).toBeGreaterThan(0);
  });

  it('imports a generated plan exactly once', async () => {
    const created = await service.create(makeDraft());
    const result = await service.import('user-1', created.token);

    expect(result.plan).toMatchObject({
      id: 'plan-1',
      status: 'DRAFT',
      sourceType: 'GENERATED',
    });
    expect(planService.createPlan).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        sourceType: 'GENERATED',
        generationMetadata: expect.objectContaining({
          methodologyVersion: 'vdot-plan-v1',
          vdot: 45,
        }),
      }),
    );
    await expect(
      service.import('user-1', created.token),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
