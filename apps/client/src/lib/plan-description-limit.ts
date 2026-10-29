/** 计划描述富文本在保存与校验时按「纯文本」计数字数（去标签、合并空白） */
export const PLAN_DESCRIPTION_MAX_CHARS = 1000;

export function planDescriptionTextLength(html: string): number {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 0;
  return Array.from(text).length;
}

export function isPlanDescriptionWithinLimit(html: string): boolean {
  return planDescriptionTextLength(html) <= PLAN_DESCRIPTION_MAX_CHARS;
}

/** Mobile uses a plain textarea, so existing rich HTML needs a readable text value. */
export function planDescriptionToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li(?:\s[^>]*)?>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:0*39|x0*27);/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
