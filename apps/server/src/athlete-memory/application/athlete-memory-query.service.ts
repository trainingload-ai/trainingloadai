import { Inject, Injectable } from '@nestjs/common';
import {
  ATHLETE_MEMORY_STORE,
  type AthleteMemoryStore,
  type MemoryFactRecord,
} from './ports/athlete-memory-store';
import { AmbientMemoryContextService } from './ambient-memory-context.service';
import { AthleteMemoryPreferenceService } from './athlete-memory-preference.service';
import {
  calculateDirectImpact,
  memoryLifecycle,
} from '../domain/memory-decay-policy';
import { lexicalRelevance } from '../domain/memory-relevance';
import type {
  MemoryCategory,
  MemoryDecayProfile,
} from '../domain/memory-operation';

export type MemorySearchInput = {
  userId: string;
  intent: string;
  query: string;
  categories?: MemoryCategory[];
  eventFrom?: Date;
  eventTo?: Date;
  mode: 'CURRENT' | 'HISTORICAL' | 'TIMELINE';
  includeResolved?: boolean;
  limit?: number;
  asOf?: Date;
};

function authorityWeight(status: string) {
  if (status === 'USER_CONFIRMED') return 1;
  if (status === 'USER_ASSERTED') return 0.95;
  if (status === 'SYSTEM_DERIVED') return 0.8;
  return 0.45;
}

function score(fact: MemoryFactRecord, input: MemorySearchInput) {
  const asOf = input.asOf ?? new Date();
  const decay = {
    profile: fact.decayProfile as MemoryDecayProfile,
    asOf,
    relevanceAnchorAt: fact.relevanceAnchorAt,
    validFrom: fact.validFrom,
    validUntil: fact.validUntil,
    reviewAfter: fact.reviewAfter,
    confidence: fact.confidence,
    authorityWeight: authorityWeight(fact.epistemicStatus),
    active: fact.status === 'ACTIVE',
  };
  const directImpact = calculateDirectImpact(decay);
  const relevance = lexicalRelevance(
    `${input.intent} ${input.query}`,
    fact.claim,
    fact.category,
    fact.kind,
  );
  const total =
    input.mode === 'CURRENT'
      ? relevance * 0.35 + directImpact * 0.45 + fact.confidence * 0.2
      : relevance * 0.6 + directImpact * 0.1 + fact.confidence * 0.3;
  return {
    fact,
    score: total,
    directImpact,
    lifecycle: memoryLifecycle(decay),
  };
}

/**
 * 统一当前/历史查询的排序与可见性。Ambient 走专用服务，显式搜索和
 * Judge 候选共用同一套用户隔离、生命周期与结果上限。
 */
@Injectable()
export class AthleteMemoryQueryService {
  constructor(
    @Inject(ATHLETE_MEMORY_STORE)
    private readonly store: AthleteMemoryStore,
    private readonly ambient: AmbientMemoryContextService,
    private readonly preferences: AthleteMemoryPreferenceService,
  ) {}

  searchEnabled() {
    return true;
  }

  buildAmbientContext(input: {
    userId: string;
    asOf: Date;
    timezone: string;
    maxItems?: number;
    maxTokens?: number;
  }) {
    return this.ambient.build(input);
  }

  async search(input: MemorySearchInput) {
    if (!(await this.preferences.isEnabled(input.userId))) {
      return {
        items: [],
        truncated: false,
        unavailable: false,
        disabled: true,
      };
    }
    return this.searchInternal(input);
  }

  async findJudgeCandidates(input: Omit<MemorySearchInput, 'mode'>) {
    return this.searchInternal({
      ...input,
      mode: 'TIMELINE',
      includeResolved: true,
    });
  }

  private async searchInternal(input: MemorySearchInput) {
    const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
    // CURRENT is the decision-time projection. HISTORICAL/TIMELINE can opt in
    // to resolved and superseded facts; RETRACTED facts are never model-visible
    // because their provenance has been withdrawn.
    const statuses =
      input.mode === 'CURRENT'
        ? ['ACTIVE']
        : input.includeResolved
          ? ['ACTIVE', 'RESOLVED', 'SUPERSEDED']
          : ['ACTIVE'];
    const facts = await this.store.findFacts({
      userId: input.userId,
      statuses,
      categories: input.categories,
      eventFrom: input.eventFrom,
      eventTo: input.eventTo,
      take: 200,
    });
    const ranked = facts
      .map((fact) => score(fact, input))
      .filter(
        (candidate) =>
          input.mode !== 'CURRENT' ||
          (candidate.fact.status === 'ACTIVE' &&
            candidate.directImpact >= 0.08),
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.fact.relevanceAnchorAt.getTime() -
            a.fact.relevanceAnchorAt.getTime(),
      );
    const items = [] as Array<Record<string, unknown>>;
    let chars = 0;
    const maxChars = 8_000;
    for (const candidate of ranked) {
      if (items.length >= limit) break;
      const item = {
        id: candidate.fact.id,
        version: candidate.fact.version,
        kind: candidate.fact.kind,
        category: candidate.fact.category,
        claim: candidate.fact.claim,
        value: candidate.fact.value ?? null,
        status: candidate.fact.status,
        lifecycle: candidate.lifecycle,
        eventStart: candidate.fact.eventStart?.toISOString() ?? null,
        eventEnd: candidate.fact.eventEnd?.toISOString() ?? null,
        assertedAt:
          candidate.fact.evidence?.[0]?.assertedAt.toISOString() ?? null,
        validFrom: candidate.fact.validFrom?.toISOString() ?? null,
        validUntil: candidate.fact.validUntil?.toISOString() ?? null,
        epistemicStatus: candidate.fact.epistemicStatus,
        confidence: candidate.fact.confidence,
        directImpact: Number(candidate.directImpact.toFixed(4)),
        score: Number(candidate.score.toFixed(4)),
      };
      const size = JSON.stringify(item).length;
      if (chars + size > maxChars) break;
      items.push(item);
      chars += size;
    }
    return {
      items,
      truncated: items.length < ranked.length,
      unavailable: false,
    };
  }
}
