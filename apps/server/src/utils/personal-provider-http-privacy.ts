/** OAuth codes, credentials and route/health payloads must not enter access/error logs. */
export function isPersonalProviderPath(url: unknown): boolean {
  return /^\/api\/(?:garmin-personal|coros-mcp)(?:\/|$)/.test(String(url ?? '').split('?', 1)[0]);
}
export function personalProviderDiagnosticUrl(url: unknown): string {
  const text = String(url ?? '');
  return isPersonalProviderPath(text) ? text.split('?', 1)[0] : text;
}
