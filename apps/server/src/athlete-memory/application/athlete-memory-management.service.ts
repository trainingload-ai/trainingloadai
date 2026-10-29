import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ATHLETE_MEMORY_STORE,
  type AthleteMemoryStore,
  type MemoryFactRecord,
} from './ports/athlete-memory-store';
import { assertSafeMemoryClaim } from './memory-operation-validator';
import {
  MEMORY_CATEGORIES,
  type MemoryCategory,
} from '../domain/memory-operation';
import { MemoryValidationError } from '../domain/memory-time';
import { AthleteMemoryPreferenceService } from './athlete-memory-preference.service';
import { emitAthleteMemoryChanged } from '../domain/athlete-memory.events';

function userVisibleFact(fact: MemoryFactRecord) {
  return {
    id: fact.id,
    kind: fact.kind,
    category: fact.category,
    claim: fact.claim,
    status: fact.status,
    epistemicStatus: fact.epistemicStatus,
    confidence: fact.confidence,
    eventStart: fact.eventStart,
    eventEnd: fact.eventEnd,
    timeText: fact.timeText,
    timePrecision: fact.timePrecision,
    timezone: fact.timezone,
    validFrom: fact.validFrom,
    validUntil: fact.validUntil,
    decayProfile: fact.decayProfile,
    reviewAfter: fact.reviewAfter,
    version: fact.version,
    createdAt: fact.createdAt,
    updatedAt: fact.updatedAt,
    evidence: fact.evidence?.map((item) => ({
      id: item.id,
      assertedAt: item.assertedAt,
      createdAt: item.createdAt,
    })),
  };
}

@Injectable()
export class AthleteMemoryManagementService {
  constructor(
    @Inject(ATHLETE_MEMORY_STORE)
    private readonly store: AthleteMemoryStore,
    private readonly preferences: AthleteMemoryPreferenceService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async listForUser(input: {
    userId: string;
    limit?: number;
    cursor?: string;
  }) {
    const take = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const rows = await this.store.listFacts({
      userId: input.userId,
      take: take + 1,
      cursor: input.cursor,
    });
    return {
      items: rows.slice(0, take).map(userVisibleFact),
      nextCursor: rows.length > take ? (rows[take - 1]?.id ?? null) : null,
    };
  }

  async correctByUser(input: {
    userId: string;
    factId: string;
    expectedVersion: number;
    claim: string;
    category?: string;
  }) {
    const category = input.category?.trim();
    if (category && !MEMORY_CATEGORIES.includes(category as MemoryCategory)) {
      throw new MemoryValidationError('Unsupported memory category');
    }
    const fact = await this.store.correctFact({
      userId: input.userId,
      factId: input.factId,
      expectedVersion: input.expectedVersion,
      claim: assertSafeMemoryClaim(input.claim),
      ...(category ? { category: category as MemoryCategory } : {}),
    });
    await emitAthleteMemoryChanged(this.events, {
      userId: input.userId,
      change: 'CORRECTED',
      factIds: [fact.id],
    });
    return userVisibleFact(fact);
  }

  async deleteByUser(input: { userId: string; factId: string }) {
    const deleted = await this.store.deleteFact(input);
    if (deleted) {
      await emitAthleteMemoryChanged(this.events, {
        userId: input.userId,
        change: 'DELETED',
        factIds: [input.factId],
      });
    }
    return deleted;
  }

  exportForUser(userId: string) {
    return this.store.exportForUser(userId);
  }

  async getPreference(userId: string) {
    return this.preferences.get(userId);
  }

  async setPreference(input: {
    userId: string;
    enabled: boolean;
    clearHistory?: boolean;
  }) {
    // Disable first. If physical cleanup fails, no future read/write occurs and
    // the user can safely retry clearHistory; the inverse order could delete
    // data while leaving the feature enabled after a settings-write failure.
    const preference = await this.preferences.set(input.userId, input.enabled);
    const deleted =
      !input.enabled && input.clearHistory
        ? await this.store.deleteAllForUser(input.userId)
        : 0;
    if (!input.enabled && input.clearHistory) {
      await emitAthleteMemoryChanged(this.events, {
        userId: input.userId,
        change: 'CLEARED',
      });
    }
    return { ...preference, deleted };
  }
}
