import { describe, expect, it, jest } from '@jest/globals';
import { CoachBranchingService } from '../coach-branching.service';
import {
  COACH_TOOL_DEFINITIONS,
  getCoachTools,
} from '../core/tool.registry';
import { PlanStartService } from '../../plan/application/plan-start.service';
import { CoachContextService } from '../../plan/application/coach-context.service';
import { PlanProposalApplyService } from '../../plan/application/plan-proposal-apply.service';
import { HASHTEXT_ADVISORY_XACT_LOCK_SQL } from '@/prisma/hashtext-advisory-lock';

describe('plan, calendar, and multi-conversation concurrency guards', () => {
  describe('P0-1: legacy direct mutation_plan_* tools are retired from COACH_TOOL_DEFINITIONS', () => {
    it('does not expose any direct mutation_plan_* tool even without a branchId', async () => {
      const registeredNames = COACH_TOOL_DEFINITIONS.map((t) => t.name);
      for (const retired of [
        'mutation_plan_workout_update',
        'mutation_plan_workout_add',
        'mutation_plan_workout_postpone',
        'mutation_plan_workout_status',
        'mutation_plan_lifecycle',
      ]) {
        expect(registeredNames).not.toContain(retired);
      }

      const tools = await getCoachTools({
        ctx: {
          session: { user: { id: 'u-1' } },
          branchId: null,
        } as never,
      });
      expect(
        tools.some((t) => t.name.startsWith('mutation_plan_')),
      ).toBe(false);
    });
  });

  describe('P0-2: CoachDecision state transitions are atomic and CAS-protected for all decision types', () => {
    function createDecisionFixture(
      decisionType: string,
      initialState = 'PROPOSED',
    ) {
      const decision: Record<string, unknown> = {
        id: 'dec-1',
        decisionType,
        state: initialState,
        branchId: 'branch-1',
        contextId: 'ctx-1',
        baseEventSeq: 3,
        createdAt: new Date('2026-11-20T00:00:00Z'),
        rationale: null,
        branch: { baseEventSeq: 3 },
        context: { planId: 'plan-1', status: 'ACTIVE', headEventSeq: 3 },
        payload: {
          planId: 'plan-1',
          workoutId: 'w-1',
          status: 'SKIPPED',
          weekIndex: 2,
          dayIndex: 3,
        },
      };

      const executeRawUnsafe = jest.fn(async () => 1);
      const tx = {
        $executeRawUnsafe: executeRawUnsafe,
        coachDecision: {
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { state: string | { in: string[] } };
              data: Record<string, unknown>;
            }) => {
              const allowed =
                typeof where.state === 'string'
                  ? [where.state]
                  : where.state.in;
              if (!allowed.includes(String(decision.state))) {
                return { count: 0 };
              }
              Object.assign(decision, data);
              return { count: 1 };
            },
          ),
          update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(decision, data);
            return { ...decision };
          }),
          findUnique: jest.fn(async () => ({ ...decision })),
          findUniqueOrThrow: jest.fn(async () => ({ ...decision })),
        },
        coachCommit: {
          findFirst: jest.fn(async () => null),
          create: jest.fn(async () => ({ id: 'commit-1' })),
        },
        coachEvent: {
          updateMany: jest.fn(async () => ({ count: 1 })),
        },
        coachBranch: {
          update: jest.fn(async () => ({})),
        },
        coachApplyAttempt: {
          findFirst: jest.fn(async () => null),
          create: jest.fn(async () => ({ id: 'attempt-1' })),
        },
      };

      const updateWorkoutStatus = jest.fn(async () => ({ workout: { id: 'w-1' } }));
      const notifyWorkoutChanges = jest.fn(async () => undefined);
      const service = Object.create(
        CoachBranchingService.prototype,
      ) as CoachBranchingService;
      Object.assign(service, {
        requireDecisionOwner: jest.fn(async () => ({ ...decision })),
        prisma: {
          $transaction: jest.fn(async (run: (db: unknown) => Promise<unknown>) =>
            run(tx),
          ),
          coachCommit: { findFirst: jest.fn(async () => ({ id: 'commit-1' })) },
          coachApplyAttempt: tx.coachApplyAttempt,
        },
        planService: {
          updateWorkoutStatus,
          notifyWorkoutChanges,
        },
        planQuery: {
          findContextById: jest.fn(async () => ({ headEventSeq: 3 })),
        },
      });

      return {
        service,
        decision,
        tx,
        executeRawUnsafe,
        updateWorkoutStatus,
        notifyWorkoutChanges,
      };
    }

    it('prevents late approveDecision from regressing REJECTED PLAN_WORKOUT_UPDATE back to APPROVED', async () => {
      const f = createDecisionFixture('PLAN_WORKOUT_UPDATE', 'PROPOSED');
      // Simulate concurrent reject committing before approve enters the transaction.
      (f.service as unknown as { prisma: { $transaction: jest.Mock } }).prisma.$transaction.mockImplementationOnce(
        async (run: (db: unknown) => Promise<unknown>) => {
          f.decision.state = 'REJECTED';
          return run(f.tx);
        },
      );

      await expect(
        f.service.approveDecision({
          userId: 'user-1',
          decisionId: 'dec-1',
        }),
      ).rejects.toThrow('DECISION_STATE_CHANGED');
      expect(f.decision.state).toBe('REJECTED');
      expect(f.executeRawUnsafe).toHaveBeenCalledWith(
        HASHTEXT_ADVISORY_XACT_LOCK_SQL,
        'user-1',
      );
    });

    it('prevents rejectDecision from overwriting APPLIED PLAN_WORKOUT_UPDATE to REJECTED', async () => {
      const f = createDecisionFixture('PLAN_WORKOUT_UPDATE', 'APPLIED');
      await expect(
        f.service.rejectDecision({
          userId: 'user-1',
          decisionId: 'dec-1',
          reason: 'late_cancel',
        }),
      ).rejects.toThrow('DECISION_STATE_CHANGED');
      expect(f.decision.state).toBe('APPLIED');
      expect(f.executeRawUnsafe).toHaveBeenCalledWith(
        HASHTEXT_ADVISORY_XACT_LOCK_SQL,
        'user-1',
      );
    });

    it('executes PLAN_WORKOUT_STATUS inside the advisory-locked transaction only after claiming APPROVED -> APPLIED', async () => {
      const f = createDecisionFixture('PLAN_WORKOUT_STATUS', 'APPROVED');
      const result = await f.service.applyDecision({
        userId: 'user-1',
        decisionId: 'dec-1',
      });
      expect(result.result).toBe('APPLIED');
      expect(f.executeRawUnsafe).toHaveBeenCalledWith(
        HASHTEXT_ADVISORY_XACT_LOCK_SQL,
        'user-1',
      );
      expect(f.tx.coachDecision.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        f.updateWorkoutStatus.mock.invocationCallOrder[0],
      );
      expect(f.updateWorkoutStatus).toHaveBeenCalledWith(
        'user-1',
        'plan-1',
        'w-1',
        'SKIPPED',
        expect.objectContaining({ decisionId: 'dec-1' }),
        { tx: f.tx },
      );
      expect(f.notifyWorkoutChanges).toHaveBeenCalledWith('user-1', 'plan-1');
    });

    it('does not double-execute PLAN_WORKOUT_STATUS when a concurrent apply already claimed APPROVED', async () => {
      const f = createDecisionFixture('PLAN_WORKOUT_STATUS', 'APPROVED');
      (f.service as unknown as { prisma: { $transaction: jest.Mock } }).prisma.$transaction.mockImplementationOnce(
        async (run: (db: unknown) => Promise<unknown>) => {
          f.decision.state = 'APPLIED';
          return run(f.tx);
        },
      );

      const result = await f.service.applyDecision({
        userId: 'user-1',
        decisionId: 'dec-1',
      });
      expect(result.result).toBe('APPLIED');
      expect(f.updateWorkoutStatus).not.toHaveBeenCalled();
    });

    it('stamps squashBranch decisions with live context headEventSeq and workout expectedRevision', async () => {
      const createdDecisions: Array<Record<string, unknown>> = [];
      const tx = {
        $executeRawUnsafe: jest.fn(async () => 1),
        coachContext: {
          findUnique: jest.fn(async () => ({ headEventSeq: 9 })),
        },
        coachDecision: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const row = { id: 'dec-new', ...data };
            createdDecisions.push(row);
            return row;
          }),
          updateMany: jest.fn(async () => ({ count: 0 })),
        },
        coachDecisionOption: {
          findMany: jest.fn(async () => []),
        },
        coachBranch: {
          update: jest.fn(async () => ({})),
        },
        coachAssessmentCase: {
          updateMany: jest.fn(async () => ({ count: 0 })),
        },
      };
      const service = Object.create(
        CoachBranchingService.prototype,
      ) as CoachBranchingService;
      Object.assign(service, {
        requireBranchOwner: jest.fn(async () => ({
          id: 'branch-1',
          contextId: 'ctx-1',
          status: 'OPEN',
          baseEventSeq: 4, // Stale branch base seq from earlier turn
          context: { planId: 'plan-1' },
        })),
        planService: {
          getPlanDetail: jest.fn(async () => ({
            plan: {
              periodWeeks: 4,
              planningMode: 'FIXED',
              workouts: [
                {
                  id: 'w-1',
                  weekIndex: 1,
                  dayIndex: 1,
                  sessionIndex: 1,
                  revision: 7,
                  status: 'PLANNED',
                  sportType: 'RUN',
                  sportDefinitionCode: 'ROAD_RUNNING',
                  name: 'Easy Run',
                  notes: null,
                  text: 'work 30m',
                },
              ],
            },
          })),
        },
        prisma: {
          $transaction: jest.fn(async (run: (db: unknown) => Promise<unknown>) =>
            run(tx),
          ),
        },
      });

      const res = await service.squashBranch({
        userId: 'user-1',
        branchId: 'branch-1',
        decisionType: 'PLAN_WORKOUT_UPDATE',
        payload: {
          planId: 'plan-1',
          workoutId: 'w-1',
          dto: {
            weekIndex: 1,
            dayIndex: 2,
            sportType: 'RUN',
            text: 'work 40m',
          },
        },
      });

      expect(res.decision.baseEventSeq).toBe(9);
      expect(
        (res.decision.payload as { dto?: { expectedRevision?: number } }).dto
          ?.expectedRevision,
      ).toBe(7);
      expect(tx.coachBranch.update).toHaveBeenCalledWith({
        where: { id: 'branch-1' },
        data: { status: 'SQUASHED', baseEventSeq: 9 },
      });
    });
  });

  describe('P1-1: multi-conversation invalidate only affects the scoped session', () => {
    it('prepareTurn in Chat A only expires Chat A previews and preserves Chat B pending proposals on the same plan', async () => {
      const expiredPreviewIds: string[] = [];
      const supersededDecisionIds: string[] = [];
      const tx = {
        $executeRawUnsafe: jest.fn(async () => 1),
        aiCoachSession: {
          findUnique: jest.fn(async () => ({
            id: 'sid-A',
            planStartPlanId: null,
            planStartBranchId: null,
          })),
        },
        coachBranch: {
          findFirst: jest.fn(async () => ({
            id: 'branch-A',
            context: { planId: 'plan-1' },
          })),
        },
        planProposalPreview: {
          findMany: jest.fn(async () => [
            {
              id: 'preview-A',
              decisionId: 'dec-A',
              proposal: { binding: { sid: 'sid-A', branchId: 'branch-A' } },
            },
            {
              id: 'preview-B',
              decisionId: 'dec-B',
              proposal: { binding: { sid: 'sid-B', branchId: 'branch-B' } },
            },
          ]),
          updateMany: jest.fn(
            async ({ where }: { where: { id: { in: string[] } } }) => {
              expiredPreviewIds.push(...where.id.in);
              return { count: where.id.in.length };
            },
          ),
        },
        coachDecision: {
          updateMany: jest.fn(
            async ({ where }: { where: { id: { in: string[] } } }) => {
              supersededDecisionIds.push(...where.id.in);
              return { count: where.id.in.length };
            },
          ),
        },
      };
      const service = Object.create(
        PlanStartService.prototype,
      ) as PlanStartService;

      await service.prepareTurn(
        'user-1',
        'sid-A',
        'branch-A',
        { content: [{ type: 'text', text: 'How was my weekly mileage?' }] },
        tx as never,
      );

      expect(expiredPreviewIds).toEqual(['preview-A']);
      expect(supersededDecisionIds).toEqual(['dec-A']);
    });
  });

  describe('P1-4: bulk updatePlan invalidates workout decisions and finalize/supersede retire open context work', () => {
    it('supersedes workout proposals for every workoutId in payload.workoutIds and acquires advisory lock inside tx', async () => {
      const supersedeWorkoutDecisions = jest.fn(async () => ({ count: 1 }));
      const supersedeStartDecisions = jest.fn(async () => undefined);
      const executeRawUnsafe = jest.fn(async () => 1);
      const tx = { $executeRawUnsafe: executeRawUnsafe };
      const contexts = {
        findUnique: jest.fn(async () => ({ id: 'ctx-1' })),
        findEventFirst: jest.fn(async () => ({ seq: 10 })),
        createEvent: jest.fn(async () => ({ id: 'ev-11', seq: 11 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        supersedeWorkoutDecisions,
        supersedeStartDecisions,
      };
      const service = new CoachContextService(
        {} as never,
        {} as never,
        contexts as never,
        {} as never,
        { requestUpdate: async () => ({}) } as never,
        undefined,
      );

      await service.appendEvent({
        userId: 'user-1',
        planId: 'plan-1',
        tx: tx as never,
        type: 'ADAPTATION_APPLIED',
        source: 'manual',
        decisionId: 'dec-applying',
        payload: {
          action: 'plan_update',
          workoutIds: ['w-1', 'w-2'],
        },
      });

      expect(executeRawUnsafe).toHaveBeenCalledWith(
        HASHTEXT_ADVISORY_XACT_LOCK_SQL,
        'user-1',
      );
      expect(supersedeWorkoutDecisions).toHaveBeenCalledTimes(2);
      expect(supersedeWorkoutDecisions).toHaveBeenCalledWith(
        {
          contextId: 'ctx-1',
          workoutId: 'w-1',
          eventSeq: 11,
          appliedDecisionId: 'dec-applying',
        },
        tx,
      );
      expect(supersedeWorkoutDecisions).toHaveBeenCalledWith(
        {
          contextId: 'ctx-1',
          workoutId: 'w-2',
          eventSeq: 11,
          appliedDecisionId: 'dec-applying',
        },
        tx,
      );
      expect(supersedeStartDecisions).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          planId: 'plan-1',
          appliedDecisionId: 'dec-applying',
        },
        tx,
      );
    });

    it('retires open branches, pending decisions, and previews when context is superseded', async () => {
      const retireContextOpenWork = jest.fn(async () => undefined);
      const tx = { $executeRawUnsafe: jest.fn(async () => 1) };
      const contexts = {
        findUnique: jest.fn(async () => ({ id: 'ctx-1', status: 'ACTIVE' })),
        update: jest.fn(async () => ({ id: 'ctx-1', status: 'SUPERSEDED' })),
        findEventFirst: jest.fn(async () => ({ seq: 1 })),
        createEvent: jest.fn(async () => ({ id: 'ev-2', seq: 2 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        supersedeWorkoutDecisions: jest.fn(async () => ({ count: 0 })),
        supersedeStartDecisions: jest.fn(async () => undefined),
        retireContextOpenWork,
      };
      const service = new CoachContextService(
        {} as never,
        {} as never,
        contexts as never,
        {} as never,
        { requestUpdate: async () => ({}) } as never,
        undefined,
      );

      await service.supersedeContext({
        userId: 'user-1',
        planId: 'plan-1',
        successorPlanId: 'plan-2',
        effectiveFrom: '2026-12-01',
        decisionId: 'dec-supersede',
        tx: tx as never,
      });

      expect(retireContextOpenWork).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          contextId: 'ctx-1',
          planId: 'plan-1',
          excludeDecisionId: 'dec-supersede',
        }),
        tx,
      );
    });

    it('detects zone drift on a secondary dynamic target dimension in PlanProposalApplyService', async () => {
      const workouts = {
        findMany: jest.fn(async () => [
          {
            id: 'w-1',
            revision: 1,
            sportType: 'RUN',
            status: 'PLANNED',
            scheduledDate: new Date('2099-10-02T00:00:00.000Z'),
            links: [],
            steps: [],
            plan: { status: 'ACTIVE' },
          },
        ]),
        updateExternalMappings: jest.fn(),
      };
      const users = {
        getPreferredTimezone: jest.fn(async () => 'UTC'),
        getComposedUserProfile: jest.fn(async () => ({})),
        getPaceZoneSettingResolved: jest.fn(async () => ({
          zones: [{ order: 1, name: 'Z1', min: 0.003, max: 0.004 }],
        })),
        getHeartRateZoneSetting: jest.fn(async () => ({
          zones: [{ order: 1, name: 'Z1', min: 120, max: 140 }],
        })),
      };
      const prescriptions = {
        zoneIdentity: jest.fn(({ dimension }: { dimension: string }) => ({
          systemKey: dimension,
          fingerprint: dimension === 'PACE' ? 'pace-fp-ok' : 'hr-fp-CHANGED',
        })),
      };
      const service = new PlanProposalApplyService(
        { updateWorkouts: jest.fn() } as never,
        {} as never,
        workouts as never,
        {
          findUnique: jest.fn(async () => ({
            id: 'preview-1',
            userId: 'user-1',
            sourcePlanId: 'plan-1',
            decisionId: 'dec-1',
            appliedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            proposal: {
              mode: 'ADAPT',
              planId: 'plan-1',
              expectedPlanStatus: 'ACTIVE',
              sourceWorkouts: [
                {
                  id: 'w-1',
                  revision: 1,
                  dynamicZones: [],
                  status: 'PLANNED',
                  scheduledDate: '2099-10-02',
                  activeActivityLinkCount: 0,
                },
              ],
              preservedWorkoutIds: [],
              changes: [
                {
                  workoutId: 'w-1',
                  expectedRevision: 1,
                  expectedZoneFingerprint: 'pace-fp-ok',
                  dto: {
                    blocks: [
                      {
                        type: 'work',
                        steps: [
                          {
                            primaryTargetMeta: {
                              kind: 'SPEED',
                              resolutionMode: 'DYNAMIC_ZONE',
                              zoneFingerprint: 'pace-fp-ok',
                            },
                          },
                          {
                            primaryTargetMeta: {
                              kind: 'HEART_RATE_ZONE',
                              resolutionMode: 'DYNAMIC_ZONE',
                              zoneFingerprint: 'hr-fp-OLD',
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          })),
          updateMany: jest.fn(async () => ({ count: 1 })),
        } as never,
        {} as never,
        users as never,
        prescriptions as never,
        {} as never,
        {} as never,
      );

      await expect(
        service.apply({
          userId: 'user-1',
          decisionId: 'dec-1',
          branchId: 'branch-1',
          contextPlanId: 'plan-1',
          previewId: 'preview-1',
          tx: { $executeRawUnsafe: jest.fn(async () => 1) } as never,
        }),
      ).rejects.toThrow(/Training zones changed after preview/);
    });
  });
});
