import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ATHLETE_MEMORY_STORE,
  type AthleteMemoryStore,
} from './ports/athlete-memory-store';
import { validateMemoryOperations } from './memory-operation-validator';
import type { MemoryOperation } from '../domain/memory-operation';
import type { Prisma } from '@prisma/client';
import { emitAthleteMemoryChanged } from '../domain/athlete-memory.events';

@Injectable()
export class ApplyMemoryOperationsService {
  constructor(
    @Inject(ATHLETE_MEMORY_STORE)
    private readonly store: AthleteMemoryStore,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  validateDecision(input: {
    raw: unknown;
    assertedAt: Date;
    timezone: string;
  }): MemoryOperation[] {
    return validateMemoryOperations(input);
  }

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
  }) {
    if (
      input.operations.some(
        (operation) =>
          operation.operation === 'IGNORE' ||
          operation.operation === 'NEEDS_LOOKUP',
      )
    ) {
      throw new Error('Non-applying Memory operations cannot enter apply');
    }
    const result = await this.store.applyOperations(input);
    if (!result.idempotent && result.applied > 0) {
      await emitAthleteMemoryChanged(this.events, {
        userId: input.userId,
        change: 'CREATED',
        sourceMessageId: input.sourceMessageId,
      });
    }
    return result;
  }

  async retractEvidence(
    input: {
      userId: string;
      sourceMessageIds: string[];
      policyVersion: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    // Passing the caller's transaction is intentional for message edit/delete:
    // the source mutation and provenance retraction are one consistency unit.
    const retracted = await this.store.retractSources(input, tx);
    // A caller-provided transaction may still roll back after this method.
    // Transactional callers should emit their own post-commit invalidation;
    // direct calls are safe to publish here.
    if (!tx && retracted > 0) {
      await emitAthleteMemoryChanged(this.events, {
        userId: input.userId,
        change: 'RETRACTED',
      });
    }
    return retracted;
  }
}
