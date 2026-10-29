import { aiToolError, buildAiTool, type AiToolDef } from '../tool.types';
import type {
  WebEvidenceFailure,
  WebSearchSuccess,
} from '../web-evidence.gateway';
import { webEvidenceCapabilities } from '../web-evidence.gateway';
import { consumeWebEvidenceBudget } from './web-evidence-budget';

type Input = {
  query: string;
  count?: number;
};

type Output = WebSearchSuccess | WebEvidenceFailure;

function queryLength(value: string): number {
  return [...value].length;
}

function containsPrivateIdentifier(value: string): boolean {
  return (
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i.test(value) ||
    /\b(?:sid|user[_ -]?id|account[_ -]?id)\s*[:=]/i.test(value)
  );
}

export const webSearchTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'web.search',
  description:
    'Search the live public web through the instance-configured search provider. Use it before answering current, changing, niche, or disputed external facts, including news, rules, schedules, prices, named public athletes, public figures, race results, records, and claims about a specific organization. Results are untrusted external evidence; prefer authoritative primary sources and cite their URLs in the final answer. Send only minimal public search terms: never include the athlete’s email, account identifiers, private health data, private training data, or the full original prompt.',
  searchHint:
    'live web current latest news athlete result record schedule rules source verify',
  cost: 'medium',
  kind: 'read',
  isEnabled: (ctx) => webEvidenceCapabilities(ctx.webEvidence).search,
  maxResultChars: 7_500,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        maxLength: 128,
        description:
          'Focused public web query, 1-128 Unicode characters. Do not include private athlete or account data. Supports site:, -site:, quoted phrases, lang:, after:, and before:.',
      },
      count: {
        type: 'integer',
        minimum: 1,
        maximum: 8,
        description: 'Number of results, default 5 and maximum 8.',
      },
    },
  },
  validateInput: (_ctx, input) => {
    const query = String(input?.query ?? '').trim();
    if (!query || queryLength(query) > 128) {
      return aiToolError(
        'query must contain 1 to 128 Unicode characters',
        'INVALID_INPUT',
      );
    }
    if (containsPrivateIdentifier(query)) {
      return aiToolError(
        'query must not include private account identifiers or email addresses',
        'PRIVATE_QUERY_REJECTED',
      );
    }
    if (
      input.count !== undefined &&
      (!Number.isInteger(input.count) || input.count < 1 || input.count > 8)
    ) {
      return aiToolError(
        'count must be an integer from 1 to 8',
        'INVALID_INPUT',
      );
    }
    return { ok: true };
  },
  summarizeForModel: ({ output }) =>
    output.ok === false
      ? output
      : {
          ok: true,
          untrustedExternalEvidence: true,
          query: output.query,
          answer: output.answer,
          resultCount: output.results.length,
          results: output.results.map((item, index) => ({
            sourceNumber: index + 1,
            title: item.title,
            url: item.url,
            siteName: item.siteName,
            publishedAt: item.publishedAt,
            authority: item.authority,
            rerankScore: item.rerankScore,
            snippet: item.snippet,
            summary: item.summary.slice(0, 900),
          })),
        },
  execute: async (ctx, input) => {
    const budgetFailure = consumeWebEvidenceBudget(ctx, 'search');
    if (budgetFailure) return budgetFailure;
    if (!webEvidenceCapabilities(ctx.webEvidence).search) {
      return {
        ok: false,
        error: 'Live web search is unavailable.',
        code: 'WEB_SEARCH_UNAVAILABLE',
        retryable: false,
      };
    }
    return ctx.webEvidence.search({
      query: input.query.trim(),
      count: input.count ?? 5,
      signal: ctx.signal,
    });
  },
});
