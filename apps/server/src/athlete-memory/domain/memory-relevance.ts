const TOKENS = /[\p{L}\p{N}_-]+/gu;

function words(value: string) {
  return new Set((value.toLowerCase().match(TOKENS) ?? []).filter(Boolean));
}

export function lexicalRelevance(query: string, ...values: string[]) {
  const q = words(query);
  if (q.size === 0) return 0.5;
  const haystack = words(values.join(' '));
  let matched = 0;
  for (const token of q) if (haystack.has(token)) matched += 1;
  return matched / q.size;
}
