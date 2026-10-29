import type {
  MemoryCategory,
  MemoryOperation,
} from '../../domain/memory-operation';
import type { Prisma } from '@prisma/client';

export const ATHLETE_MEMORY_STORE = Symbol('athlete-memory.store');

export type MemoryFactRecord = {
  id: string;
  userId: string;
  kind: string;
  category: string;
  claim: string;
  value?: unknown;
  status: string;
  epistemicStatus: string;
  confidence: number;
  eventStart: Date | null;
  eventEnd: Date | null;
  timeText: string | null;
  timePrecision: string;
  timezone: string;
  validFrom: Date | null;
  validUntil: Date | null;
  decayProfile: string;
  relevanceAnchorAt: Date;
  reviewAfter: Date | null;
  supersededById: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  evidence?: Array<{
    id: string;
    sourceMessageId: string;
    assertedAt: Date;
    createdAt: Date;
  }>;
};

export type StoreSearchInput = {
  userId: string;
  statuses: string[];
  categories?: MemoryCategory[];
  eventFrom?: Date;
  eventTo?: Date;
  query?: string;
  take: number;
};

export interface AthleteMemoryStore {
  applyOperations(input: {
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
  }): Promise<{ applied: number; idempotent: boolean }>;
  findFacts(input: StoreSearchInput): Promise<MemoryFactRecord[]>;
  listFacts(input: {
    userId: string;
    take: number;
    cursor?: string;
  }): Promise<MemoryFactRecord[]>;
  correctFact(input: {
    userId: string;
    factId: string;
    expectedVersion: number;
    claim: string;
    category?: MemoryCategory;
  }): Promise<MemoryFactRecord>;
  deleteFact(input: { userId: string; factId: string }): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<number>;
  retractSources(
    input: {
      userId: string;
      sourceMessageIds: string[];
      policyVersion: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
  exportForUser(userId: string): Promise<unknown>;
}
