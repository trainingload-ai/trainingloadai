import { describe, expect, it, jest } from '@jest/globals';
import type { AiToolContext } from '../tool.types';
import { validateAiToolInput } from '../tool.types';
import { webSearchTool } from '../tools/webSearch.tool';
import { webFetchTool } from '../tools/webFetch.tool';

function context(): AiToolContext {
  return {
    webEvidence: {
      isAvailable: () => true,
      search: jest.fn(
        async (args: {
          query: string;
          count: number;
          signal: AbortSignal;
        }) => ({ ok: true as const, query: args.query, results: [] }),
      ),
      fetch: jest.fn(async (args: { url: string; signal: AbortSignal }) => ({
        ok: true as const,
        url: args.url,
        title: 'Page',
        content: 'Content',
        truncated: false,
      })),
    },
    prisma: {} as never,
    userService: {} as never,
    i18n: {} as never,
    coachTools: {} as never,
    coachActions: {} as never,
    planService: {} as never,
    planQuery: {} as never,
    planExecutionContext: {} as never,
    activityService: {} as never,
    workoutService: {} as never,
    workoutDefinitions: {} as never,
    pmc: {} as never,
    session: { user: { id: 'u1' } } as never,
    lang: 'zh',
    signal: new AbortController().signal,
  };
}

describe('web evidence tools', () => {
  it('rejects private account identifiers from search queries', async () => {
    await expect(
      validateAiToolInput(webSearchTool, context(), {
        query: 'lookup lkyrw00@gmail.com recent activity',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVATE_QUERY_REJECTED',
    });
  });

  it('rejects local and credential-bearing fetch URLs', async () => {
    await expect(
      validateAiToolInput(webFetchTool, context(), {
        url: 'http://127.0.0.1/admin',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    await expect(
      validateAiToolInput(webFetchTool, context(), {
        url: 'https://user:pass@example.com/page',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    await expect(
      validateAiToolInput(webFetchTool, context(), {
        url: 'http://[::ffff:127.0.0.1]/admin',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    await expect(
      validateAiToolInput(webFetchTool, context(), {
        url: 'http://service.internal/admin',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('enforces independent per-turn search and fetch budgets', async () => {
    const ctx = context();
    for (let index = 0; index < 3; index += 1) {
      await expect(
        webSearchTool.execute(ctx, { query: `query ${index}` }),
      ).resolves.toMatchObject({
        ok: true,
      });
    }
    await expect(
      webSearchTool.execute(ctx, { query: 'query 4' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'WEB_SEARCH_RATE_LIMITED',
    });
    await expect(
      webFetchTool.execute(ctx, { url: 'https://example.com/page' }),
    ).resolves.toMatchObject({ ok: true });
  });
});
