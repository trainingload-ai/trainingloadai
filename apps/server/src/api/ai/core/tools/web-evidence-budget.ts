import type { AiToolContext } from '../tool.types';
import type { WebEvidenceFailure } from '../web-evidence.gateway';

const MAX_SEARCH_CALLS_PER_TURN = 3;
const MAX_FETCH_CALLS_PER_TURN = 3;

export function consumeWebEvidenceBudget(
  ctx: AiToolContext,
  operation: 'search' | 'fetch',
): WebEvidenceFailure | null {
  const budget = (ctx.webEvidenceBudget ??= { searchCalls: 0, fetchCalls: 0 });
  const key = operation === 'search' ? 'searchCalls' : 'fetchCalls';
  const limit =
    operation === 'search'
      ? MAX_SEARCH_CALLS_PER_TURN
      : MAX_FETCH_CALLS_PER_TURN;
  if (budget[key] >= limit) {
    return {
      ok: false,
      error: `The per-turn ${operation} limit has been reached. Use the evidence already collected.`,
      code: 'WEB_SEARCH_RATE_LIMITED',
      retryable: false,
    };
  }
  budget[key] += 1;
  return null;
}
