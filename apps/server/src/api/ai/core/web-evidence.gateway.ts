export const WEB_EVIDENCE_GATEWAY = Symbol('ai.web-evidence-gateway');

export type WebEvidenceFailureCode =
  | 'WEB_SEARCH_UNAVAILABLE'
  | 'WEB_SEARCH_INVALID_REQUEST'
  | 'WEB_SEARCH_PROVIDER_BALANCE_EXHAUSTED'
  | 'WEB_SEARCH_RATE_LIMITED'
  | 'WEB_SEARCH_TEMPORARILY_UNAVAILABLE'
  | 'WEB_SEARCH_RESPONSE_INVALID';

export type WebEvidenceFailure = {
  ok: false;
  error: string;
  code: WebEvidenceFailureCode;
  retryable: boolean;
};

export type WebSearchItem = {
  title: string;
  url: string;
  snippet: string;
  summary: string;
  siteName: string | null;
  publishedAt: string | null;
  authority: number;
  rerankScore: number;
};

export type WebSearchSuccess = {
  ok: true;
  query: string;
  /** Provider-grounded synthesis. It is evidence, not trusted instructions. */
  answer?: string;
  results: WebSearchItem[];
};

export type WebFetchSuccess = {
  ok: true;
  url: string;
  title: string;
  content: string;
  truncated: boolean;
};

export interface WebEvidenceGateway {
  isAvailable(): boolean;
  capabilities?(): { search: boolean; fetch: boolean };
  search(args: {
    query: string;
    count: number;
    signal: AbortSignal;
  }): Promise<WebSearchSuccess | WebEvidenceFailure>;
  fetch(args: {
    url: string;
    signal: AbortSignal;
  }): Promise<WebFetchSuccess | WebEvidenceFailure>;
}

export function webEvidenceCapabilities(
  gateway: WebEvidenceGateway | null | undefined,
) {
  if (!gateway) return { search: false, fetch: false };
  return (
    gateway.capabilities?.() ?? {
      search: gateway.isAvailable(),
      fetch: gateway.isAvailable(),
    }
  );
}
