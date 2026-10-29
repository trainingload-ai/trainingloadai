import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Logger } from '@nestjs/common';
import { WorkoutService, type PlanBlock } from '../workout.service';

const fitMessages: Record<string, unknown>[] = [];

jest.mock('@garmin/fitsdk', () => {
  return {
    Encoder: jest.fn().mockImplementation(() => ({
      writeMesg: jest.fn((message: Record<string, unknown>) => {
        fitMessages.push(message);
      }),
      finish: jest.fn(() => ({ bytes: new Uint8Array([1, 2, 3]) })),
    })),
    Profile: {
      MesgNum: {
        FILE_ID: 0,
        WORKOUT: 26,
        WORKOUT_STEP: 27,
      },
    },
  };
});

const createService = () =>
  new WorkoutService({
    t: jest.fn((key: string) => key),
  } as never);

describe('WorkoutService workout step generation', () => {
  beforeEach(() => {
    fitMessages.length = 0;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes the exact FIT sub sport on the workout message', async () => {
    const service = createService();
    await service.buildFITFromPlan(service.parsePlanText('work 30min'), {
      sport: 'running',
      subSport: 'trail',
    });

    expect(fitMessages.find((message) => message.mesgNum === 26)).toMatchObject(
      {
        sport: 'running',
        subSport: 'trail',
      },
    );
  });

  it.each([
    ['work 25min', 'TIME', 1500, 'SECONDS'],
    ['work 45s', 'TIME', 45, 'SECONDS'],
    ['work 1m30s', 'TIME', 90, 'SECONDS'],
    ['work 2m30s', 'TIME', 150, 'SECONDS'],
    ['work 1h30m', 'TIME', 5400, 'SECONDS'],
    ['work 1h', 'TIME', 3600, 'SECONDS'],
    ['work 5km', 'DISTANCE', 5000, 'METERS'],
    ['work open', 'OPEN', null, null],
    ['work hr<150bpm', 'HR_LESS_THAN', 150, 'BPM'],
    ['work power>250W', 'POWER_GREATER_THAN', 250, 'WATTS'],
    ['work cadence<80rpm', 'CADENCE_LESS_THAN', 80, 'RPM'],
  ])(
    'parses duration form %s into canonical draft fields',
    (text, durationType, durationValue, durationUnit) => {
      const service = createService();

      const [draft] = service.buildWorkoutPlanSteps(
        service.parsePlanText(text),
      );

      expect(draft).toMatchObject({
        durationType,
        durationValue,
        durationUnit,
      });
    },
  );

  it.each([
    ['30m', 'REPEAT_UNTIL_TIME', 1800, 'SECONDS'],
    ['5km', 'REPEAT_UNTIL_DISTANCE', 5000, 'METERS'],
    ['500kj', 'REPEAT_UNTIL_CALORIES', 500, 'CALORIES'],
    ['hr<140bpm', 'REPEAT_UNTIL_HR_LESS_THAN', 140, 'BPM'],
    ['power>250W', 'REPEAT_UNTIL_POWER_GREATER_THAN', 250, 'WATTS'],
    ['cadence<80rpm', 'REPEAT_UNTIL_CADENCE_LESS_THAN', 80, 'RPM'],
  ])(
    'round-trips repeat until %s through canonical draft fields',
    (condition, durationType, durationValue, durationUnit) => {
      const service = createService();
      const text = `repeat until ${condition} {\n  work 30s\n  recovery 30s\n}`;
      const blocks = service.parsePlanText(text);
      const [draft] = service.buildWorkoutPlanSteps(blocks);

      expect(draft).toMatchObject({
        stepType: 'REPEAT',
        durationType,
        durationValue,
        durationUnit,
      });
      expect(service.stringifyPlan(blocks)).toBe(text);
    },
  );

  it('rejects nested repeat blocks explicitly', () => {
    const service = createService();
    expect(() =>
      service.parsePlanText('repeat 2 {\n  repeat 3 {\n    work 30s\n  }\n}'),
    ).toThrow(/nested repeat/i);
  });

  it('does not silently downgrade repeat-until when exporting FIT', async () => {
    const service = createService();
    const blocks = service.parsePlanText(
      'repeat until 30m {\n  work 30s\n  recovery 30s\n}',
    );

    await expect(service.buildFITFromPlan(blocks)).rejects.toThrow(
      /does not support repeat until/i,
    );
  });

  it('parses fixed time plus HR ceiling as a target, not a duration threshold', () => {
    const service = createService();

    const blocks = service.parsePlanText('work 25m hr <150bpm');
    const drafts = service.buildWorkoutPlanSteps(blocks);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      stepType: 'WORK',
      durationType: 'TIME',
      durationValue: 1500,
      durationUnit: 'SECONDS',
      targetType: 'HEART_RATE',
      targetValueLow: null,
      targetValueHigh: 150,
      targetUnit: 'BPM',
    });
  });

  it.each([
    [
      'work 25m hr 140-150bpm',
      {
        targetType: 'HEART_RATE',
        targetValueLow: 140,
        targetValueHigh: 150,
        targetUnit: 'BPM',
      },
    ],
    [
      'work 25m power >220W',
      {
        targetType: 'POWER',
        targetValueLow: 220,
        targetValueHigh: null,
        targetUnit: 'WATTS',
      },
    ],
    [
      'work 25m power <250W',
      {
        targetType: 'POWER',
        targetValueLow: null,
        targetValueHigh: 250,
        targetUnit: 'WATTS',
      },
    ],
    [
      'work 25m cadence 85-95rpm',
      {
        targetType: 'CADENCE',
        targetValueLow: 85,
        targetValueHigh: 95,
        targetUnit: 'RPM',
      },
    ],
    [
      'work 25m pace 4:30-4:45',
      {
        targetType: 'SPEED',
        targetValueLow: 270,
        targetValueHigh: 285,
        targetUnit: 'SECONDS',
      },
    ],
  ])('parses single target form %s', (text, expected) => {
    const service = createService();

    const [draft] = service.buildWorkoutPlanSteps(service.parsePlanText(text));

    expect(draft).toMatchObject({
      durationType: 'TIME',
      ...expected,
    });
  });

  it.each([
    'work 25m power >250W cadence 90rpm',
    'work 25m hr <150bpm power 220W',
  ])('rejects multiple machine targets on one step: %s', (text) => {
    const service = createService();

    expect(() => service.parsePlanText(text)).toThrow(/only one target/i);
  });

  it.each(['work power>250W cadence 90rpm', 'work hr<150bpm power 220W'])(
    'rejects target on duration-threshold step: %s',
    (text) => {
      const service = createService();

      expect(() => service.parsePlanText(text)).toThrow(/duration-threshold/i);
    },
  );

  it('stringifies legacy pwr/cad aliases using canonical full target names', () => {
    const service = createService();

    const blocks = service.parsePlanText(
      'work 25min pwr 220-250W\nwork 5m cad <95rpm',
    );

    expect(service.stringifyPlan(blocks)).toBe(
      ['work 25m power 220-250W', 'work 5m cadence <95rpm'].join('\n'),
    );
  });

  it('parses DSL keywords, units, and zone tokens case-insensitively', () => {
    const service = createService();

    const blocks = service.parsePlanText(
      [
        'WARMUP 10MIN',
        'WORK 25M HR Z2',
        'WORK 10M POWER >220W',
        'WORK 20M PaCe ZoNe3',
        'RECOVERY 90S',
      ].join('\n'),
    );

    expect(service.stringifyPlan(blocks)).toBe(
      [
        'warmup 10m',
        'work 25m hr z2',
        'work 10m power >220W',
        'work 20m pace z3',
        'recovery 90s',
      ].join('\n'),
    );
  });

  it('parses and stringifies zone targets as zone references', () => {
    const service = createService();

    const blocks = service.parsePlanText(
      ['work 25m hr z2', 'work 10m Z3 Power', 'work 5m pace z1'].join('\n'),
    );

    expect(blocks[0]).toMatchObject({
      type: 'work',
      steps: [
        {
          primaryTargetMeta: {
            kind: 'HEART_RATE_ZONE',
            zoneIndex: 2,
            zoneLabel: 'Z2',
            zoneSystem: 'HEART_RATE',
            zoneSource: 'TRAININGLOAD',
            unit: 'zone',
          },
        },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: 'work',
      steps: [
        {
          primaryTargetMeta: {
            kind: 'POWER_ZONE',
            zoneIndex: 3,
            zoneLabel: 'Z3',
            zoneSystem: 'POWER',
            zoneSource: 'TRAININGLOAD',
            unit: 'zone',
          },
        },
      ],
    });

    const [hrDraft, powerDraft, paceDraft] =
      service.buildWorkoutPlanSteps(blocks);
    expect(hrDraft).toMatchObject({
      targetType: 'HEART_RATE',
      targetValueLow: null,
      targetValueHigh: null,
      targetUnit: 'PERCENT',
      targetZoneIndex: 2,
      targetZoneSource: 'TRAININGLOAD',
    });
    expect(powerDraft).toMatchObject({
      targetType: 'POWER',
      targetValueLow: null,
      targetValueHigh: null,
      targetUnit: 'PERCENT',
      targetZoneIndex: 3,
      targetZoneSource: 'TRAININGLOAD',
    });
    expect(paceDraft).toMatchObject({
      targetType: 'SPEED',
      targetValueLow: null,
      targetValueHigh: null,
      targetUnit: 'SECONDS',
      targetZoneIndex: 1,
      targetZoneSource: 'TRAININGLOAD',
    });
    expect(service.stringifyPlan(blocks)).toBe(
      ['work 25m hr z2', 'work 10m power z3', 'work 5m pace z1'].join('\n'),
    );
  });

  it('preserves resolved power and pace zone snapshots through draft restoration', () => {
    const service = createService();
    const blocks: PlanBlock[] = [
      {
        type: 'work',
        steps: [
          {
            duration: 1200,
            stepKind: 'WORK',
            durationMeta: { kind: 'TIME', value: 1200, unit: 'SECONDS' },
            powerWatts: 240,
            primaryTargetMeta: {
              kind: 'POWER_ZONE',
              value: 220,
              valueHigh: 260,
              unit: 'W',
              zoneIndex: 4,
              zoneLabel: 'Z4',
              zoneSystem: 'POWER',
              zoneSource: 'TRAININGLOAD',
              zoneBasis: {
                zoneType: 'POWER',
                sportType: 'CYCLING',
                benchmark: 'FTP',
                benchmarkValue: 250,
                benchmarkUnit: 'W',
                inputs: { ftp: 250 },
                targetLow: 220,
                targetHigh: 260,
                targetUnit: 'W',
              },
            },
          },
        ],
      },
      {
        type: 'work',
        steps: [
          {
            duration: 1800,
            stepKind: 'WORK',
            durationMeta: { kind: 'TIME', value: 1800, unit: 'SECONDS' },
            paceKmh: 12,
            primaryTargetMeta: {
              kind: 'SPEED',
              value: 280,
              valueHigh: 310,
              unit: 'sec/km',
              zoneIndex: 2,
              zoneLabel: 'Z2',
              zoneSystem: 'PACE',
              zoneSource: 'TRAININGLOAD',
              zoneBasis: {
                zoneType: 'PACE',
                sportType: 'RUN',
                benchmark: 'CS',
                benchmarkValue: 4.2,
                benchmarkUnit: 'm/s',
                inputs: { cs: 4.2 },
                targetLow: 280,
                targetHigh: 310,
                targetUnit: 'sec/km',
              },
            },
          },
        ],
      },
    ];

    const drafts = service.buildWorkoutPlanSteps(blocks);
    expect(drafts[0]).toMatchObject({
      targetType: 'POWER',
      targetValueLow: 220,
      targetValueHigh: 260,
      targetUnit: 'WATTS',
      targetZoneIndex: 4,
      targetZoneLabel: 'Z4',
      targetZoneSystem: 'POWER',
      targetZoneSource: 'TRAININGLOAD',
      targetZoneBasis: {
        zoneType: 'POWER',
        sportType: 'CYCLING',
        benchmark: 'FTP',
        benchmarkValue: 250,
        benchmarkUnit: 'W',
      },
    });
    expect(drafts[1]).toMatchObject({
      targetType: 'SPEED',
      targetValueLow: 280,
      targetValueHigh: 310,
      targetUnit: 'SECONDS',
      targetZoneIndex: 2,
      targetZoneLabel: 'Z2',
      targetZoneSystem: 'PACE',
      targetZoneSource: 'TRAININGLOAD',
      targetZoneBasis: {
        zoneType: 'PACE',
        sportType: 'RUN',
        benchmark: 'CS',
        benchmarkValue: 4.2,
        benchmarkUnit: 'm/s',
      },
    });

    const restored = service.buildPlanBlocksFromWorkoutSteps(
      drafts as never,
      'RUN',
    );
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      steps: [
        {
          primaryTargetMeta: {
            kind: 'POWER_ZONE',
            value: 220,
            valueHigh: 260,
            unit: 'W',
            zoneIndex: 4,
            zoneLabel: 'Z4',
            zoneSystem: 'POWER',
            zoneSource: 'TRAININGLOAD',
            zoneBasis: {
              zoneType: 'POWER',
              sportType: 'CYCLING',
              benchmark: 'FTP',
              benchmarkValue: 250,
              benchmarkUnit: 'W',
            },
          },
        },
        {
          primaryTargetMeta: {
            kind: 'SPEED',
            value: 280,
            valueHigh: 310,
            unit: 'sec/km',
            zoneIndex: 2,
            zoneLabel: 'Z2',
            zoneSystem: 'PACE',
            zoneSource: 'TRAININGLOAD',
            zoneBasis: {
              zoneType: 'PACE',
              sportType: 'RUN',
              benchmark: 'CS',
              benchmarkValue: 4.2,
              benchmarkUnit: 'm/s',
            },
          },
        },
      ],
    });
    expect(service.stringifyPlan(restored)).toBe(
      ['work 20m power z4', 'work 30m pace z2'].join('\n'),
    );
  });

  it('parses inline repeat blocks and stringifies them as canonical multiline DSL', () => {
    const service = createService();

    const blocks = service.parsePlanText('repeat 4 { work 30s, recovery 1m }');

    expect(blocks).toEqual([
      {
        type: 'repeat',
        count: 4,
        children: [
          expect.objectContaining({
            type: 'work',
            steps: [expect.objectContaining({ duration: 30 })],
          }),
          expect.objectContaining({
            type: 'rest',
            steps: [expect.objectContaining({ duration: 60 })],
          }),
        ],
      },
    ]);
    expect(service.stringifyPlan(blocks)).toBe(
      ['repeat 4 {', '  work 30s', '  recovery 1m', '}'].join('\n'),
    );
  });

  it('parses compound minute-second durations inside repeat blocks', () => {
    const service = createService();

    const blocks = service.parsePlanText(
      ['repeat 8 {', '  work 2m hr z4', '  recovery 1m30s', '}'].join('\n'),
    );

    expect(blocks).toEqual([
      {
        type: 'repeat',
        count: 8,
        children: [
          expect.objectContaining({
            type: 'work',
            steps: [expect.objectContaining({ duration: 120 })],
          }),
          expect.objectContaining({
            type: 'rest',
            steps: [expect.objectContaining({ duration: 90 })],
          }),
        ],
      },
    ]);
  });

  it('keeps indented repeat children separate from following top-level steps', () => {
    const service = createService();

    const blocks = service.parsePlanText(
      [
        'repeat 3',
        '  work 45s power 260W',
        '  recovery 90s',
        'cooldown 10m hr <140bpm',
      ].join('\n'),
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'repeat',
      count: 3,
      children: [
        {
          type: 'work',
          steps: [
            {
              duration: 45,
              primaryTargetMeta: {
                kind: 'POWER_CUSTOM',
                value: 260,
                valueHigh: 260,
                unit: 'W',
              },
            },
          ],
        },
        {
          type: 'rest',
          steps: [
            {
              duration: 90,
              stepKind: 'RECOVERY',
            },
          ],
        },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: 'work',
      steps: [
        {
          duration: 600,
          stepKind: 'COOLDOWN',
          primaryTargetMeta: {
            kind: 'HEART_RATE_CUSTOM',
            valueHigh: 140,
            unit: 'bpm',
          },
        },
      ],
    });
    expect(service.stringifyPlan(blocks)).toBe(
      [
        'repeat 3 {',
        '  work 45s power 260W',
        '  recovery 90s',
        '}',
        'cooldown 10m hr <140bpm',
      ].join('\n'),
    );
  });

  it('preserves swim pace units when parsing and stringifying pace targets', () => {
    const service = createService();

    const blocks = service.parsePlanText('work 20m pace 1:42-1:48 100m');
    const [draft] = service.buildWorkoutPlanSteps(blocks);

    expect(blocks[0]).toMatchObject({
      type: 'work',
      steps: [
        {
          paceKmh: 3.431,
          primaryTargetMeta: {
            kind: 'SPEED',
            value: 102,
            valueHigh: 108,
            unit: 'sec/100m',
          },
        },
      ],
    });
    expect(draft).toMatchObject({
      targetType: 'SPEED',
      targetValueLow: 102,
      targetValueHigh: 108,
      targetUnit: 'SECONDS',
    });
    expect(service.stringifyPlan(blocks, { sportType: 'SWIM' })).toBe(
      'work 20m pace 1:42-1:48 100m',
    );
  });

  it('preserves zone target provenance through draft and block restoration', () => {
    const service = createService();
    const blocks: PlanBlock[] = [
      {
        type: 'work',
        steps: [
          {
            duration: 1500,
            stepKind: 'WORK',
            durationMeta: { kind: 'TIME', value: 1500, unit: 'SECONDS' },
            heartRateBpm: 142.5,
            primaryTargetMeta: {
              kind: 'HEART_RATE_ZONE',
              value: 135,
              valueHigh: 150,
              unit: 'bpm',
              zoneIndex: 1,
              zoneLabel: 'Z2 (70% - 80%)',
              zoneSystem: 'PERCENT_MAX_HR',
              zoneSource: 'TRAININGLOAD',
              zoneBasis: {
                zoneType: 'HEART_RATE',
                sportType: 'RUN',
                benchmark: 'HRR',
                benchmarkValue: 140,
                benchmarkUnit: 'bpm',
                inputs: {
                  maxHeartRate: 200,
                  restingHeartRate: 60,
                },
                targetLow: 135,
                targetHigh: 150,
                targetUnit: 'bpm',
              },
            },
          },
        ],
      },
    ];

    const drafts = service.buildWorkoutPlanSteps(blocks);
    expect(drafts[0]).toMatchObject({
      targetType: 'HEART_RATE',
      targetValueLow: 135,
      targetValueHigh: 150,
      targetUnit: 'BPM',
      targetZoneIndex: 1,
      targetZoneLabel: 'Z2 (70% - 80%)',
      targetZoneSystem: 'PERCENT_MAX_HR',
      targetZoneSource: 'TRAININGLOAD',
      targetZoneBasis: {
        zoneType: 'HEART_RATE',
        sportType: 'RUN',
        benchmark: 'HRR',
        benchmarkValue: 140,
        benchmarkUnit: 'bpm',
        inputs: {
          maxHeartRate: 200,
          restingHeartRate: 60,
        },
      },
    });

    const restored = service.buildPlanBlocksFromWorkoutSteps(
      drafts as never,
      'RUN',
    );
    expect(restored[0]).toMatchObject({
      type: 'work',
      steps: [
        {
          primaryTargetMeta: {
            kind: 'HEART_RATE_ZONE',
            value: 135,
            valueHigh: 150,
            unit: 'bpm',
            zoneIndex: 1,
            zoneLabel: 'Z2 (70% - 80%)',
            zoneSystem: 'PERCENT_MAX_HR',
            zoneSource: 'TRAININGLOAD',
            zoneBasis: {
              zoneType: 'HEART_RATE',
              sportType: 'RUN',
              benchmark: 'HRR',
              benchmarkValue: 140,
              benchmarkUnit: 'bpm',
              inputs: {
                maxHeartRate: 200,
                restingHeartRate: 60,
              },
            },
          },
        },
      ],
    });
  });

  it('exports resolved zone snapshots as FIT target ranges', async () => {
    const service = createService();
    const blocks: PlanBlock[] = [
      {
        type: 'work',
        steps: [
          {
            duration: 1500,
            stepKind: 'WORK',
            durationMeta: { kind: 'TIME', value: 1500, unit: 'SECONDS' },
            heartRateBpm: 142.5,
            primaryTargetMeta: {
              kind: 'HEART_RATE_ZONE',
              value: 135,
              valueHigh: 150,
              unit: 'bpm',
              zoneIndex: 2,
              zoneLabel: 'Z2',
              zoneSystem: 'HEART_RATE',
              zoneSource: 'TRAININGLOAD',
            },
          },
        ],
      },
      {
        type: 'work',
        steps: [
          {
            duration: 1200,
            stepKind: 'WORK',
            durationMeta: { kind: 'TIME', value: 1200, unit: 'SECONDS' },
            powerWatts: 240,
            primaryTargetMeta: {
              kind: 'POWER_ZONE',
              value: 220,
              valueHigh: 260,
              unit: 'W',
              zoneIndex: 4,
              zoneLabel: 'Z4',
              zoneSystem: 'POWER',
              zoneSource: 'TRAININGLOAD',
            },
          },
        ],
      },
    ];

    await service.buildFITFromPlan(blocks, { sport: 'running' });

    const workoutSteps = fitMessages.filter(
      (message) => message.mesgNum === 27,
    );
    expect(workoutSteps[0]).toMatchObject({
      targetType: 'heartRate',
      customTargetHeartRateLow: 135,
      customTargetHeartRateHigh: 150,
    });
    expect(workoutSteps[1]).toMatchObject({
      targetType: 'power',
      customTargetPowerLow: 220,
      customTargetPowerHigh: 260,
    });
  });

  it('exports duration and target low/high fields to FIT workout steps', async () => {
    fitMessages.length = 0;
    const service = createService();
    const blocks = service.parsePlanText(
      [
        'work 5km pace 4:30-4:45',
        'work open hr <150bpm',
        'work power>250W',
        'work 25m cadence 85-95rpm',
      ].join('\n'),
    );

    await service.buildFITFromPlan(blocks, { sport: 'running' });

    const workoutSteps = fitMessages.filter(
      (message) => message.mesgNum === 27,
    );
    expect(workoutSteps).toHaveLength(4);
    expect(workoutSteps[0]).toMatchObject({
      durationType: 'distance',
      durationDistance: 5000,
      targetType: 'speed',
      customTargetSpeedLow: expect.any(Number),
      customTargetSpeedHigh: expect.any(Number),
    });
    expect(workoutSteps[1]).toMatchObject({
      durationType: 'open',
      targetType: 'heartRate',
      customTargetHeartRateHigh: 150,
    });
    expect(workoutSteps[1]).not.toHaveProperty('customTargetHeartRateLow');
    expect(workoutSteps[2]).toMatchObject({
      durationType: 'powerGreaterThan',
      durationPower: 250,
      targetType: 'open',
    });
    expect(workoutSteps[3]).toMatchObject({
      durationType: 'time',
      durationTime: 1500,
      targetType: 'cadence',
      customTargetCadenceLow: 85,
      customTargetCadenceHigh: 95,
    });
  });

  it('exports repeat blocks as FIT repeat steps instead of flattening repetitions', async () => {
    const service = createService();
    const blocks: PlanBlock[] = [
      {
        type: 'repeat',
        count: 4,
        children: [
          {
            type: 'work',
            steps: [
              {
                duration: 240,
                stepKind: 'WORK',
                durationMeta: { kind: 'TIME', value: 240, unit: 'SECONDS' },
                powerWatts: 270,
                primaryTargetMeta: {
                  kind: 'POWER_CUSTOM',
                  value: 260,
                  valueHigh: 280,
                  unit: 'W',
                },
              },
            ],
          },
          {
            type: 'rest',
            steps: [
              {
                duration: 120,
                stepKind: 'RECOVERY',
                durationMeta: { kind: 'TIME', value: 120, unit: 'SECONDS' },
              },
            ],
          },
        ],
      },
    ];

    await service.buildFITFromPlan(blocks, { sport: 'running' });

    const workoutSteps = fitMessages.filter(
      (message) => message.mesgNum === 27,
    );
    expect(workoutSteps).toHaveLength(3);
    expect(workoutSteps.map((message) => message.durationType)).toEqual([
      'time',
      'time',
      'repeatUntilStepsCmplt',
    ]);
    expect(workoutSteps[2]).toMatchObject({
      messageIndex: 2,
      durationStep: 0,
      repeatSteps: 4,
      targetType: 'open',
    });
  });

  it('imports FIT repeatUntilStepsCmplt messages as a repeat tree', () => {
    const service = createService();

    const blocks = (
      service as unknown as {
        mapFITStepsToPlan: (steps: unknown[]) => PlanBlock[];
      }
    ).mapFITStepsToPlan([
      {
        messageIndex: 0,
        intensity: 'active',
        durationType: 'time',
        durationTime: 240,
        targetType: 'power',
        customTargetPowerLow: 260,
        customTargetPowerHigh: 280,
      },
      {
        messageIndex: 1,
        intensity: 'recovery',
        durationType: 'time',
        durationTime: 120,
        targetType: 'open',
      },
      {
        messageIndex: 2,
        durationType: 'repeatUntilStepsCmplt',
        durationStep: 0,
        repeatSteps: 4,
        targetType: 'open',
      },
    ]) as PlanBlock[];

    expect(blocks).toEqual([
      {
        type: 'repeat',
        count: 4,
        children: [
          {
            type: 'work',
            steps: [
              expect.objectContaining({
                duration: 240,
                stepKind: 'WORK',
                durationMeta: {
                  kind: 'TIME',
                  value: 240,
                  unit: 'SECONDS',
                },
                powerWatts: 270,
                primaryTargetMeta: {
                  kind: 'POWER_CUSTOM',
                  value: 260,
                  valueHigh: 280,
                  unit: 'W',
                },
              }),
            ],
          },
          {
            type: 'rest',
            steps: [
              expect.objectContaining({
                duration: 120,
                stepKind: 'RECOVERY',
                durationMeta: {
                  kind: 'TIME',
                  value: 120,
                  unit: 'SECONDS',
                },
              }),
            ],
          },
        ],
      },
    ]);
  });

  it('round-trips dynamic prescription metadata without loss', () => {
    const service = createService();
    const blocks: PlanBlock[] = [
      {
        type: 'work',
        steps: [
          {
            duration: 1800,
            stepKind: 'WORK',
            durationMeta: { kind: 'TIME', value: 1800, unit: 'SECONDS' },
            primaryTargetMeta: {
              kind: 'HEART_RATE_ZONE',
              value: 142,
              valueHigh: 156,
              zoneIndex: 2,
              zoneLabel: 'Aerobic',
              zoneSystem: 'LTHR',
              zoneSource: 'TRAININGLOAD',
              zoneBasis: { benchmark: 'LTHR', targetLow: 142 },
              intensityIntent: {
                family: 'ENDURANCE',
                purpose: 'Aerobic endurance',
                source: 'AI_COACH',
              },
              resolutionMode: 'DYNAMIC_ZONE',
              zoneSystemKey: 'system-key',
              zoneFingerprint: 'fingerprint',
              unit: 'bpm',
            },
          },
        ],
      },
    ];

    const [stored] = service.buildWorkoutPlanSteps(blocks);
    const restored = service.buildPlanBlocksFromWorkoutSteps([stored]);
    const [roundTripped] = service.buildWorkoutPlanSteps(restored);

    expect(roundTripped).toMatchObject({
      intensityIntent: {
        family: 'ENDURANCE',
        purpose: 'Aerobic endurance',
        source: 'AI_COACH',
      },
      targetResolutionMode: 'DYNAMIC_ZONE',
      targetZoneSystemKey: 'system-key',
      targetZoneFingerprint: 'fingerprint',
      targetZoneIndex: 2,
      targetZoneLabel: 'Aerobic',
      targetValueLow: 142,
      targetValueHigh: 156,
    });
  });

  it('round-trips effort-only intent and auxiliary RPE without a numeric target', () => {
    const service = createService();
    const blocks: PlanBlock[] = [
      {
        type: 'work',
        steps: [
          {
            duration: 1200,
            stepKind: 'WORK',
            durationMeta: { kind: 'TIME', value: 1200, unit: 'SECONDS' },
            primaryTargetMeta: {
              kind: 'NONE',
              intensityIntent: {
                family: 'EASY',
                purpose: 'Conversational recovery run',
                source: 'AI_COACH',
                auxiliaryRpe: { low: 2, high: 3 },
              },
              resolutionMode: 'EFFORT_ONLY',
            },
          },
        ],
      },
    ];

    const [stored] = service.buildWorkoutPlanSteps(blocks);
    const restored = service.buildPlanBlocksFromWorkoutSteps([stored]);
    const [roundTripped] = service.buildWorkoutPlanSteps(restored);

    expect(roundTripped).toMatchObject({
      targetType: 'OPEN',
      targetValueLow: null,
      targetValueHigh: null,
      intensityIntent: {
        family: 'EASY',
        purpose: 'Conversational recovery run',
        source: 'AI_COACH',
        auxiliaryRpe: { low: 2, high: 3 },
      },
      targetResolutionMode: 'EFFORT_ONLY',
    });
  });
});
