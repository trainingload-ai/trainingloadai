import { describe, expect, it, jest } from '@jest/globals';
import { PlanExternalSyncService } from '@/api/plan/application/plan-external-sync.service';
import { PlanRepository } from '@/api/plan/persistence/plan.repository';
import { PlanWorkoutRepository } from '@/api/plan/persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '@/api/plan/persistence/plan-activity-link.repository';
import { IntervalsIcuPlanSyncService } from '../intervals-icu-plan-sync.service';

describe('IntervalsIcuPlanSyncService', () => {
  function createService() {
    const externalProviderConnection = {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const planWorkoutExternalMapping = {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const planWorkout = {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const planWorkoutStep = {
      deleteMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const prisma = {
      externalProviderConnection,
      planWorkoutExternalMapping,
      planWorkout,
      planWorkoutStep,
      plan: {
        findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        findUnique: jest.fn(async () => ({
          id: 'plan-local',
          userId: 'user-1',
          status: 'ACTIVE',
          supersededBy: null,
        })),
      },
      $transaction: jest.fn(async (fn: (value: typeof prisma) => unknown) =>
        fn(prisma),
      ),
    };
    const intervalsIcuClient = {
      listEvents: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      createEventsBulk: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateEvent: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      deleteEventsBulk: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const intervalsIcuCredentials = {
      decrypt: jest.fn((value: string) => `plain:${value}`),
      resolveConnectionCredential: jest.fn(
        (connection: { credentialCiphertext: string }) =>
          `plain:${connection.credentialCiphertext}`,
      ),
    };
    const workoutService = {
      parseFile: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      stringifyPlan: jest.fn<(...args: unknown[]) => string>(),
      buildPlanBlocksFromWorkoutSteps:
        jest.fn<(...args: unknown[]) => unknown>(),
      buildWorkoutPlanSteps: jest.fn<(...args: unknown[]) => unknown[]>(),
      buildFITFromPlan: jest.fn<(...args: unknown[]) => Promise<Uint8Array>>(),
    };
    const planLoadEstimator = {
      applyForWorkout: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const sportCatalog = {
      fromProvider: jest.fn(
        async ({ externalCode }: { externalCode: string }) => {
          const family = String(externalCode).toUpperCase();
          const codes: Record<string, string> = {
            RUN: 'ROAD_RUNNING',
            RIDE: 'ROAD_CYCLING',
            SWIM: 'POOL_SWIMMING',
          };
          const code = codes[family];
          return code ? { sport: { code } } : null;
        },
      ),
      resolve: jest.fn(async (_code: unknown, family: string) => ({
        code:
          family === 'RUN'
            ? 'ROAD_RUNNING'
            : family === 'SWIM'
              ? 'POOL_SWIMMING'
              : 'ROAD_CYCLING',
      })),
      toProvider: jest.fn(
        async ({
          family,
          sportCode,
        }: {
          family: string;
          sportCode: string;
        }) => {
          const config: Record<string, [string, string, string, string]> = {
            RUN: ['RUN', 'Run', 'running', 'generic'],
            CYCLING: ['RIDE', 'Ride', 'cycling', 'road'],
            SWIM: ['SWIM', 'Swim', 'swimming', 'lap_swimming'],
          };
          const resolved = config[family];
          return resolved
            ? {
                externalCode: resolved[0],
                metadata: { apiType: resolved[1] },
                sport: {
                  fitSport: resolved[2],
                  fitSubSport:
                    sportCode === 'TRAIL_RUNNING' ? 'trail' : resolved[3],
                },
              }
            : null;
        },
      ),
    };

    return {
      externalProviderConnection,
      intervalsIcuClient,
      intervalsIcuCredentials,
      planLoadEstimator,
      planWorkout,
      planWorkoutStep,
      planWorkoutExternalMapping,
      prisma,
      service: new IntervalsIcuPlanSyncService(
        prisma as never,
        intervalsIcuClient as never,
        intervalsIcuCredentials as never,
        workoutService as never,
        sportCatalog as never,
        new PlanExternalSyncService(
          prisma as never,
          workoutService as never,
          planLoadEstimator as never,
          new PlanRepository(prisma as never),
          new PlanWorkoutRepository(prisma as never),
          new PlanActivityLinkRepository(prisma as never),
          { assertMutable: jest.fn() } as never,
          {
            getPreferredTimezone: jest.fn(async () => 'UTC'),
          } as never,
        ),
        { model: () => externalProviderConnection } as never,
        {
          run: (_id: string, work: () => Promise<unknown>) => work(),
          assertHeld: () => undefined,
        } as never,
      ),
      workoutService,
    };
  }

  function exportedFitFixture(withSteps: boolean) {
    const fit = Buffer.from(
      withSteps ? 'synthetic-structured-fit' : 'synthetic-empty-fit',
    );
    const codec = {
      parseFile: async () => ({
        block: withSteps
          ? [
              {
                type: 'work',
                steps: [
                  {
                    duration: 60,
                    durationMeta: { kind: 'TIME', value: 60, unit: 'SECONDS' },
                  },
                ],
              },
            ]
          : [],
        plan: withSteps ? 'work 1m' : '',
      }),
    };
    return { codec, fit };
  }

  it('reads structured workouts from the official event export file field', async () => {
    const f = createService();
    const { codec, fit } = exportedFitFixture(true);
    f.workoutService.parseFile.mockImplementation(async () =>
      codec.parseFile(),
    );
    const parsed = await (
      f.service as unknown as {
        parseRemoteWorkout(event: unknown): Promise<unknown>;
      }
    ).parseRemoteWorkout({
      id: 'synthetic-fit-event',
      start_date_local: '2026-07-06',
      type: 'Run',
      workout_doc: { steps: [] },
      workout_file_base64: fit.toString('base64'),
    });
    expect(f.workoutService.parseFile).toHaveBeenCalledWith(fit);
    expect(parsed).toMatchObject({
      blocks: [
        { type: 'work', steps: [expect.objectContaining({ duration: 60 })] },
      ],
    });
  });

  it('keeps the native-document checksum when calendar GET also supplies a FIT export', async () => {
    const f = createService();
    const { fit } = exportedFitFixture(true);
    f.workoutService.stringifyPlan.mockReturnValue('work 1m');
    const event = {
      id: 'synthetic-doc-event',
      start_date_local: '2026-07-06',
      type: 'Run',
      workout_doc: {
        steps: [{ duration: 60, power: { value: 70, units: '%ftp' } }],
      },
    };
    const parser = f.service as unknown as {
      parseRemoteWorkout(event: unknown): Promise<unknown>;
    };
    const original = await parser.parseRemoteWorkout(event);
    expect(original).not.toBeNull();
    expect(
      await parser.parseRemoteWorkout({
        ...event,
        workout_file_base64: fit.toString('base64'),
      }),
    ).toEqual(original);
    expect(f.workoutService.parseFile).not.toHaveBeenCalled();
  });

  it.each(['file_contents_base64', 'workout_file_base64'])(
    'does not turn an empty %s export into a local workout',
    async (field) => {
      const f = createService();
      const { codec, fit } = exportedFitFixture(false);
      f.workoutService.parseFile.mockImplementation(async () =>
        codec.parseFile(),
      );
      const parsed = await (
        f.service as unknown as {
          parseRemoteWorkout(event: unknown): Promise<unknown>;
        }
      ).parseRemoteWorkout({
        id: 'synthetic-empty-event',
        start_date_local: '2026-07-06',
        type: 'Run',
        workout_doc: { steps: [] },
        [field]: fit.toString('base64'),
      });
      expect(parsed).toBeNull();
    },
  );

  it('falls back to the structured document when the exported FIT has no steps', async () => {
    const f = createService();
    const { codec, fit } = exportedFitFixture(false);
    f.workoutService.parseFile.mockImplementation(async () =>
      codec.parseFile(),
    );
    f.workoutService.stringifyPlan.mockReturnValue('work 1m');
    const parsed = await (
      f.service as unknown as {
        parseRemoteWorkout(event: unknown): Promise<unknown>;
      }
    ).parseRemoteWorkout({
      id: 'synthetic-fallback-event',
      start_date_local: '2026-07-06',
      type: 'Run',
      workout_doc: { steps: [{ duration: 60 }] },
      file_contents_base64: fit.toString('base64'),
    });
    expect(parsed).toMatchObject({
      blocks: [
        { type: 'work', steps: [expect.objectContaining({ duration: 60 })] },
      ],
    });
  });

  it.each([true, false])(
    'classifies empty=%s source events without changing existing mappings',
    async (empty) => {
      const f = createService();
      const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
      (f.service as unknown as { logger: typeof logger }).logger = logger;
      const { codec, fit } = exportedFitFixture(false);
      f.workoutService.parseFile.mockImplementation(async () =>
        codec.parseFile(),
      );
      f.externalProviderConnection.findUnique.mockResolvedValue({
        metadata: {},
      });
      f.planWorkoutExternalMapping.findMany.mockResolvedValue([]);
      f.intervalsIcuClient.listEvents.mockResolvedValue(
        ['Swim', 'Run'].map((type, i) => ({
          id: `synthetic-empty-${i}`,
          type,
          category: 'WORKOUT',
          start_date_local: '2026-07-06',
          name: 'Private synthetic title',
          description: null,
          workout_doc: { steps: empty ? [] : [{ distance: 1000 }] },
          workout_file_base64: empty ? fit.toString('base64') : undefined,
        })),
      );
      const result = await f.service.syncConnectionWeek({
        userId: 'user-1',
        credential: 'key',
        weekStart: '2026-07-06',
        trigger: 'scheduled',
        connection: {
          id: 'private-connection',
          status: 'ACTIVE',
          metadata: {
            planSync: {
              syncPlannedWorkouts: true,
              exportPlannedWorkouts: false,
            },
          },
        },
      });
      expect(result.import).toMatchObject({
        fetched: 2,
        skipped: 2,
        failed: 0,
        created: 0,
        updated: 0,
      });
      expect(f.planWorkout.create).not.toHaveBeenCalled();
      expect(f.planWorkoutExternalMapping.update).not.toHaveBeenCalled();
      expect(f.planWorkoutExternalMapping.create).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(empty ? 0 : 2);
      expect(logger.log).toHaveBeenCalledTimes(empty ? 2 : 0);
      const logs = (empty ? logger.log : logger.warn).mock.calls.map(
        ([message]) => String(message),
      );
      expect(
        logs.every((message) =>
          message.includes(
            empty
              ? 'reason=NO_STRUCTURED_WORKOUT_STEPS'
              : 'reason=UNSUPPORTED_WORKOUT_DOCUMENT',
          ),
        ),
      ).toBe(true);
      expect(new Set(logs).size).toBe(2);
      expect(logs.join(' ')).not.toMatch(
        /private-connection|synthetic-empty|Private synthetic title/,
      );
    },
  );

  it.each(['unchanged', 'load-estimate', 'concurrent-edit'])(
    'handles a local timestamp change from %s',
    async (timestampChange) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-02T08:00:00.000Z'));
      const {
        externalProviderConnection,
        intervalsIcuClient,
        planLoadEstimator,
        planWorkout,
        planWorkoutExternalMapping,
        service,
        workoutService,
      } = createService();
      const localBlocks = [
        {
          type: 'work',
          steps: [
            {
              duration: 1800,
              durationMeta: { kind: 'TIME', value: 1800, unit: 'SECONDS' },
            },
          ],
        },
      ];
      const remoteBlocks = [
        {
          type: 'work',
          steps: [
            {
              duration: 3600,
              durationMeta: { kind: 'TIME', value: 3600, unit: 'SECONDS' },
            },
          ],
        },
      ];
      const remoteEvent = {
        id: 101,
        external_id: 'trainingload.ai:plan_workout:workout-1',
        uid: 'trainingload.ai:plan_workout:workout-1@trainingload.ai',
        category: 'WORKOUT',
        start_date_local: '2026-07-06',
        name: 'Intervals version',
        type: 'Run',
        file_contents_base64: Buffer.from('fit').toString('base64'),
      };
      const localWorkout = {
        id: 'workout-1',
        updatedAt: new Date('2026-07-02T08:00:00.000Z'),
        revision: 1,
        planId: 'plan-1',
        scheduledDate: new Date('2026-07-06T00:00:00.000Z'),
        sportType: 'RUN',
        name: 'Local version',
        notes: null,
        status: 'PLANNED',
        steps: [],
        plan: { id: 'plan-1', userId: 'user-1', status: 'ACTIVE' },
      };

      externalProviderConnection.findUnique.mockResolvedValue({
        metadata: {
          planSync: {
            syncPlannedWorkouts: true,
            exportPlannedWorkouts: false,
          },
        },
      });
      externalProviderConnection.update.mockResolvedValue({});
      intervalsIcuClient.listEvents.mockResolvedValueOnce([remoteEvent]);
      let localReads = 0;
      planWorkout.findFirst.mockImplementation(async () => {
        localReads += 1;
        if (timestampChange === 'concurrent-edit' && localReads === 3) {
          localWorkout.updatedAt = new Date('2026-07-02T08:00:00.200Z');
          localWorkout.revision += 1;
        }
        return { ...localWorkout };
      });
      planWorkout.findUnique.mockResolvedValue({
        ...localWorkout,
        userId: 'user-1',
        links: [],
      });
      planWorkout.update.mockImplementation(async () => ({ ...localWorkout }));
      if (timestampChange === 'load-estimate') {
        planLoadEstimator.applyForWorkout.mockImplementation(async () => {
          localWorkout.updatedAt = new Date('2026-07-02T08:00:00.100Z');
        });
      }
      planWorkout.findMany.mockResolvedValue([]);
      workoutService.buildWorkoutPlanSteps.mockReturnValue([]);
      workoutService.parseFile.mockResolvedValue({
        block: remoteBlocks,
        plan: 'work 1:00:00',
      });
      workoutService.buildPlanBlocksFromWorkoutSteps.mockReturnValue(
        localBlocks,
      );
      planWorkoutExternalMapping.findFirst.mockResolvedValueOnce({
        id: 'mapping-1',
        userId: 'user-1',
        provider: 'intervals_icu',
        planWorkoutId: 'workout-1',
        externalEventId: '101',
        externalSourceKey: 'trainingload.ai:plan_workout:workout-1',
        lastLocalChecksum: null,
        lastRemoteChecksum: null,
        syncState: 'SYNCED',
      });
      planWorkoutExternalMapping.create.mockResolvedValue({
        id: 'mapping-1',
        planWorkoutId: 'workout-1',
      });
      planWorkoutExternalMapping.update.mockResolvedValue({});
      planWorkoutExternalMapping.findMany.mockResolvedValue([]);

      try {
        await expect(
          service.syncConnectionWeek({
            userId: 'user-1',
            connection: {
              id: 'connection-1',
              userId: 'user-1',
              status: 'ACTIVE',
              credentialCiphertext: 'cipher-key',
              metadata: {
                planSync: {
                  syncPlannedWorkouts: true,
                  exportPlannedWorkouts: false,
                },
              },
            },
            trigger: 'manual',
            weekStart: '2026-07-06',
          }),
        ).resolves.toMatchObject({
          enabled: true,
          window: { oldest: '2026-07-06', newest: '2026-07-12' },
          import: {
            fetched: 1,
            conflicted: 0,
            updated: timestampChange === 'concurrent-edit' ? 0 : 1,
            created: 0,
            failed: timestampChange === 'concurrent-edit' ? 1 : 0,
          },
          outcome:
            timestampChange === 'concurrent-edit'
              ? 'PARTIAL_FAILURE'
              : 'SUCCESS',
        });

        expect(planWorkout.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: 'workout-1',
              updatedAt: new Date('2026-07-02T08:00:00.000Z'),
            },
            data: expect.objectContaining({
              name: 'Intervals version',
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('uses yesterday through the next seven days for scheduled planned workout sync', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T08:00:00.000Z'));
    const { service } = createService();

    try {
      await expect(
        service.syncConnectionWeek({
          userId: 'user-1',
          connection: {
            id: 'connection-1',
            status: 'ACTIVE',
            metadata: {
              planSync: {
                syncPlannedWorkouts: false,
                exportPlannedWorkouts: false,
              },
            },
          },
          trigger: 'scheduled',
        }),
      ).resolves.toMatchObject({
        enabled: false,
        window: { oldest: '2026-07-01', newest: '2026-07-09' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves scheduled planned workout windows using the user timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-01T16:30:00.000Z'));
    const { service } = createService();

    try {
      await expect(
        service.syncConnectionWeek({
          userId: 'user-1',
          connection: {
            id: 'connection-1',
            status: 'ACTIVE',
            metadata: {
              planSync: {
                syncPlannedWorkouts: false,
                exportPlannedWorkouts: false,
              },
            },
          },
          trigger: 'scheduled',
          timezone: 'Asia/Shanghai',
        }),
      ).resolves.toMatchObject({
        enabled: false,
        window: { oldest: '2026-07-01', newest: '2026-07-09' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('builds Intervals.icu upload payloads with stable ids and local midnight timestamps', async () => {
    const { service, workoutService } = createService();
    workoutService.buildPlanBlocksFromWorkoutSteps.mockReturnValue([
      { type: 'work', steps: [] },
    ]);
    workoutService.buildFITFromPlan.mockResolvedValue(
      Uint8Array.from(Buffer.from('fit-bytes')),
    );

    const payload = await (
      service as never as {
        buildEventPayload: (...args: unknown[]) => Promise<unknown>;
      }
    ).buildEventPayload(
      {
        id: 'workout-1',
        scheduledDate: new Date('2026-07-06T12:34:56.000Z'),
        sportType: 'RUN',
        sportDefinitionCode: 'TRAIL_RUNNING',
        name: 'Threshold Run',
        text: 'Threshold Run',
        notes: 'Keep it smooth',
        steps: [],
        plan: { title: 'July Plan' },
      },
      null,
    );

    expect(payload).toMatchObject({
      category: 'WORKOUT',
      start_date_local: '2026-07-06T00:00:00',
      name: 'Threshold Run',
      type: 'Run',
      external_id: 'trainingload.ai:plan_workout:workout-1',
      uid: 'trainingload.ai:plan_workout:workout-1@trainingload.ai',
      filename: 'workout-1.fit',
      file_contents_base64: Buffer.from('fit-bytes').toString('base64'),
    });
    expect(workoutService.buildFITFromPlan).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ sport: 'running', subSport: 'trail' }),
    );
  });

  it('preserves a local Trainingload plan when applying remote edits to an existing workout', async () => {
    const {
      planLoadEstimator,
      planWorkout,
      planWorkoutStep,
      service,
      workoutService,
    } = createService();
    planWorkout.findMany.mockResolvedValue([]);
    planWorkout.findUnique.mockResolvedValue({
      id: 'workout-1',
      userId: 'user-1',
      status: 'PLANNED',
      scheduledDate: new Date('2026-07-06T00:00:00.000Z'),
      links: [],
      plan: {
        id: 'plan-local',
        status: 'ACTIVE',
        supersededBy: null,
      },
    });
    planWorkout.update.mockResolvedValue({
      id: 'workout-1',
      planId: 'plan-local',
    });
    planWorkout.findFirst.mockResolvedValue({
      id: 'workout-1',
      planId: 'plan-local',
    });
    planWorkoutStep.deleteMany.mockResolvedValue({ count: 0 });
    workoutService.buildWorkoutPlanSteps.mockReturnValue([]);
    planLoadEstimator.applyForWorkout.mockResolvedValue(null);

    await (
      service as never as {
        updateWorkoutFromRemote: (...args: unknown[]) => Promise<unknown>;
      }
    ).updateWorkoutFromRemote({
      userId: 'user-1',
      workout: {
        id: 'workout-1',
        planId: 'plan-local',
        sessionIndex: 1,
        status: 'PLANNED',
        plan: {
          id: 'plan-local',
          userId: 'user-1',
          goal: 'marathon',
          startDate: new Date('2026-07-01T00:00:00.000Z'),
        },
      },
      parsed: {
        scheduledDate: '2026-07-06',
        sportType: 'RUN',
        sportDefinitionCode: 'ROAD_RUNNING',
        name: 'Remote edit',
        text: 'work 45m',
        notes: null,
        blocks: [],
        checksum: 'remote-checksum',
      },
    });

    expect(planWorkout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'workout-1' },
        data: expect.objectContaining({
          planId: 'plan-local',
          dayOffset: 5,
          sportType: 'RUN',
          name: 'Remote edit',
        }),
      }),
    );
  });

  it('creates Intervals.icu-only planned workouts as independent workouts', async () => {
    const {
      planLoadEstimator,
      planWorkout,
      planWorkoutStep,
      service,
      workoutService,
    } = createService();
    planWorkout.findMany.mockResolvedValue([]);
    planWorkout.findFirst.mockResolvedValue({
      id: 'workout-remote',
      userId: 'user-1',
      planId: null,
    });
    planWorkout.create.mockResolvedValue({
      id: 'workout-remote',
      userId: 'user-1',
      planId: null,
    });
    planWorkoutStep.deleteMany.mockResolvedValue({ count: 0 });
    workoutService.buildWorkoutPlanSteps.mockReturnValue([]);
    planLoadEstimator.applyForWorkout.mockResolvedValue(null);

    const created = await (
      service as never as {
        createWorkoutFromRemote: (...args: unknown[]) => Promise<unknown>;
      }
    ).createWorkoutFromRemote({
      userId: 'user-1',
      parsed: {
        scheduledDate: '2026-07-06',
        sportType: 'RUN',
        sportDefinitionCode: 'ROAD_RUNNING',
        name: 'Remote planned workout',
        text: 'work 45m',
        notes: null,
        blocks: [],
        checksum: 'remote-checksum',
      },
    });

    expect(created).toMatchObject({
      id: 'workout-remote',
      userId: 'user-1',
      planId: null,
    });
    expect(planWorkout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          planId: null,
          dayOffset: 0,
          sessionIndex: 1,
          scheduledDate: new Date('2026-07-06T00:00:00.000Z'),
          sportType: 'RUN',
          name: 'Remote planned workout',
        }),
      }),
    );
  });
});
