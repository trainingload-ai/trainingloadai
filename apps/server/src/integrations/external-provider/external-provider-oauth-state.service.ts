import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { Prisma, ThirdPartyProvider } from '@prisma/client';
import { ExternalOAuthStateRepository } from './persistence/external-oauth-state.repository';
import {
  THIRD_PARTY_ERRORS,
  thirdPartyError,
} from './external-provider-errors';

const DEFAULT_TTL_MS = 10 * 60_000;

function hashOAuthState(state: string) {
  return createHash('sha256').update(state).digest('hex');
}

/**
 * One-time OAuth state store shared by provider adapters.
 *
 * The browser receives only the random state. The database stores its hash,
 * and consume() atomically marks it used before any token exchange starts.
 */
@Injectable()
export class ExternalProviderOAuthStateService {
  constructor(private readonly states: ExternalOAuthStateRepository) {}

  async issue(args: {
    userId: string;
    provider: ThirdPartyProvider;
    payload: Prisma.InputJsonValue;
    ttlMs?: number;
  }) {
    const now = new Date();
    await this.states.deleteMany({
      where: { provider: args.provider, expiresAt: { lt: now } },
    });
    const state = randomBytes(32).toString('base64url');
    await this.states.create({
      data: {
        userId: args.userId,
        provider: args.provider,
        stateHash: hashOAuthState(state),
        payload: args.payload,
        expiresAt: new Date(now.getTime() + (args.ttlMs ?? DEFAULT_TTL_MS)),
      },
    });
    return state;
  }

  async consume(provider: ThirdPartyProvider, state?: string | null) {
    if (!state) {
      throw thirdPartyError(THIRD_PARTY_ERRORS.COMMON.OAUTH_STATE_MISSING);
    }
    const now = new Date();
    const row = await this.states.findUnique({
      where: { stateHash: hashOAuthState(state) },
    });
    if (!row || row.provider !== provider || row.expiresAt <= now) {
      throw thirdPartyError(THIRD_PARTY_ERRORS.COMMON.OAUTH_STATE_INVALID);
    }
    if (row.consumedAt) {
      throw thirdPartyError(THIRD_PARTY_ERRORS.COMMON.OAUTH_STATE_USED);
    }
    const consumed = await this.states.updateMany({
      where: {
        id: row.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw thirdPartyError(THIRD_PARTY_ERRORS.COMMON.OAUTH_STATE_USED);
    }
    return row;
  }
}
