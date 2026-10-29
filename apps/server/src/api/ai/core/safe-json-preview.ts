/** 日志用 JSON 预览：超长截断，不可序列化时返回占位。 */
export function safeJsonPreview(value: unknown, maxChars = 1500): string {
  try {
    const s = JSON.stringify(value);
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars)}...(len=${s.length})`;
  } catch (e) {
    return `<<unserializable:${String(e)}>>`;
  }
}

export function previewTextForLog(value: unknown, max = 700): string {
  const text =
    typeof value === 'string' ? value : safeJsonPreview(value, max + 100);
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...(len=${compact.length})`;
}
