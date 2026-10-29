import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { getCoachDocByRef, searchCoachDocs } from '../docs-index';

describe('docs-index', () => {
  const originalFetch = global.fetch;

  function mockFetchOnce(body: unknown, ok = true, status = 200) {
    const text =
      typeof body === 'string' ? body : JSON.stringify(body ?? undefined);
    const fetchMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
    fetchMock.mockResolvedValueOnce({
      ok,
      status,
      statusText: ok ? 'OK' : 'Broken',
      json: async () => body,
      text: async () => text,
    });
    global.fetch = fetchMock as never;
    return fetchMock;
  }

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('searches docs, groups duplicate page hits, filters by section, and ranks by score', async () => {
    const fetchMock = mockFetchOnce([
      {
        type: 'heading',
        url: '/zh/docs/plan/build#steps',
        content: 'Build plan steps',
        contentWithHighlights: [
          { content: 'Build ', styles: {} },
          { content: 'plan' },
        ],
      },
      {
        type: 'page',
        url: '/zh/docs/plan/build',
        content: 'Plan Builder',
        contentWithHighlights: [{ content: 'Structured &amp; safe plan' }],
      },
      {
        type: 'page',
        url: '/zh/docs/account/billing',
        content: 'Billing',
      },
      {
        type: 'heading',
        url: 'http://127.0.0.1:3000/zh/docs/plan/build',
        content: 'Ignored lower score duplicate',
      },
    ]);

    await expect(
      searchCoachDocs({
        query: 'plan',
        locale: 'zh',
        topK: 5,
        section: 'plan',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: '/zh/docs/plan/build',
        title: 'Plan Builder',
        description: 'Structured &amp; safe plan',
        url: 'http://127.0.0.1:3000/zh/docs/plan/build',
        slug: 'plan/build',
        score: 70,
        snippet: 'Ignored lower score duplicate',
        sourcePath: 'http://127.0.0.1:3000/zh/docs/plan/build',
      }),
      expect.objectContaining({
        id: '/zh/docs/plan/build#steps',
        score: 20,
        snippet: 'Build plan',
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/search?query=plan&locale=zh',
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'trainingload-ai-coach/1.0',
        },
      },
    );
  });

  it('loads a doc by ref, strips unsafe markup, decodes body entities, and truncates content', async () => {
    const longBody = `Intro &amp; guide ${'x'.repeat(700)}`;
    const fetchMock = mockFetchOnce(`
      <html>
        <head>
          <title>Plan Docs</title>
          <meta name="description" content="How to build a plan">
          <style>.hidden{display:none}</style>
          <script>window.bad = true</script>
        </head>
        <body>
          <main>
            <h1>Plan</h1>
            <svg><text>icon</text></svg>
            <p>${longBody}</p>
          </main>
        </body>
      </html>
    `);

    const result = await getCoachDocByRef({
      ref: 'zh:plan/build',
      maxChars: 500,
    });

    expect(result).toMatchObject({
      id: '/zh/docs/plan/build',
      locale: 'zh',
      title: 'Plan Docs',
      description: 'How to build a plan',
      url: 'http://127.0.0.1:3000/zh/docs/plan/build',
      slug: 'plan/build',
      truncated: true,
      sourcePath: 'http://127.0.0.1:3000/zh/docs/plan/build',
    });
    expect(result.content).toHaveLength(500);
    expect(result.content).toContain('Intro & guide');
    expect(result.content).not.toContain('window.bad');
    expect(result.content).not.toContain('icon');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/zh/docs/plan/build',
      {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'trainingload-ai-coach/1.0',
        },
      },
    );
  });

  it('throws useful errors for missing refs and failed fetches', async () => {
    await expect(getCoachDocByRef({ ref: '' })).rejects.toThrow(
      'Missing docs ref',
    );

    mockFetchOnce({ error: 'nope' }, false, 500);
    await expect(
      searchCoachDocs({ query: 'x', locale: 'en', topK: 1 }),
    ).rejects.toThrow('Docs search request failed: 500 Broken');
  });
});
