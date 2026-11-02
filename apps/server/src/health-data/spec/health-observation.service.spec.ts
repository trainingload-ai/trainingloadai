import { HealthObservationService } from '../health-observation.service';
import { assertHealthMetricCandidate } from '../health-metric-contract';
function fixture() {
  const rows: any[] = [],
    matches = (row: any, where: any) =>
      [
        'userId',
        'provider',
        'sourceNamespace',
        'kind',
        'sourceGroupKey',
        'sourceObjectId',
      ].every((k) => where[k] === undefined || row[k] === where[k]) &&
      (!where.deletedAt || row.deletedAt === where.deletedAt) &&
      (!where.id?.notIn || !where.id.notIn.includes(row.id));
  const model: any = {
    findFirst: jest.fn(
      async ({ where }: any) =>
        rows
          .filter((row) => matches(row, where))
          .sort((a, b) => b.sourceUpdatedAt - a.sourceUpdatedAt)[0] ?? null,
    ),
    findMany: jest.fn(async ({ where }: any) =>
      rows.filter((row) => matches(row, where) && !row.deletedAt),
    ),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const id = where.userId_provider_sourceNamespace_kind_externalId;
      let row = rows.find((r) => Object.keys(id).every((k) => r[k] === id[k]));
      if (row) Object.assign(row, update);
      else {
        row = { id: 'row-' + rows.length, ...create };
        rows.push(row);
      }
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const row of rows)
        if (
          matches(row, where) &&
          !(where.deletedAt === null && row.deletedAt)
        ) {
          Object.assign(row, data);
          count++;
        }
      return { count };
    }),
  };
  const health: any = {
    samples: () => ({ findMany: async () => [] }),
    observations: () => model,
    snapshots: () => ({ findFirst: async () => ({ id: 'snap' }) }),
    runTransaction: async (fn: any) => fn({}),
  };
  const source = { findFirst: jest.fn(async () => ({ id: 'source' })) },
    imports: any = { sourceObjects: () => source },
    clock: any = { todayYmd: async () => '2026-11-01' };
  const service = new HealthObservationService(health, imports, clock),
    date = new Date('2026-11-01T00:00:00Z');
  const args: any = {
    userId: 'user',
    provider: 'MANUAL',
    sourceNamespace: 'fixture:account',
    kind: 'BLOOD_PRESSURE',
    externalIdPrefix: 'bp:',
    sourceObjectId: 'source',
    sourceUpdatedAt: new Date('2026-11-01T08:00:00Z'),
    candidates: [
      {
        externalId: 'bp:one',
        kind: 'BLOOD_PRESSURE',
        scope: 'MEASUREMENT',
        localDate: date,
        measuredAt: new Date('2026-11-01T07:00:00Z'),
        systolicMmHg: 120,
        diastolicMmHg: 80,
        measurementOrigin: 'DEVICE',
      },
    ],
  };
  return { service, args, rows, model, source, date };
}
describe('complete typed health observations', () => {
  it('keeps a blood-pressure pair together, preserves missing pulse, and applies revisions idempotently', async () => {
    const f = fixture();
    await f.service.replaceSourceObservations(f.args);
    await f.service.replaceSourceObservations(f.args);
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]).toMatchObject({
      systolicMmHg: 120,
      diastolicMmHg: 80,
      pulseBpm: null,
    });
    f.args.candidates[0].diastolicMmHg = 75;
    await f.service.replaceSourceObservations({
      ...f.args,
      sourceUpdatedAt: new Date('2026-11-01T09:00:00Z'),
    });
    expect(f.rows[0].diastolicMmHg).toBe(75);
  });
  it('rejects incomplete tuples and source ownership changes before writing', async () => {
    const f = fixture();
    delete f.args.candidates[0].diastolicMmHg;
    await expect(f.service.replaceSourceObservations(f.args)).rejects.toThrow();
    expect(f.model.upsert).not.toHaveBeenCalled();
    const g = fixture();
    g.source.findFirst.mockResolvedValue(null);
    await expect(g.service.replaceSourceObservations(g.args)).rejects.toThrow(
      'HEALTH_OBSERVATION_SOURCE_OWNER_MISMATCH',
    );
  });
  it('does not restore an older revision or let prefix metacharacters retire another source group', async () => {
    const f = fixture();
    f.args.externalIdPrefix = 'bp_%:';
    f.args.candidates[0].externalId = 'bp_%:one';
    await f.service.replaceSourceObservations(f.args);
    await f.service.replaceSourceObservations({
      ...f.args,
      sourceUpdatedAt: new Date('2026-11-01T07:00:00Z'),
      candidates: [],
    });
    expect(f.rows[0].deletedAt).toBeNull();
    await f.service.replaceSourceObservations({
      ...f.args,
      externalIdPrefix: 'bp_ab:',
      candidates: [],
    });
    expect(f.rows[0].deletedAt).toBeNull();
    await f.service.replaceSourceObservations({ ...f.args, candidates: [] });
    expect(f.rows[0].deletedAt).toBeInstanceOf(Date);
  });
  it('stores date-only classifications without inventing a sleep duration, and preserves variable intervals', async () => {
    const f = fixture(),
      base = {
        ...f.args,
        kind: 'BREATHING_VARIATION',
        externalIdPrefix: 'breath:',
      };
    const summary: any = {
      kind: 'BREATHING_VARIATION',
      scope: 'DAILY',
      externalId: 'breath:summary',
      localDate: f.date,
      categorySystem: 'urn:fixture:frequency:v1',
      categoryCode: 'MINIMAL',
    };
    await f.service.replaceSourceObservations({
      ...base,
      candidates: [
        summary,
        {
          ...summary,
          scope: 'INTERVAL',
          externalId: 'breath:interval',
          intervalStart: new Date('2026-10-31T23:59:00Z'),
          intervalEnd: new Date('2026-11-01T00:02:30Z'),
        },
      ],
    });
    expect(f.rows[0]).toMatchObject({
      measuredAt: null,
      intervalStart: null,
      intervalEnd: null,
    });
    expect(f.rows[1].intervalEnd - f.rows[1].intervalStart).toBe(210000);
  });
  it('selects entire source groups and never combines systolic and diastolic values across providers', async () => {
    const f = fixture();
    await f.service.replaceSourceObservations({
      ...f.args,
      sourcePriority: 50,
    });
    await f.service.replaceSourceObservations({
      ...f.args,
      provider: 'HEALTH_CONNECT',
      sourceNamespace: 'apple:device',
      sourcePriority: 80,
      candidates: [
        { ...f.args.candidates[0], systolicMmHg: 118, diastolicMmHg: 78 },
      ],
    });
    const result = await f.service.overview('user', 7, '2026-11-01');
    expect(result.items.filter((row) => row.selected)).toEqual([
      expect.objectContaining({
        provider: 'HEALTH_CONNECT',
        systolicMmHg: 118,
        diastolicMmHg: 78,
      }),
    ]);
    expect((await f.service.overview('other', 7, '2026-11-01')).items).toEqual(
      [],
    );
    await expect(f.service.overview('user', 7, '2026-02-30')).rejects.toThrow(
      'HEALTH_DATE_INVALID',
    );
  });
  it('distinguishes signed temperature deviation from absolute temperature and dietary intake from burned energy', () => {
    const time = {
      startTime: new Date('2026-11-01T00:00:00Z'),
      endTime: new Date('2026-11-01T01:00:00Z'),
      localDate: new Date('2026-11-01T00:00:00Z'),
    };
    expect(() =>
      assertHealthMetricCandidate({
        ...time,
        metricType: 'SKIN_TEMPERATURE_DELTA_C',
        value: -1.6,
        unit: 'delta_degC',
        aggregation: 'LATEST',
      }),
    ).not.toThrow();
    expect(() =>
      assertHealthMetricCandidate({
        ...time,
        metricType: 'SKIN_TEMPERATURE_DELTA_C',
        value: 36.5,
        unit: 'degC',
        aggregation: 'LATEST',
      }),
    ).toThrow();
    expect(() =>
      assertHealthMetricCandidate({
        ...time,
        metricType: 'DIETARY_ENERGY_KCAL',
        value: 0,
        unit: 'kcal',
        aggregation: 'LATEST',
      }),
    ).not.toThrow();
  });
});
