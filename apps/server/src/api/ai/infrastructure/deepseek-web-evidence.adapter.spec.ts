import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { DeepSeekWebEvidenceAdapter } from './deepseek-web-evidence.adapter';

const originalFetch = globalThis.fetch;
const originalEnv = {
  provider: process.env.AI_COACH_PROVIDER,
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  webBaseUrl: process.env.DEEPSEEK_WEB_BASE_URL,
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('DeepSeekWebEvidenceAdapter', () => {
  beforeEach(() => {
    process.env.AI_COACH_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'test-secret';
    process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
    delete process.env.DEEPSEEK_WEB_BASE_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv('AI_COACH_PROVIDER', originalEnv.provider);
    restoreEnv('DEEPSEEK_API_KEY', originalEnv.apiKey);
    restoreEnv('DEEPSEEK_BASE_URL', originalEnv.baseUrl);
    restoreEnv('DEEPSEEK_WEB_BASE_URL', originalEnv.webBaseUrl);
    jest.restoreAllMocks();
  });

  it('sends only the focused query and normalizes public search results', async () => {
    const fetchMock = jest.fn<typeof fetch>(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        query: '吴向东 马拉松 2020 成绩',
        count: 5,
        need_content: false,
      });
      expect(String(init?.body)).not.toContain('ori_question');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer test-secret',
      );
      return new Response(
        JSON.stringify({
          results: [
            {
              rerank_score: 2.8,
              title: 'Official result',
              url: 'https://worldathletics.org/competition/result',
              snippet: 'Result snippet',
              summary: 'Result summary',
              site_name: 'World Athletics',
              site_icon: null,
              date: '2020-12-06T00:00:00Z',
              authority: 4,
              content: '',
            },
            {
              title: 'Unsafe result',
              url: 'http://127.0.0.1/private',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    globalThis.fetch = fetchMock;

    const result = await new DeepSeekWebEvidenceAdapter().search({
      query: '吴向东 马拉松 2020 成绩',
      count: 5,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      ok: true,
      query: '吴向东 马拉松 2020 成绩',
      results: [
        {
          title: 'Official result',
          url: 'https://worldathletics.org/competition/result',
          snippet: 'Result snippet',
          summary: 'Result summary',
          siteName: 'World Athletics',
          publishedAt: '2020-12-06T00:00:00.000Z',
          authority: 4,
          rerankScore: 2.8,
        },
      ],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.deepseek.com/v1/tools/search',
    );
  });

  it('fetches a public page and caps the Markdown returned to the model', async () => {
    globalThis.fetch = jest.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            title: 'Official page',
            content: 'x'.repeat(20_000),
          }),
          { status: 200 },
        ),
    );

    const result = await new DeepSeekWebEvidenceAdapter().fetch({
      url: 'https://example.com/article',
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      ok: true,
      url: 'https://example.com/article',
      title: 'Official page',
      truncated: true,
    });
    if (result.ok) expect(result.content).toHaveLength(16_000);
  });

  it('maps rate limits to a safe retryable failure without exposing provider text', async () => {
    globalThis.fetch = jest.fn<typeof fetch>(
      async () =>
        new Response('{"error":{"message":"private provider detail"}}', {
          status: 429,
        }),
    );

    await expect(
      new DeepSeekWebEvidenceAdapter().search({
        query: 'latest marathon result',
        count: 3,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'Live web search is rate limited. Try again later.',
      code: 'WEB_SEARCH_RATE_LIMITED',
      retryable: true,
    });
  });

  it('is unavailable when the configured coach provider is not DeepSeek', () => {
    process.env.AI_COACH_PROVIDER = 'openrouter';
    expect(new DeepSeekWebEvidenceAdapter().isAvailable()).toBe(false);
  });
});
