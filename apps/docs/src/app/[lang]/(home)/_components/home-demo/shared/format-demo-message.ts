export function formatDemoMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (token, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : token,
  );
}
