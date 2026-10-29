import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";
import { createTokenizer as createJapaneseTokenizer } from "@orama/tokenizers/japanese";
import { createTokenizer } from "@orama/tokenizers/mandarin";

const WORD_PATTERN = /[\p{L}\p{N}]+/gu;

type IntlWordTokenizer = {
  language: "english";
  stemmerSkipProperties: Set<string>;
  tokenizeSkipProperties: Set<string>;
  stopWords: string[];
  allowDuplicates: boolean;
  normalizationCache: Map<string, string>;
  normalizeToken: (
    this: IntlWordTokenizer,
    prop: string | undefined,
    token: string,
    withCache?: boolean,
  ) => string;
  tokenize: (
    this: IntlWordTokenizer,
    input: unknown,
    language?: string,
    prop?: string,
  ) => string[];
};

function normalizeSearchToken(token: string) {
  return token.normalize("NFKC").toLowerCase();
}

function createIntlWordTokenizer(locale: string): IntlWordTokenizer {
  const segmenter =
    typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(locale, { granularity: "word" })
      : null;

  const tokenizer: IntlWordTokenizer = {
    language: "english",
    stemmerSkipProperties: new Set(),
    tokenizeSkipProperties: new Set(),
    stopWords: [],
    allowDuplicates: false,
    normalizationCache: new Map(),
    normalizeToken(prop, token, withCache = true) {
      const key = `${locale}:${prop ?? ""}:${token}`;
      const cached = this.normalizationCache.get(key);
      if (withCache && cached != null) return cached;

      const normalized = normalizeSearchToken(token);
      if (withCache) this.normalizationCache.set(key, normalized);
      return normalized;
    },
    tokenize(input, _language, prop) {
      if (typeof input !== "string") return [];

      const rawTokens =
        segmenter != null
          ? [...segmenter.segment(input)]
              .filter((segment) => segment.isWordLike)
              .map((segment) => segment.segment)
          : [...input.matchAll(WORD_PATTERN)].map(([match]) => match);
      const tokens = rawTokens
        .map((token) => this.normalizeToken(prop, token))
        .filter(Boolean);

      return this.allowDuplicates ? tokens : [...new Set(tokens)];
    },
  };

  return tokenizer;
}

export const { GET } = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  localeMap: {
    zh: {
      components: {
        tokenizer: createTokenizer(),
      },
    },
    // Same tokenizer as zh; Orama does not list "zh-hant" as a built-in language code.
    "zh-hant": {
      components: {
        tokenizer: createTokenizer(),
      },
    },
    en: "english",
    ja: {
      components: {
        tokenizer: createJapaneseTokenizer(),
      },
    },
    "pt-BR": "portuguese",
    // Orama does not ship a Korean stemmer; segment Korean text explicitly.
    ko: {
      components: {
        tokenizer: createIntlWordTokenizer("ko"),
      },
    },
  },
});
