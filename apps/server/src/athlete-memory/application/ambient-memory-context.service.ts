import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ATHLETE_MEMORY_STORE,
  type AthleteMemoryStore,
  type MemoryFactRecord,
} from './ports/athlete-memory-store';
import {
  calculateDirectImpact,
  canEnterAmbient,
  memoryLifecycle,
} from '../domain/memory-decay-policy';
import type { MemoryDecayProfile } from '../domain/memory-operation';
import { AthleteMemoryPreferenceService } from './athlete-memory-preference.service';

export type AmbientMemoryItem = {
  id: string;
  kind: string;
  category: string;
  claim: string;
  eventStart: string | null;
  eventEnd: string | null;
  assertedAt: string | null;
  directImpact: number;
  epistemicStatus: string;
  lifecycle: string;
};

export type AmbientMemoryContext = {
  asOf: string;
  timezone: string;
  items: AmbientMemoryItem[];
  estimatedTokens: number;
  truncated: boolean;
  unavailable?: boolean;
};

const HEALTH_CATEGORIES = new Set([
  'sleep_quality',
  'sleep_duration',
  'fatigue',
  'recovery',
  'pain',
  'illness',
  'stress',
  'mood',
  'nutrition',
  'hydration',
]);

function authorityWeight(status: string) {
  if (status === 'USER_CONFIRMED') return 1;
  if (status === 'USER_ASSERTED') return 0.95;
  if (status === 'SYSTEM_DERIVED') return 0.8;
  return 0.45;
}

function decayInput(fact: MemoryFactRecord, asOf: Date) {
  return {
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
}

function conservativeTokenEstimate(value: unknown) {
  // The configured provider may tokenize CJK and emoji very differently from
  // ASCII. Count non-ASCII code points much more conservatively than the usual
  // English chars/4 estimate; the separate item/claim/character caps remain
  // the final hard guards if a provider tokenizer behaves unusually.
  let ascii = 0;
  let nonAscii = 0;
  for (const character of JSON.stringify(value)) {
    if (character.codePointAt(0) <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.ceil(ascii / 4) + nonAscii * 2;
}

/** 构建每轮只读取一次的短期 Memory 快照；失败时降级为空，不阻断 Coach。 */
@Injectable()
export class AmbientMemoryContextService {
  private readonly logger = new Logger(AmbientMemoryContextService.name);

  constructor(
    @Inject(ATHLETE_MEMORY_STORE)
    private readonly store: AthleteMemoryStore,
    private readonly preferences: AthleteMemoryPreferenceService,
  ) {}

  async build(input: {
    userId: string;
    asOf: Date;
    timezone: string;
    maxItems?: number;
    maxTokens?: number;
  }): Promise<AmbientMemoryContext> {
    const empty = {
      asOf: input.asOf.toISOString(),
      timezone: input.timezone,
      items: [],
      estimatedTokens: 0,
      truncated: false,
    };
    if (!(await this.preferences.isEnabled(input.userId))) return empty;
    try {
      const facts = await this.store.findFacts({
        userId: input.userId,
        statuses: ['ACTIVE'],
        take: 200,
      });
      const maxItems = Math.min(Math.max(input.maxItems ?? 8, 1), 12);
      const maxTokens = Math.min(
        Math.max(input.maxTokens ?? 1_000, 200),
        2_000,
      );
      const ranked = facts
        .filter(
          (fact) =>
            !(
              fact.epistemicStatus === 'MODEL_INFERRED' &&
              HEALTH_CATEGORIES.has(fact.category)
            ),
        )
        .map((fact) => {
          const decay = decayInput(fact, input.asOf);
          return {
            fact,
            impact: calculateDirectImpact(decay),
            lifecycle: memoryLifecycle(decay),
            ambient: canEnterAmbient(decay),
          };
        })
        .filter((candidate) => candidate.ambient)
        .sort(
          (a, b) =>
            b.impact - a.impact ||
            b.fact.relevanceAnchorAt.getTime() -
              a.fact.relevanceAnchorAt.getTime(),
        );
      const items: AmbientMemoryItem[] = [];
      let estimatedTokens = 0;
      for (const candidate of ranked) {
        if (items.length >= maxItems) break;
        const assertedAt = candidate.fact.evidence?.[0]?.assertedAt ?? null;
        const item: AmbientMemoryItem = {
          id: candidate.fact.id,
          kind: candidate.fact.kind,
          category: candidate.fact.category,
          claim: candidate.fact.claim,
          eventStart: candidate.fact.eventStart?.toISOString() ?? null,
          eventEnd: candidate.fact.eventEnd?.toISOString() ?? null,
          assertedAt: assertedAt?.toISOString() ?? null,
          directImpact: Number(candidate.impact.toFixed(4)),
          epistemicStatus: candidate.fact.epistemicStatus,
          lifecycle: candidate.lifecycle,
        };
        const tokens = conservativeTokenEstimate(item);
        if (estimatedTokens + tokens > maxTokens) break;
        items.push(item);
        estimatedTokens += tokens;
      }
      return {
        ...empty,
        items,
        estimatedTokens,
        truncated: items.length < ranked.length,
      };
    } catch (error) {
      this.logger.warn(
        `Ambient memory unavailable user=${input.userId} error=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { ...empty, unavailable: true };
    }
  }
}
