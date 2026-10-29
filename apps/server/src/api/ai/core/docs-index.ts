export type CoachDocPage = {
  id: string;
  locale: 'zh' | 'en';
  slug: string;
  title: string;
  description?: string;
  keywords: string[];
  body: string;
  url: string;
  sourcePath: string;
};

const DOCS_BASE_URL =
  process.env.AI_DOCS_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  'http://127.0.0.1:3000';

function normalizeBaseUrl() {
  return DOCS_BASE_URL.replace(/\/+$/, '');
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string) {
  return normalizeText(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

function toAbsoluteUrl(url: string, locale: 'zh' | 'en') {
  const base = normalizeBaseUrl();
  const raw = String(url ?? '').trim();
  if (!raw) return `${base}/${locale}/docs`;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/${locale}/docs/${raw.replace(/^\/+/, '')}`;
}

function toDocId(url: string) {
  return String(url ?? '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\/+$/, '');
}

function toSlug(url: string) {
  const stripped = toDocId(url);
  return stripped.replace(/^\/(zh|en)\/docs\/?/, '');
}

function flattenHighlights(value: unknown) {
  if (!Array.isArray(value)) return '';
  return normalizeText(
    value
      .map((part) => {
        const rec =
          part && typeof part === 'object'
            ? (part as Record<string, unknown>)
            : null;
        return String(rec?.content ?? '');
      })
      .join(''),
  );
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'trainingload-ai-coach/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(
      `Docs search request failed: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as unknown;
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'trainingload-ai-coach/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(
      `Docs page request failed: ${res.status} ${res.statusText}`,
    );
  }
  return await res.text();
}

function extractMeta(html: string, key: 'title' | 'description') {
  if (key === 'title') {
    return html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();
  }
  return html
    .match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]
    ?.trim();
}

function extractMainContent(html: string) {
  const article =
    html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i)?.[1] ??
    html;
  return stripHtml(article);
}

export async function searchCoachDocs(args: {
  query: string;
  locale: 'zh' | 'en';
  topK: number;
  section?: string;
}) {
  const searchUrl = new URL('/api/search', normalizeBaseUrl());
  searchUrl.searchParams.set('query', args.query);
  searchUrl.searchParams.set('locale', args.locale);

  const raw = await fetchJson(searchUrl.toString());
  const items = Array.isArray(raw) ? raw : [];
  const section = normalizeText(String(args.section ?? ''))
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();

  const grouped = new Map<
    string,
    {
      id: string;
      title: string;
      description?: string;
      url: string;
      slug: string;
      score: number;
      snippet: string;
      sourcePath: string;
      type: string;
    }
  >();

  for (const rawItem of items) {
    const item =
      rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem)
        ? (rawItem as {
            url?: unknown;
            content?: unknown;
            contentWithHighlights?: unknown;
            type?: unknown;
          })
        : {};
    const absoluteUrl = toAbsoluteUrl(String(item.url ?? ''), args.locale);
    const slug = toSlug(absoluteUrl);
    if (section && !slug.toLowerCase().startsWith(section)) continue;

    const key = absoluteUrl.replace(/\/+$/, '');
    const existing = grouped.get(key);
    const content = normalizeText(String(item.content ?? ''));
    const highlight = flattenHighlights(item.contentWithHighlights);
    const scoreBoost =
      item.type === 'page' ? 50 : item.type === 'heading' ? 20 : 5;

    if (!existing) {
      grouped.set(key, {
        id: toDocId(absoluteUrl),
        title:
          item?.type === 'page' ? content : slug.split('/').at(-1) || content,
        description: item?.type === 'page' ? highlight || content : undefined,
        url: absoluteUrl,
        slug,
        score: scoreBoost,
        snippet: item?.type === 'page' ? '' : highlight || content,
        sourcePath: absoluteUrl,
        type: String(item?.type ?? ''),
      });
      continue;
    }

    existing.score += scoreBoost;
    if (item?.type === 'page') {
      existing.title = content || existing.title;
      existing.description = highlight || content || existing.description;
    } else if (!existing.snippet) {
      existing.snippet = highlight || content;
    }
  }

  return [...grouped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, args.topK)
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      url: item.url,
      slug: item.slug,
      score: item.score,
      snippet: item.snippet || item.description || item.title,
      sourcePath: item.sourcePath,
    }));
}

export async function getCoachDocByRef(args: {
  ref: string;
  locale?: 'zh' | 'en';
  maxChars?: number;
}) {
  const rawRef = String(args.ref ?? '').trim();
  if (!rawRef) throw new Error('Missing docs ref');

  const locale: 'zh' | 'en' =
    rawRef.startsWith('/zh/') ||
    rawRef.startsWith('zh:') ||
    args.locale === 'zh'
      ? 'zh'
      : 'en';

  let absoluteUrl = '';
  if (/^https?:\/\//i.test(rawRef)) {
    absoluteUrl = rawRef;
  } else if (rawRef.startsWith('/')) {
    absoluteUrl = `${normalizeBaseUrl()}${rawRef}`;
  } else if (rawRef.startsWith('zh:') || rawRef.startsWith('en:')) {
    const slug = rawRef.replace(/^(zh|en):/, '');
    absoluteUrl = `${normalizeBaseUrl()}/${locale}/docs/${slug.replace(/^\/+/, '')}`;
  } else if (rawRef.includes('/docs/')) {
    absoluteUrl = `${normalizeBaseUrl()}/${rawRef.replace(/^\/+/, '')}`;
  } else {
    absoluteUrl = `${normalizeBaseUrl()}/${locale}/docs/${rawRef.replace(/^\/+/, '')}`;
  }

  const html = await fetchText(absoluteUrl);
  const title =
    extractMeta(html, 'title') ||
    toSlug(absoluteUrl).split('/').at(-1) ||
    rawRef;
  const description = extractMeta(html, 'description');
  const content = extractMainContent(html);
  const maxChars = Math.max(
    500,
    Math.min(12000, Math.floor(args.maxChars ?? 4000)),
  );

  return {
    id: toDocId(absoluteUrl),
    locale,
    title,
    description,
    url: absoluteUrl,
    slug: toSlug(absoluteUrl),
    content: content.slice(0, maxChars),
    truncated: content.length > maxChars,
    sourcePath: absoluteUrl,
  };
}
