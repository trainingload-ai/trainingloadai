import { aiToolError, buildAiTool, type AiToolDef } from '../tool.types';

type Input = {
  query: string;
  locale?: 'zh' | 'en';
  topK?: number;
  section?: string;
};

type Output = {
  query: string;
  locale: 'zh' | 'en';
  items: Array<{
    id: string;
    title: string;
    description?: string;
    url: string;
    slug: string;
    score: number;
    snippet: string;
    sourcePath: string;
  }>;
};

export const docsSearchTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'docs.search',
  description:
    'Search official Trainingload.ai docs and metric guides. Use this for metric definitions, methodology, product rules, and FAQ-style explanations.',
  cost: 'low',
  searchHint: 'search official documentation',
  maxResultChars: 3_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'Search query for the official docs',
      },
      locale: {
        type: 'string',
        description: 'zh or en. Defaults from current chat language.',
      },
      topK: { type: 'number', description: 'Max results, default 5, max 8' },
      section: {
        type: 'string',
        description:
          'Optional docs section prefix, for example metrics/pmc or metrics/power',
      },
    },
  },
  validateInput: async (_ctx, input) =>
    String(input?.query ?? '').trim()
      ? { ok: true }
      : aiToolError('Missing docs query', 'INVALID_INPUT'),
  summarizeForModel: ({ output }) => ({
    query: output.query,
    locale: output.locale,
    itemCount: output.items.length,
    items: output.items.slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      url: item.url,
      slug: item.slug,
      score: item.score,
      snippet: item.snippet.slice(0, 180),
    })),
  }),
  execute: async (ctx, input) => ctx.coachTools.docsSearch(ctx, input),
});
