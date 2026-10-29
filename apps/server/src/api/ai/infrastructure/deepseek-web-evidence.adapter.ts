import { Injectable, Logger } from '@nestjs/common';
import {
  type WebEvidenceFailure,
  type WebEvidenceGateway,
  type WebFetchSuccess,
  type WebSearchItem,
  type WebSearchSuccess,
} from '../core/web-evidence.gateway';
import { getCoachUpstreamProvider } from '../core/coach-upstream.adapter';
import { parsePublicWebUrl } from '../core/web-evidence-url';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_FETCH_CONTENT_CHARS = 16_000;

function compact(value: unknown, maxChars: number): string {
  const text = String(value ?? '').trim();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function timeoutMs(): number {
  const configured = Number(process.env.DEEPSEEK_WEB_TOOL_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_TIMEOUT_MS;
}

function failureForStatus(status: number): WebEvidenceFailure {
  if (status === 400 || status === 403 || status === 404 || status === 413) {
    return {
      ok: false,
      error:
        'The web request was rejected. Revise the query or URL before retrying.',
      code: 'WEB_SEARCH_INVALID_REQUEST',
      retryable: false,
    };
  }
  if (status === 401) {
    return {
      ok: false,
      error: 'Live web search is not configured correctly.',
      code: 'WEB_SEARCH_UNAVAILABLE',
      retryable: false,
    };
  }
  if (status === 402) {
    return {
      ok: false,
      error:
        'Live web search is temporarily unavailable because the provider balance is exhausted.',
      code: 'WEB_SEARCH_PROVIDER_BALANCE_EXHAUSTED',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      ok: false,
      error: 'Live web search is rate limited. Try again later.',
      code: 'WEB_SEARCH_RATE_LIMITED',
      retryable: true,
    };
  }
  return {
    ok: false,
    error: 'Live web search is temporarily unavailable.',
    code: 'WEB_SEARCH_TEMPORARILY_UNAVAILABLE',
    retryable: status === 408 || status === 504 || status >= 500,
  };
}

async function readBodyWithLimit(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<string | null> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = '';
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(part.value, { stream: true });
  }
  body += decoder.decode();
  return body;
}

function normalizeSearchItem(value: unknown): WebSearchItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const parsedUrl = parsePublicWebUrl(String(item.url ?? ''));
  const title = compact(item.title, 500);
  if (!parsedUrl || !title) return null;

  const rawDate = compact(item.date, 80);
  const publishedAt =
    rawDate && Number.isFinite(Date.parse(rawDate))
      ? new Date(rawDate).toISOString()
      : null;
  return {
    title,
    url: parsedUrl.toString(),
    snippet: compact(item.snippet, 500),
    summary: compact(item.summary, 1_200),
    siteName: compact(item.site_name, 200) || null,
    publishedAt,
    authority: Math.max(-1, Math.min(4, finiteNumber(item.authority, -1))),
    rerankScore: Math.max(0, Math.min(3, finiteNumber(item.rerank_score, 0))),
  };
}

@Injectable()
export class DeepSeekWebEvidenceAdapter implements WebEvidenceGateway {
  private readonly logger = new Logger(DeepSeekWebEvidenceAdapter.name);

  isAvailable(): boolean {
    const selfHostSearchEnabled =
      !process.env.SELF_HOST_MODE?.trim() ||
      ['1', 'true', 'yes', 'on'].includes(
        String(process.env.AI_WEB_SEARCH_ENABLED ?? '')
          .trim()
          .toLowerCase(),
      );
    return (
      selfHostSearchEnabled &&
      getCoachUpstreamProvider() === 'deepseek' &&
      Boolean(process.env.DEEPSEEK_API_KEY?.trim())
    );
  }

  capabilities() {
    const available = this.isAvailable();
    return { search: available, fetch: available };
  }

  async search(args: {
    query: string;
    count: number;
    signal: AbortSignal;
  }): Promise<WebSearchSuccess | WebEvidenceFailure> {
    const query = args.query.trim();
    if (!query || [...query].length > 128) {
      return failureForStatus(400);
    }
    const count = Math.max(1, Math.min(8, Math.floor(args.count)));
    const response = await this.request(
      '/v1/tools/search',
      {
        query,
        count,
        need_content: false,
      },
      args.signal,
    );
    if (response.ok === false) return response;

    const results = Array.isArray(response.value.results)
      ? response.value.results
          .map(normalizeSearchItem)
          .filter((item): item is WebSearchItem => item !== null)
          .slice(0, count)
      : null;
    if (!results) {
      return {
        ok: false,
        error: 'The web search provider returned an invalid response.',
        code: 'WEB_SEARCH_RESPONSE_INVALID',
        retryable: true,
      };
    }
    return { ok: true, query, results };
  }

  async fetch(args: {
    url: string;
    signal: AbortSignal;
  }): Promise<WebFetchSuccess | WebEvidenceFailure> {
    const url = parsePublicWebUrl(args.url);
    if (!url) return failureForStatus(400);
    const response = await this.request(
      '/v1/tools/fetch',
      { url: url.toString() },
      args.signal,
    );
    if (response.ok === false) return response;

    if (
      typeof response.value.title !== 'string' ||
      typeof response.value.content !== 'string'
    ) {
      return {
        ok: false,
        error: 'The web fetch provider returned an invalid response.',
        code: 'WEB_SEARCH_RESPONSE_INVALID',
        retryable: true,
      };
    }
    const content = response.value.content.trim();
    return {
      ok: true,
      url: url.toString(),
      title: compact(response.value.title, 500),
      content: content.slice(0, MAX_FETCH_CONTENT_CHARS),
      truncated: content.length > MAX_FETCH_CONTENT_CHARS,
    };
  }

  private endpoint(path: string): URL {
    const base =
      process.env.DEEPSEEK_WEB_BASE_URL?.trim() ||
      process.env.DEEPSEEK_BASE_URL?.trim() ||
      'https://api.deepseek.com';
    return new URL(path, `${base.replace(/\/+$/, '')}/`);
  }

  private async request(
    path: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<
    { ok: true; value: Record<string, unknown> } | WebEvidenceFailure
  > {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!this.isAvailable() || !apiKey) {
      return {
        ok: false,
        error: 'Live web search is unavailable.',
        code: 'WEB_SEARCH_UNAVAILABLE',
        retryable: false,
      };
    }

    try {
      const response = await globalThis.fetch(this.endpoint(path), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs())]),
      });
      if (!response.ok) {
        this.logger.warn(
          `[AI][WebEvidence] DeepSeek request failed path=${path} status=${response.status}`,
        );
        return failureForStatus(response.status);
      }
      const raw = await readBodyWithLimit(response);
      if (raw === null) {
        return {
          ok: false,
          error: 'The web search provider returned an oversized response.',
          code: 'WEB_SEARCH_RESPONSE_INVALID',
          retryable: false,
        };
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('response is not an object');
      }
      return { ok: true, value: parsed as Record<string, unknown> };
    } catch (error) {
      if (signal.aborted) throw error;
      this.logger.warn(
        `[AI][WebEvidence] DeepSeek request error path=${path} reason=${
          error instanceof Error ? error.name : 'unknown'
        }`,
      );
      return {
        ok: false,
        error: 'Live web search is temporarily unavailable.',
        code: 'WEB_SEARCH_TEMPORARILY_UNAVAILABLE',
        retryable: true,
      };
    }
  }
}
