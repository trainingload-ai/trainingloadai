import { aiToolError, buildAiTool, type AiToolDef } from '../tool.types';

type Input = {
  ref: string;
  locale?: 'zh' | 'en';
  maxChars?: number;
};

type Output = {
  id: string;
  locale: 'zh' | 'en';
  title: string;
  description?: string;
  url: string;
  slug: string;
  content: string;
  truncated: boolean;
  sourcePath: string;
};

export const docsGetTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'docs.get',
  description:
    'Get the content of an official Trainingload.ai docs page by docs id, slug, or URL.',
  cost: 'low',
  searchHint: 'read official docs page',
  maxResultChars: 3_500,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['ref'],
    properties: {
      ref: {
        type: 'string',
        description: 'Docs id, slug, or full URL returned by docs.search',
      },
      locale: {
        type: 'string',
        description: 'Optional locale override: zh or en',
      },
      maxChars: {
        type: 'number',
        description: 'Optional content cap, default 4000',
      },
    },
  },
  validateInput: async (_ctx, input) =>
    String(input?.ref ?? '').trim()
      ? { ok: true }
      : aiToolError('Missing docs ref', 'INVALID_INPUT'),
  summarizeForModel: ({ output, maxChars }) => ({
    id: output.id,
    locale: output.locale,
    title: output.title,
    description: output.description,
    url: output.url,
    slug: output.slug,
    truncated: output.truncated,
    contentExcerpt: output.content.slice(
      0,
      Math.max(400, Math.min(1200, maxChars - 1200)),
    ),
  }),
  execute: async (ctx, input) => ctx.coachTools.docsGet(ctx, input),
});
