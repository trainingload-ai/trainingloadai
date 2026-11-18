import { AthleteStateFitnessFacts } from '../athlete-state-fitness-facts.service';

const at = new Date('2026-11-13T01:00:00.000Z');
function metric(overrides: Record<string, unknown> = {}) {
  return {
    type: 'FTP',
    sport: 'CYCLING',
    source: 'MANUAL',
    value: 250,
    recordedAt: new Date('2026-11-12T01:00:00.000Z'),
    originProvider: null,
    ...overrides,
  };
}
function fixture() {
  const findMany = jest.fn();
  const prisma = { userFitnessMetric: { findMany } };
  const updates = { requestUpdate: jest.fn(async () => undefined) };
  const service = new AthleteStateFitnessFacts(
    prisma as never,
    updates as never,
  );
  return { service, prisma, findMany, updates };
}

describe('effective Athlete State fitness facts', () => {
  it('limits the query to effective formal metrics and preserves sport, source and effective time', async () => {
    const f = fixture();
    f.findMany.mockResolvedValue([
      metric({ source: 'AUTO', value: 240 }),
      metric(),
      metric({ type: 'VO2_MAX', sport: 'RUNNING', value: 52 }),
    ]);
    const facts = await f.service.read('athlete', at);
    expect(f.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'athlete',
          type: { in: ['FTP', 'VO2_MAX'] },
          source: { in: ['MANUAL', 'AUTO'] },
          recordedAt: { lte: at },
        },
      }),
    );
    expect(facts).toEqual([
      expect.objectContaining({
        type: 'FTP',
        sport: 'CYCLING',
        value: 250,
        unit: 'W',
        source: 'MANUAL',
        effectiveAt: '2026-11-12T01:00:00.000Z',
      }),
      expect.objectContaining({
        type: 'VO2_MAX',
        sport: 'RUNNING',
        value: 52,
        unit: 'ml/kg/min',
      }),
    ]);
  });

  it('does not request an assessment for a timestamp-only revision of the adopted value', async () => {
    const f = fixture();
    f.findMany
      .mockResolvedValueOnce([metric()])
      .mockResolvedValueOnce([metric({ recordedAt: at })]);
    await f.service.observe(
      'athlete',
      f.prisma as never,
      async () => 'written',
    );
    expect(f.updates.requestUpdate).not.toHaveBeenCalled();
  });

  it('persists an effective value change using the fact writer transaction', async () => {
    const f = fixture();
    f.findMany
      .mockResolvedValueOnce([metric()])
      .mockResolvedValueOnce([metric({ value: 260 })]);
    await expect(
      f.service.observe('athlete', f.prisma as never, async () => 'written'),
    ).resolves.toBe('written');
    expect(f.updates.requestUpdate).toHaveBeenCalledWith(
      { userId: 'athlete', triggerType: 'FITNESS_FACT_CHANGED' },
      f.prisma,
    );
  });

  it('does not persist a request when the fact write fails', async () => {
    const f = fixture();
    f.findMany.mockResolvedValue([metric()]);
    await expect(
      f.service.observe('athlete', f.prisma as never, async () => {
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');
    expect(f.updates.requestUpdate).not.toHaveBeenCalled();
    expect(f.findMany).toHaveBeenCalledTimes(1);
  });
});
