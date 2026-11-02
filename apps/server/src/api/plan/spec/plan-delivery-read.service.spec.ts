import { PlanDeliveryReadService } from '../application/plan-delivery-read.service';

function fixture() {
  const row: any = {
    id: 'workout',
    userId: 'owner',
    revision: 2,
    status: 'PLANNED',
    name: 'Intervals',
    notes: '',
    sportType: 'RUN',
    sportDefinitionCode: 'RUN',
    scheduledDate: new Date('2026-11-10T00:00:00Z'),
    structureKind: 'ENDURANCE',
    steps: [],
  };
  const repository = { findFirst: jest.fn(async () => row) };
  let target = 140;
  const endurance = {
    buildPlanBlocksFromWorkoutSteps: jest.fn(
      (_rows: unknown, _sport: unknown) => [
        {
          type: 'work',
          steps: [
            {
              duration: 10,
              primaryTargetMeta: {
                kind: 'HEART_RATE_CUSTOM',
                value: target,
                unit: 'BPM',
              },
            },
          ],
        },
      ],
    ),
  };
  const service = new PlanDeliveryReadService(
    repository as any,
    { resolveWorkout: jest.fn(async (_user: any, value: any) => value) } as any,
    endurance as any,
    {
      buildStrengthStructure: () => ({
        kind: 'STRENGTH',
        version: 1,
        exercises: [],
      }),
    } as any,
    {
      resolve: ({ structure }: any) => ({
        structure,
        text: `10s hr ${structure.kind === 'ENDURANCE' ? structure.blocks[0].steps[0].primaryTargetMeta.value : 'open'}bpm`,
      }),
    } as any,
  );
  return {
    row,
    endurance,
    repository,
    service,
    setTarget: (value: number) => (target = value),
  };
}
describe('provider-neutral reviewed plan snapshot', () => {
  it('reads only the owner workout outside draft plans', async () => {
    const f = fixture();
    await f.service.snapshot('owner', 'workout');
    expect(f.repository.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'workout',
          userId: 'owner',
          OR: [{ plan: null }, { plan: { status: { not: 'DRAFT' } } }],
        },
      }),
    );
  });
  it('returns null for missing or unauthorized resources', async () => {
    const f = fixture();
    f.repository.findFirst.mockResolvedValue(null);
    expect(await f.service.snapshot('other', 'workout')).toBeNull();
  });
  it('retains all stored leaf steps and refuses unrepresentable nested repeats', async () => {
    const f = fixture();
    f.row.steps = [
      { id: 'r', parentId: null, stepType: 'REPEAT' },
      { id: 'a', parentId: 'r', stepType: 'WORK' },
      { id: 'b', parentId: 'r', stepType: 'REST' },
    ];
    await f.service.snapshot('owner', 'workout');
    expect(
      f.endurance.buildPlanBlocksFromWorkoutSteps.mock.calls[0][0],
    ).toMatchObject([{ id: 'r', children: [{ id: 'a' }, { id: 'b' }] }]);
    f.row.steps[1].stepType = 'REPEAT';
    await expect(f.service.snapshot('owner', 'workout')).rejects.toThrow(
      'WORKOUT_DELIVERY_NESTED_REPEAT_UNSUPPORTED',
    );
  });
  it('binds the exact IR, local revision and date to the checksum', async () => {
    const f = fixture();
    const initial = await f.service.snapshot('owner', 'workout');
    expect(initial?.text).toBe('10s hr 140bpm');
    expect((await f.service.snapshot('owner', 'workout'))?.checksum).toBe(
      initial?.checksum,
    );
    f.setTarget(155);
    expect((await f.service.snapshot('owner', 'workout'))?.checksum).not.toBe(
      initial?.checksum,
    );
    f.setTarget(140);
    f.row.revision = 3;
    expect((await f.service.snapshot('owner', 'workout'))?.checksum).not.toBe(
      initial?.checksum,
    );
    f.row.revision = 2;
    f.row.scheduledDate = new Date('2026-11-11T00:00:00Z');
    expect((await f.service.snapshot('owner', 'workout'))?.checksum).not.toBe(
      initial?.checksum,
    );
  });
});
