import { Injectable } from '@nestjs/common';
import {
  AthleteMemoryEpistemicStatus,
  AthleteMemoryEventOperation,
  AthleteMemoryStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  MemoryIsolationError,
  MemoryValidationError,
} from '../../domain/memory-time';
import type {
  MemoryFactCandidate,
  MemoryOperation,
} from '../../domain/memory-operation';
import type {
  AthleteMemoryStore,
  MemoryFactRecord,
  StoreSearchInput,
} from '../../application/ports/athlete-memory-store';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));

function eventOperation(operation: string): AthleteMemoryEventOperation {
  return operation as AthleteMemoryEventOperation;
}

function date(value?: string) {
  return value ? new Date(value) : null;
}

function snapshot(fact: {
  id: string;
  status: unknown;
  claim: string;
  category: string;
  confidence: number;
  version: number;
  supersededById?: string | null;
}) {
  return {
    id: fact.id,
    status: fact.status,
    claim: fact.claim,
    category: fact.category,
    confidence: fact.confidence,
    version: fact.version,
    supersededById: fact.supersededById ?? null,
  };
}

function candidateData(
  candidate: MemoryFactCandidate,
  assertedAt: Date,
  timezone: string,
) {
  const eventStart = date(candidate.eventStart);
  const eventEnd = date(candidate.eventEnd);
  // UNTIL_RESOLVED never auto-recovers. The default only marks when the fact
  // should be treated as stale and re-confirmed with the athlete.
  const reviewAfter = candidate.reviewAfter
    ? new Date(candidate.reviewAfter)
    : candidate.decayProfile === 'UNTIL_RESOLVED'
      ? new Date(assertedAt.getTime() + 14 * 24 * 60 * 60 * 1000)
      : null;
  return {
    kind: candidate.kind,
    category: candidate.category,
    claim: candidate.claim,
    ...(candidate.value === undefined ? {} : { value: json(candidate.value) }),
    epistemicStatus: candidate.epistemicStatus,
    confidence: candidate.confidence,
    eventStart,
    eventEnd,
    timeText: candidate.timeText ?? null,
    timePrecision: candidate.timePrecision,
    timezone,
    validFrom: date(candidate.validFrom),
    validUntil: date(candidate.validUntil),
    decayProfile: candidate.decayProfile,
    relevanceAnchorAt: eventEnd ?? eventStart ?? assertedAt,
    reviewAfter,
  };
}

/**
 * Memory 的 Prisma 适配器，也是四张表之间一致性的最后边界。
 *
 * 阅读顺序：
 * 1. applyOperations：模型操作如何一次性落成 Fact/Evidence/Event/Job；
 * 2. findFacts/listFacts：模型读取与管理页读取；
 * 3. correct/delete/export：用户主动管理；
 * 4. retractSources：消息编辑或删除后的来源回收与替代链恢复。
 *
 * 跨表状态变化都留在同一个数据库事务中，远端模型调用不进入这里。
 */
@Injectable()
export class PrismaAthleteMemoryStore implements AthleteMemoryStore {
  constructor(private readonly prisma: PrismaService) {}

  async applyOperations(input: {
    jobId: string;
    leaseOwner: string;
    userId: string;
    sourceMessageId: string;
    sourceHash: string;
    assertedAt: Date;
    timezone: string;
    model: string;
    policyVersion: string;
    decision: unknown;
    operations: MemoryOperation[];
  }): Promise<{ applied: number; idempotent: boolean }> {
    // Fact projection, Evidence provenance, append-only Event audit and the Job
    // terminal state are one invariant: either all commit or none do. Remote
    // model work has already finished before this short transaction begins.
    return this.prisma.$transaction(async (tx) => {
      // A stale worker may finish after another process has reclaimed the job.
      // Bind every write to the durable job, source message, user and lease owner
      // before touching facts; SUCCEEDED is accepted only for a safe replay.
      const job = await tx.aiCoachMemoryExtractionJob.findFirst({
        where: {
          id: input.jobId,
          userId: input.userId,
          sourceMessageId: input.sourceMessageId,
        },
        select: { status: true, leaseOwner: true },
      });
      const ownsRunningLease =
        job?.status === 'RUNNING' && job.leaseOwner === input.leaseOwner;
      if (!ownsRunningLease && job?.status !== 'SUCCEEDED') {
        throw new MemoryIsolationError(
          'Extraction job does not belong to the active worker lease',
        );
      }

      const keys = input.operations.map(
        (operation, index) =>
          `${input.jobId}:${index}:${operation.operation}:${input.policyVersion}`,
      );
      const existing = await tx.athleteMemoryEvent.count({
        where: { idempotencyKey: { in: keys } },
      });
      if (existing === keys.length && keys.length > 0) {
        if (ownsRunningLease) {
          const completed = await tx.aiCoachMemoryExtractionJob.updateMany({
            where: {
              id: input.jobId,
              userId: input.userId,
              status: 'RUNNING',
              leaseOwner: input.leaseOwner,
            },
            data: {
              status: 'SUCCEEDED',
              decisionJson: json(input.decision),
              model: input.model,
              finishedAt: new Date(),
              leaseOwner: null,
              leaseExpiresAt: null,
              lastError: null,
              nextRetryAt: null,
            },
          });
          if (completed.count !== 1) {
            throw new MemoryValidationError('Extraction job lease was lost');
          }
        }
        return { applied: 0, idempotent: true };
      }
      if (existing !== 0) {
        // Events are written in the same transaction, so a partial set means
        // corruption or an incompatible policy replay—not a state to repair by
        // silently applying the missing suffix.
        throw new MemoryValidationError('Partial idempotency state detected');
      }

      let applied = 0;
      for (const [index, operation] of input.operations.entries()) {
        if (
          operation.operation === 'IGNORE' ||
          operation.operation === 'NEEDS_LOOKUP'
        ) {
          continue;
        }
        const idempotencyKey = keys[index];
        if (operation.operation === 'CREATE') {
          const fact = await tx.athleteMemoryFact.create({
            data: {
              userId: input.userId,
              ...candidateData(operation, input.assertedAt, input.timezone),
            },
          });
          const evidence = await tx.athleteMemoryEvidence.create({
            data: {
              userId: input.userId,
              factId: fact.id,
              sourceType: 'AI_COACH_MESSAGE',
              sourceMessageId: input.sourceMessageId,
              assertedAt: input.assertedAt,
              sourceHash: input.sourceHash,
            },
          });
          await tx.athleteMemoryEvent.create({
            data: {
              userId: input.userId,
              factId: fact.id,
              evidenceId: evidence.id,
              jobId: input.jobId,
              operation: 'CREATE',
              afterJson: json(snapshot(fact)),
              reasonCode: operation.reasonCode,
              model: input.model,
              policyVersion: input.policyVersion,
              idempotencyKey,
            },
          });
          applied += 1;
          continue;
        }

        const target = await tx.athleteMemoryFact.findFirst({
          where: { id: operation.targetFactId, userId: input.userId },
        });
        if (!target) {
          throw new MemoryIsolationError('Target fact does not belong to user');
        }
        const before = snapshot(target);

        if (operation.operation === 'CORROBORATE') {
          const evidence = await tx.athleteMemoryEvidence.upsert({
            where: {
              factId_sourceMessageId_sourceHash: {
                factId: target.id,
                sourceMessageId: input.sourceMessageId,
                sourceHash: input.sourceHash,
              },
            },
            create: {
              userId: input.userId,
              factId: target.id,
              sourceType: 'AI_COACH_MESSAGE',
              sourceMessageId: input.sourceMessageId,
              assertedAt: input.assertedAt,
              sourceHash: input.sourceHash,
            },
            update: {},
          });
          const updatedCount = await tx.athleteMemoryFact.updateMany({
            where: {
              id: target.id,
              userId: input.userId,
              version: target.version,
            },
            data: {
              confidence: Math.min(1, target.confidence + 0.05),
              version: { increment: 1 },
            },
          });
          if (updatedCount.count !== 1) {
            throw new MemoryValidationError('Fact version conflict');
          }
          const updated = await tx.athleteMemoryFact.findUniqueOrThrow({
            where: { id: target.id },
          });
          await tx.athleteMemoryEvent.create({
            data: {
              userId: input.userId,
              factId: target.id,
              evidenceId: evidence.id,
              jobId: input.jobId,
              operation: 'CORROBORATE',
              beforeJson: json(before),
              afterJson: json(snapshot(updated)),
              reasonCode: operation.reasonCode,
              model: input.model,
              policyVersion: input.policyVersion,
              idempotencyKey,
            },
          });
          applied += 1;
          continue;
        }

        if (
          operation.operation === 'REFINE' ||
          operation.operation === 'SUPERSEDE'
        ) {
          const replacement = operation.replacement;
          if (!replacement) {
            throw new MemoryValidationError('Replacement is required');
          }
          if (operation.operation === 'REFINE') {
            const updatedCount = await tx.athleteMemoryFact.updateMany({
              where: {
                id: target.id,
                userId: input.userId,
                version: target.version,
              },
              data: {
                ...candidateData(replacement, input.assertedAt, input.timezone),
                version: { increment: 1 },
              },
            });
            if (updatedCount.count !== 1) {
              throw new MemoryValidationError('Fact version conflict');
            }
            const updated = await tx.athleteMemoryFact.findUniqueOrThrow({
              where: { id: target.id },
            });
            const evidence = await tx.athleteMemoryEvidence.create({
              data: {
                userId: input.userId,
                factId: target.id,
                sourceType: 'AI_COACH_MESSAGE',
                sourceMessageId: input.sourceMessageId,
                assertedAt: input.assertedAt,
                sourceHash: input.sourceHash,
              },
            });
            await tx.athleteMemoryEvent.create({
              data: {
                userId: input.userId,
                factId: target.id,
                evidenceId: evidence.id,
                jobId: input.jobId,
                operation: 'REFINE',
                beforeJson: json(before),
                afterJson: json(snapshot(updated)),
                reasonCode: operation.reasonCode,
                model: input.model,
                policyVersion: input.policyVersion,
                idempotencyKey,
              },
            });
            applied += 1;
            continue;
          }

          const next = await tx.athleteMemoryFact.create({
            data: {
              userId: input.userId,
              ...candidateData(replacement, input.assertedAt, input.timezone),
            },
          });
          const evidence = await tx.athleteMemoryEvidence.create({
            data: {
              userId: input.userId,
              factId: next.id,
              sourceType: 'AI_COACH_MESSAGE',
              sourceMessageId: input.sourceMessageId,
              assertedAt: input.assertedAt,
              sourceHash: input.sourceHash,
            },
          });
          const changed = await tx.athleteMemoryFact.updateMany({
            where: {
              id: target.id,
              userId: input.userId,
              version: target.version,
            },
            data: {
              status: 'SUPERSEDED',
              supersededById: next.id,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) {
            throw new MemoryValidationError('Fact version conflict');
          }
          const updated = await tx.athleteMemoryFact.findUniqueOrThrow({
            where: { id: target.id },
          });
          await tx.athleteMemoryEvent.create({
            data: {
              userId: input.userId,
              factId: target.id,
              evidenceId: evidence.id,
              jobId: input.jobId,
              operation: 'SUPERSEDE',
              beforeJson: json(before),
              afterJson: json({ ...snapshot(updated), replacementId: next.id }),
              reasonCode: operation.reasonCode,
              model: input.model,
              policyVersion: input.policyVersion,
              idempotencyKey,
            },
          });
          await tx.athleteMemoryEvent.create({
            data: {
              userId: input.userId,
              factId: next.id,
              evidenceId: evidence.id,
              jobId: input.jobId,
              operation: 'CREATE',
              afterJson: json(snapshot(next)),
              reasonCode: operation.reasonCode,
              model: input.model,
              policyVersion: input.policyVersion,
              idempotencyKey: `${idempotencyKey}:replacement`,
            },
          });
          applied += 1;
          continue;
        }

        const status =
          operation.operation === 'RESOLVE' ? 'RESOLVED' : 'RETRACTED';
        const changed = await tx.athleteMemoryFact.updateMany({
          where: {
            id: target.id,
            userId: input.userId,
            version: target.version,
          },
          data: { status, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          throw new MemoryValidationError('Fact version conflict');
        }
        const updated = await tx.athleteMemoryFact.findUniqueOrThrow({
          where: { id: target.id },
        });
        const evidence = await tx.athleteMemoryEvidence.create({
          data: {
            userId: input.userId,
            factId: target.id,
            sourceType: 'AI_COACH_MESSAGE',
            sourceMessageId: input.sourceMessageId,
            assertedAt: input.assertedAt,
            sourceHash: input.sourceHash,
          },
        });
        await tx.athleteMemoryEvent.create({
          data: {
            userId: input.userId,
            factId: target.id,
            evidenceId: evidence.id,
            jobId: input.jobId,
            operation: eventOperation(operation.operation),
            beforeJson: json(before),
            afterJson: json(snapshot(updated)),
            reasonCode: operation.reasonCode,
            model: input.model,
            policyVersion: input.policyVersion,
            idempotencyKey,
          },
        });
        applied += 1;
      }

      const completed = await tx.aiCoachMemoryExtractionJob.updateMany({
        where: {
          id: input.jobId,
          userId: input.userId,
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
        },
        data: {
          status: 'SUCCEEDED',
          decisionJson: json(input.decision),
          model: input.model,
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          nextRetryAt: null,
        },
      });
      if (completed.count !== 1) {
        throw new MemoryValidationError('Extraction job lease was lost');
      }
      return { applied, idempotent: false };
    });
  }

  async findFacts(input: StoreSearchInput): Promise<MemoryFactRecord[]> {
    return this.prisma.athleteMemoryFact.findMany({
      where: {
        userId: input.userId,
        status: { in: input.statuses as AthleteMemoryStatus[] },
        ...(input.categories?.length
          ? { category: { in: input.categories } }
          : {}),
        ...(input.eventFrom || input.eventTo
          ? {
              AND: [
                ...(input.eventFrom
                  ? [
                      {
                        OR: [
                          { eventEnd: { gte: input.eventFrom } },
                          {
                            eventEnd: null,
                            eventStart: { gte: input.eventFrom },
                          },
                        ],
                      },
                    ]
                  : []),
                ...(input.eventTo
                  ? [{ eventStart: { lte: input.eventTo } }]
                  : []),
              ],
            }
          : {}),
        ...(input.query?.trim()
          ? {
              OR: [
                {
                  claim: { contains: input.query.trim(), mode: 'insensitive' },
                },
                {
                  category: {
                    contains: input.query.trim(),
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        evidence: {
          select: {
            id: true,
            sourceMessageId: true,
            assertedAt: true,
            createdAt: true,
          },
          orderBy: { assertedAt: 'desc' },
          take: 4,
        },
      },
      orderBy: [{ relevanceAnchorAt: 'desc' }, { id: 'desc' }],
      take: input.take,
    }) as unknown as Promise<MemoryFactRecord[]>;
  }

  async listFacts(input: {
    userId: string;
    take: number;
    cursor?: string;
  }): Promise<MemoryFactRecord[]> {
    if (input.cursor) {
      // Prisma accepts a globally unique cursor even when it belongs to a row
      // outside the current tenant filter. Reject it first so another user's
      // row cannot influence pagination or become an existence oracle.
      const ownedCursor = await this.prisma.athleteMemoryFact.findFirst({
        where: { id: input.cursor, userId: input.userId },
        select: { id: true },
      });
      if (!ownedCursor) {
        throw new MemoryIsolationError('Memory cursor is invalid');
      }
    }
    return this.prisma.athleteMemoryFact.findMany({
      where: { userId: input.userId },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        evidence: {
          select: {
            id: true,
            sourceMessageId: true,
            assertedAt: true,
            createdAt: true,
          },
          orderBy: { assertedAt: 'desc' },
          take: 4,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.take,
    }) as unknown as Promise<MemoryFactRecord[]>;
  }

  async correctFact(input: {
    userId: string;
    factId: string;
    expectedVersion: number;
    claim: string;
    category?: string;
  }): Promise<MemoryFactRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.athleteMemoryFact.findFirst({
        where: { id: input.factId, userId: input.userId },
      });
      if (!existing) throw new MemoryValidationError('Memory fact not found');
      // 历史节点可能已有新的 replacement。直接把它改回 ACTIVE 会制造两个
      // 相互矛盾的当前事实，因此管理端更正只接受当前活动节点。
      if (existing.status !== AthleteMemoryStatus.ACTIVE) {
        throw new MemoryValidationError(
          'Only active memory facts can be corrected',
        );
      }
      const changed = await tx.athleteMemoryFact.updateMany({
        where: {
          id: input.factId,
          userId: input.userId,
          version: input.expectedVersion,
          status: AthleteMemoryStatus.ACTIVE,
        },
        data: {
          claim: input.claim,
          ...(input.category ? { category: input.category } : {}),
          epistemicStatus: AthleteMemoryEpistemicStatus.USER_CONFIRMED,
          confidence: 1,
          status: 'ACTIVE',
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new MemoryValidationError('Fact version conflict');
      }
      const updated = await tx.athleteMemoryFact.findUniqueOrThrow({
        where: { id: input.factId },
      });
      await tx.athleteMemoryEvent.create({
        data: {
          userId: input.userId,
          factId: input.factId,
          operation: 'USER_CORRECT',
          beforeJson: json(snapshot(existing)),
          afterJson: json(snapshot(updated)),
          reasonCode: 'USER_CORRECTION',
          policyVersion: 'user-management-v1',
          idempotencyKey: `user-correct:${input.factId}:${updated.version}`,
        },
      });
      return updated as unknown as MemoryFactRecord;
    });
  }

  async deleteFact(input: { userId: string; factId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const fact = await tx.athleteMemoryFact.findFirst({
        where: { id: input.factId, userId: input.userId },
        select: {
          id: true,
          status: true,
          events: {
            where: { jobId: { not: null } },
            select: { jobId: true },
          },
        },
      });
      if (!fact) return false;

      const jobIds = [
        ...new Set(
          fact.events.flatMap((event) =>
            event.jobId === null ? [] : [event.jobId],
          ),
        ),
      ];

      // 删除当前 replacement 时，仍有独立 Evidence（或用户显式更正）的
      // predecessor 应恢复为当前事实；否则它会被外键置空后永久卡在
      // SUPERSEDED。删除历史链中间节点时不恢复，避免与现有 head 冲突。
      if (fact.status === AthleteMemoryStatus.ACTIVE) {
        const predecessors = await tx.athleteMemoryFact.findMany({
          where: {
            userId: input.userId,
            status: AthleteMemoryStatus.SUPERSEDED,
            supersededById: fact.id,
            OR: [
              { evidence: { some: {} } },
              { events: { some: { operation: 'USER_CORRECT' } } },
            ],
          },
        });
        for (const predecessor of predecessors) {
          const restored = await tx.athleteMemoryFact.updateMany({
            where: {
              id: predecessor.id,
              userId: input.userId,
              status: AthleteMemoryStatus.SUPERSEDED,
              supersededById: fact.id,
              version: predecessor.version,
            },
            data: {
              status: AthleteMemoryStatus.ACTIVE,
              supersededById: null,
              version: { increment: 1 },
            },
          });
          if (restored.count !== 1) {
            throw new MemoryValidationError('Fact version conflict');
          }
          const current = await tx.athleteMemoryFact.findUniqueOrThrow({
            where: { id: predecessor.id },
          });
          await tx.athleteMemoryEvent.create({
            data: {
              userId: input.userId,
              factId: predecessor.id,
              operation: 'REACTIVATE',
              beforeJson: json(snapshot(predecessor)),
              afterJson: json(snapshot(current)),
              reasonCode: 'USER_DELETED_SUPERSEDING_FACT',
              policyVersion: 'user-management-v1',
              idempotencyKey: `user-delete-reactivate:${fact.id}:${predecessor.id}:${current.version}`,
            },
          });
        }
      }

      // 用户删除是物理删除：级联清理该事实的 Evidence/Event。产生该事实的
      // Job.decisionJson 也可能复述用户内容，因此一起删除，而不是残留一份
      // 看不见但仍可恢复的 Memory 派生数据。
      await tx.athleteMemoryFact.delete({ where: { id: fact.id } });
      if (jobIds.length > 0) {
        await tx.aiCoachMemoryExtractionJob.deleteMany({
          where: { userId: input.userId, id: { in: jobIds } },
        });
      }
      return true;
    });
  }

  async deleteAllForUser(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Job decisionJson is Memory-derived user data too. clearHistory keeps
      // the Coach transcript but removes every Memory projection, provenance,
      // audit row and extraction decision owned by this capability.
      const deleted = await tx.athleteMemoryFact.deleteMany({
        where: { userId },
      });
      await tx.aiCoachMemoryExtractionJob.deleteMany({ where: { userId } });
      return deleted.count;
    });
  }

  async retractSources(
    input: {
      userId: string;
      sourceMessageIds: string[];
      policyVersion: string;
    },
    transaction?: Prisma.TransactionClient,
  ) {
    if (input.sourceMessageIds.length === 0) return 0;
    const retract = async (tx: Prisma.TransactionClient) => {
      const evidence = await tx.athleteMemoryEvidence.findMany({
        where: {
          userId: input.userId,
          sourceMessageId: { in: input.sourceMessageIds },
        },
        select: { id: true, factId: true, sourceMessageId: true },
      });
      let retracted = 0;
      for (const item of evidence) {
        await tx.athleteMemoryEvidence.deleteMany({
          where: { id: item.id, userId: input.userId },
        });
        const remaining = await tx.athleteMemoryEvidence.count({
          where: { factId: item.factId, userId: input.userId },
        });
        const fact = await tx.athleteMemoryFact.findFirst({
          where: { id: item.factId, userId: input.userId },
        });
        if (!fact) continue;

        // A correction made in the Memory management UI is independent user
        // authority. Removing the original conversation must not erase the
        // corrected fact merely because its chat evidence has disappeared.
        const hasUserCorrection =
          (await tx.athleteMemoryEvent.count({
            where: {
              userId: input.userId,
              factId: fact.id,
              operation: 'USER_CORRECT',
            },
          })) > 0;
        const updated = await tx.athleteMemoryFact.update({
          where: { id: fact.id },
          data: {
            ...(hasUserCorrection
              ? {}
              : remaining === 0
                ? { status: AthleteMemoryStatus.RETRACTED }
                : { confidence: Math.max(0.1, fact.confidence - 0.1) }),
            version: { increment: 1 },
          },
        });
        await tx.athleteMemoryEvent.create({
          data: {
            userId: input.userId,
            factId: fact.id,
            operation: 'RETRACT',
            beforeJson: json(snapshot(fact)),
            afterJson: json(snapshot(updated)),
            reasonCode: hasUserCorrection
              ? 'SOURCE_REMOVED_USER_CORRECTION_RETAINED'
              : remaining === 0
                ? 'SOURCE_REMOVED'
                : 'SOURCE_EVIDENCE_REMOVED',
            policyVersion: input.policyVersion,
            idempotencyKey: `source-retract:${item.id}`,
          },
        });

        // SUPERSEDE is reversible provenance, not destructive replacement. If
        // the current replacement loses its last source, restore predecessors
        // that still have independent evidence. Only an ACTIVE replacement can
        // be the current head; historical links in a longer chain stay intact.
        if (
          !hasUserCorrection &&
          remaining === 0 &&
          fact.status === AthleteMemoryStatus.ACTIVE
        ) {
          const predecessors = await tx.athleteMemoryFact.findMany({
            where: {
              userId: input.userId,
              status: AthleteMemoryStatus.SUPERSEDED,
              supersededById: fact.id,
              evidence: { some: {} },
            },
          });
          for (const predecessor of predecessors) {
            const restored = await tx.athleteMemoryFact.updateMany({
              where: {
                id: predecessor.id,
                userId: input.userId,
                status: AthleteMemoryStatus.SUPERSEDED,
                supersededById: fact.id,
                version: predecessor.version,
              },
              data: {
                status: AthleteMemoryStatus.ACTIVE,
                supersededById: null,
                version: { increment: 1 },
              },
            });
            if (restored.count !== 1) {
              throw new MemoryValidationError('Fact version conflict');
            }
            const current = await tx.athleteMemoryFact.findUniqueOrThrow({
              where: { id: predecessor.id },
            });
            await tx.athleteMemoryEvent.create({
              data: {
                userId: input.userId,
                factId: predecessor.id,
                operation: 'REACTIVATE',
                beforeJson: json(snapshot(predecessor)),
                afterJson: json(snapshot(current)),
                reasonCode: 'SUPERSEDING_SOURCE_REMOVED',
                policyVersion: input.policyVersion,
                idempotencyKey: `source-reactivate:${item.id}:${predecessor.id}`,
              },
            });
          }
        }
        retracted += 1;
      }

      // 编辑/删除来源消息时，旧任务即使尚未产出 Evidence，也可能已经在
      // decisionJson 中保存了提取结果。按来源清掉任务，避免旧判定残留，
      // 同时让仍在运行的过期 worker 在提交前因找不到租约而安全退出。
      await tx.aiCoachMemoryExtractionJob.deleteMany({
        where: {
          userId: input.userId,
          sourceMessageId: { in: input.sourceMessageIds },
        },
      });
      return retracted;
    };
    return transaction
      ? retract(transaction)
      : this.prisma.$transaction(retract);
  }

  async exportForUser(userId: string) {
    return this.prisma.athleteMemoryFact.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        kind: true,
        category: true,
        claim: true,
        value: true,
        status: true,
        epistemicStatus: true,
        confidence: true,
        eventStart: true,
        eventEnd: true,
        timeText: true,
        timePrecision: true,
        timezone: true,
        validFrom: true,
        validUntil: true,
        decayProfile: true,
        reviewAfter: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        evidence: {
          select: {
            sourceType: true,
            assertedAt: true,
            createdAt: true,
          },
        },
        events: {
          select: {
            operation: true,
            reasonCode: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
