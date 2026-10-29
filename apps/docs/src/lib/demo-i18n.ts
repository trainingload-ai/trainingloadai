/** 营销页 DEMO 文案解析：与 HomeProductDemo 一致，按 lang 取 copy，缺失则 fallback。 */
export function resolveDemoCopy<T extends Record<string, unknown>>(
  map: T,
  lang: string,
  fallback: keyof T & string = "en" as keyof T & string,
): T[keyof T] {
  if (lang in map) {
    return map[lang as keyof T];
  }
  return map[fallback];
}
